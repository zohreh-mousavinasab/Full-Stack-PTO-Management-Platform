from __future__ import annotations

import csv
import io
from datetime import date, datetime

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token, decode_token, hash_password
from app.db.session import Base, engine, get_db
from app.models import (
    AuditLog,
    Balance,
    Holiday,
    Notification,
    NotificationType,
    PTORequest,
    PTOType,
    Policy,
    RequestStatus,
    Role,
    Team,
    User,
)
from app.schemas import (
    BalanceAdjustment,
    BalanceRead,
    CalendarRead,
    CurrentUserRead,
    DashboardRead,
    DashboardStat,
    HealthRead,
    HolidayRead,
    LoginRequest,
    LoginResponse,
    MessageRead,
    NotificationsRead,
    NotificationRead,
    PTORequestAction,
    PTORequestCreate,
    PTORequestRead,
    PTORequestUpdate,
    PolicyCreate,
    PolicyRead,
    PolicyUpdate,
    ReadNotificationsRequest,
    TeamRead,
    UserCreate,
    UserRead,
    UserUpdate,
)
from app.services import (
    approval_stats,
    balance_csv_rows,
    build_conflict_summaries,
    authenticate_user,
    create_notification,
    ensure_balance,
    is_conflicting_request,
    log_audit,
    member_count,
    recalculate_balance_row,
    request_days,
    seed_database,
    update_pending_balance,
    usage_csv_rows,
    usage_stats,
)

settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        seed_database(db)


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = decode_token(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc
    user = db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def get_current_user_optional(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = decode_token(token)
    except ValueError:
        return None
    user = db.get(User, payload["sub"])
    if not user or not user.is_active:
        return None
    return user


def to_user_read(user: User) -> UserRead:
    return UserRead(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        title=user.title,
        team_id=user.team_id,
        manager_id=user.manager_id,
        is_active=user.is_active,
        team_name=user.team.name if user.team else None,
        manager_name=user.manager.name if user.manager else None,
        created_at=user.created_at,
    )


def to_team_read(db: Session, team: Team) -> TeamRead:
    return TeamRead(
        id=team.id,
        name=team.name,
        manager_id=team.manager_id,
        policy_id=team.policy_id,
        member_count=member_count(db, team.id),
    )


def to_balance_read(balance: Balance) -> BalanceRead:
    return BalanceRead(
        user_id=balance.user_id,
        pto_type=balance.pto_type,
        available=round(balance.available, 2),
        accrued_ytd=round(balance.accrued_ytd, 2),
        pending=round(balance.pending, 2),
        user_name=balance.user.name if balance.user else None,
    )


def to_request_read(request: PTORequest) -> PTORequestRead:
    return PTORequestRead(
        id=request.id,
        user_id=request.user_id,
        team_id=request.team_id,
        pto_type=request.pto_type,
        start_date=request.start_date,
        end_date=request.end_date,
        status=request.status,
        submitted_at=request.submitted_at,
        reviewed_by=request.reviewed_by,
        reviewed_at=request.reviewed_at,
        reason=request.reason,
        approver_note=request.approver_note,
        conflict=request.conflict,
        user_name=request.user.name if request.user else "",
        team_name=request.team.name if request.team else None,
    )


def to_policy_read(policy: Policy) -> PolicyRead:
    return PolicyRead(
        id=policy.id,
        name=policy.name,
        pto_type=policy.pto_type,
        accrual_rate=policy.accrual_rate,
        accrual_frequency=policy.accrual_frequency,
        carryover_cap=policy.carryover_cap,
        max_balance=policy.max_balance,
        active=policy.active,
        created_at=policy.created_at,
        updated_at=policy.updated_at,
    )


def to_notification_read(notification: Notification) -> NotificationRead:
    return NotificationRead(
        id=notification.id,
        user_id=notification.user_id,
        type=notification.type,
        message=notification.message,
        is_read=notification.is_read,
        created_at=notification.created_at,
        metadata=notification.meta or {},
        user_name=notification.user.name if notification.user else None,
    )


@app.get("/health", response_model=HealthRead)
def health() -> HealthRead:
    return HealthRead(status="ok", service=settings.app_name)


@app.get("/me", response_model=CurrentUserRead)
def read_me(current_user: User = Depends(get_current_user)) -> CurrentUserRead:
    return CurrentUserRead.model_validate(current_user)


@app.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(user.id, user.role.value)
    return LoginResponse(access_token=token, user=to_user_read(user))


@app.post("/auth/logout", response_model=MessageRead)
def logout() -> MessageRead:
    return MessageRead(message="Logged out")


@app.post("/auth/forgot-password", response_model=MessageRead)
def forgot_password(payload: dict, db: Session = Depends(get_db)) -> MessageRead:
    email = payload.get("email")
    user = db.query(User).filter(User.email == email).first()
    if user:
        create_notification(
            db,
            user_id=user.id,
            kind=NotificationType.reminder,
            message="Password reset instructions were requested for your account.",
        )
        db.commit()
    return MessageRead(message="If the email exists, reset instructions were prepared.")


@app.get("/teams", response_model=list[TeamRead])
def list_teams(db: Session = Depends(get_db)) -> list[TeamRead]:
    teams = db.query(Team).order_by(Team.name.asc()).all()
    return [to_team_read(db, team) for team in teams]


@app.get("/users", response_model=list[UserRead])
def list_users(
    role: Role | None = Query(default=None),
    team_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[UserRead]:
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if team_id:
        query = query.filter(User.team_id == team_id)
    users = query.order_by(User.name.asc()).all()
    return [to_user_read(user) for user in users]


@app.get("/users/{user_id}", response_model=UserRead)
def get_user(user_id: str, db: Session = Depends(get_db)) -> UserRead:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return to_user_read(user)


@app.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> UserRead:
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")
    user = User(
        name=payload.name,
        email=payload.email,
        role=payload.role,
        title=payload.title,
        team_id=payload.team_id,
        manager_id=payload.manager_id,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_audit(db, actor_id=None, action="create", entity="user", entity_id=user.id)
    db.commit()
    return to_user_read(user)


@app.patch("/users/{user_id}", response_model=UserRead)
def update_user(user_id: str, payload: UserUpdate, db: Session = Depends(get_db)) -> UserRead:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "password":
            user.password_hash = hash_password(value)
        else:
            setattr(user, field, value)
    db.commit()
    db.refresh(user)
    log_audit(db, actor_id=None, action="update", entity="user", entity_id=user.id)
    db.commit()
    return to_user_read(user)


@app.get("/balances", response_model=list[BalanceRead])
def list_balances(db: Session = Depends(get_db)) -> list[BalanceRead]:
    balances = db.query(Balance).order_by(Balance.user_id.asc(), Balance.pto_type.asc()).all()
    return [to_balance_read(balance) for balance in balances]


@app.get("/balances/{user_id}", response_model=list[BalanceRead])
def get_balances(user_id: str, db: Session = Depends(get_db)) -> list[BalanceRead]:
    balances = db.query(Balance).filter(Balance.user_id == user_id).all()
    return [to_balance_read(balance) for balance in balances]


@app.post("/balances/adjust", response_model=BalanceRead)
def adjust_balance(payload: BalanceAdjustment, db: Session = Depends(get_db)) -> BalanceRead:
    balance = ensure_balance(db, payload.user_id, payload.pto_type)
    balance.available = max(balance.available + payload.amount, 0)
    balance.accrued_ytd = max(balance.accrued_ytd + payload.amount, 0)
    db.commit()
    db.refresh(balance)
    log_audit(
        db,
        actor_id=None,
        action="adjust",
        entity="balance",
        entity_id=balance.id,
        details={"reason": payload.reason, "amount": payload.amount},
    )
    db.commit()
    return to_balance_read(balance)


@app.get("/policies", response_model=list[PolicyRead])
def list_policies(db: Session = Depends(get_db)) -> list[PolicyRead]:
    return [to_policy_read(policy) for policy in db.query(Policy).all()]


@app.post("/policies", response_model=PolicyRead, status_code=status.HTTP_201_CREATED)
def create_policy(payload: PolicyCreate, db: Session = Depends(get_db)) -> PolicyRead:
    policy = Policy(**payload.model_dump())
    db.add(policy)
    db.commit()
    db.refresh(policy)
    log_audit(db, actor_id=None, action="create", entity="policy", entity_id=policy.id)
    db.commit()
    return to_policy_read(policy)


@app.patch("/policies/{policy_id}", response_model=PolicyRead)
def update_policy(policy_id: str, payload: PolicyUpdate, db: Session = Depends(get_db)) -> PolicyRead:
    policy = db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(policy, field, value)
    policy.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(policy)
    log_audit(db, actor_id=None, action="update", entity="policy", entity_id=policy.id)
    db.commit()
    return to_policy_read(policy)


@app.get("/pto-requests", response_model=list[PTORequestRead])
def list_requests(
    user_id: str | None = Query(default=None),
    status_filter: RequestStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
) -> list[PTORequestRead]:
    query = db.query(PTORequest)
    if user_id:
        query = query.filter(PTORequest.user_id == user_id)
    if status_filter:
        query = query.filter(PTORequest.status == status_filter)
    requests = query.order_by(PTORequest.submitted_at.desc()).all()
    return [to_request_read(request) for request in requests]


@app.post("/pto-requests", response_model=PTORequestRead, status_code=status.HTTP_201_CREATED)
def create_request(payload: PTORequestCreate, db: Session = Depends(get_db)) -> PTORequestRead:
    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")
    days = request_days(db, payload.start_date, payload.end_date)
    if days <= 0:
        raise HTTPException(status_code=400, detail="Selected range contains no working days")
    balance = ensure_balance(db, payload.user_id, payload.pto_type)
    conflict = is_conflicting_request(db, user, payload.start_date, payload.end_date)
    if payload.pto_type != PTOType.unpaid and balance.available < days:
        raise HTTPException(status_code=400, detail="Insufficient balance for request")
    request = PTORequest(
        user_id=payload.user_id,
        team_id=user.team_id,
        pto_type=payload.pto_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=RequestStatus.pending,
        reason=payload.reason,
        conflict=conflict,
    )
    db.add(request)
    db.flush()
    update_pending_balance(db, payload.user_id, payload.pto_type, days)
    create_notification(
        db,
        user_id=user.manager_id or payload.user_id,
        kind=NotificationType.request,
        message=f"{user.name} submitted a {payload.pto_type.value} request.",
        metadata={"request_id": request.id},
    )
    if conflict:
        recipients = {payload.user_id}
        if user.manager_id:
            recipients.add(user.manager_id)
        for recipient_id in recipients:
            create_notification(
                db,
                user_id=recipient_id,
                kind=NotificationType.reminder,
                message=f"Conflict detected for {user.name}'s {payload.pto_type.value} request.",
                metadata={"request_id": request.id, "conflict": True},
            )
    log_audit(
        db,
        actor_id=payload.user_id,
        action="create",
        entity="pto_request",
        entity_id=request.id,
        details={"days": days, "conflict": conflict},
    )
    db.commit()
    db.refresh(request)
    return to_request_read(request)


@app.patch("/pto-requests/{request_id}", response_model=PTORequestRead)
def update_request(
    request_id: str, payload: PTORequestUpdate, db: Session = Depends(get_db)
) -> PTORequestRead:
    request = db.get(PTORequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(request, field, value)
    db.commit()
    db.refresh(request)
    log_audit(db, actor_id=None, action="update", entity="pto_request", entity_id=request.id)
    db.commit()
    return to_request_read(request)


@app.post("/pto-requests/{request_id}/approve", response_model=PTORequestRead)
def approve_request(
    request_id: str, payload: PTORequestAction, db: Session = Depends(get_db)
) -> PTORequestRead:
    request = db.get(PTORequest, request_id)
    reviewer = db.get(User, payload.reviewer_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    if request.status != RequestStatus.pending:
        raise HTTPException(status_code=400, detail="Only pending requests can be approved")
    if not reviewer:
        raise HTTPException(status_code=404, detail="Reviewer not found")
    days = request_days(db, request.start_date, request.end_date)
    balance = ensure_balance(db, request.user_id, request.pto_type)
    balance.available = max(balance.available - days, 0)
    balance.pending = max(balance.pending - days, 0)
    request.status = RequestStatus.approved
    request.reviewed_by = reviewer.id
    request.reviewed_at = datetime.utcnow()
    request.approver_note = payload.note
    create_notification(
        db,
        user_id=request.user_id,
        kind=NotificationType.approval,
        message=f"Your {request.pto_type.value} request was approved.",
        metadata={"request_id": request.id},
    )
    log_audit(
        db,
        actor_id=reviewer.id,
        action="approve",
        entity="pto_request",
        entity_id=request.id,
        details={"days": days},
    )
    db.commit()
    db.refresh(request)
    return to_request_read(request)


@app.post("/pto-requests/{request_id}/reject", response_model=PTORequestRead)
def reject_request(
    request_id: str, payload: PTORequestAction, db: Session = Depends(get_db)
) -> PTORequestRead:
    request = db.get(PTORequest, request_id)
    reviewer = db.get(User, payload.reviewer_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    if request.status != RequestStatus.pending:
        raise HTTPException(status_code=400, detail="Only pending requests can be rejected")
    if not reviewer:
        raise HTTPException(status_code=404, detail="Reviewer not found")
    days = request_days(db, request.start_date, request.end_date)
    update_pending_balance(db, request.user_id, request.pto_type, -days)
    request.status = RequestStatus.rejected
    request.reviewed_by = reviewer.id
    request.reviewed_at = datetime.utcnow()
    request.approver_note = payload.note
    create_notification(
        db,
        user_id=request.user_id,
        kind=NotificationType.approval,
        message=f"Your {request.pto_type.value} request was rejected.",
        metadata={"request_id": request.id},
    )
    log_audit(
        db,
        actor_id=reviewer.id,
        action="reject",
        entity="pto_request",
        entity_id=request.id,
        details={"days": days},
    )
    db.commit()
    db.refresh(request)
    return to_request_read(request)


@app.post("/pto-requests/{request_id}/cancel", response_model=PTORequestRead)
def cancel_request(
    request_id: str, payload: PTORequestAction, db: Session = Depends(get_db)
) -> PTORequestRead:
    request = db.get(PTORequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    if request.status not in {RequestStatus.pending, RequestStatus.approved}:
        raise HTTPException(status_code=400, detail="Request cannot be cancelled")
    days = request_days(db, request.start_date, request.end_date)
    if request.status == RequestStatus.approved:
        balance = ensure_balance(db, request.user_id, request.pto_type)
        balance.available += days
        balance.adjusted_at = datetime.utcnow()
    else:
        update_pending_balance(db, request.user_id, request.pto_type, -days)
    request.status = RequestStatus.cancelled
    request.reviewed_by = payload.reviewer_id
    request.reviewed_at = datetime.utcnow()
    request.approver_note = payload.note
    create_notification(
        db,
        user_id=request.user_id,
        kind=NotificationType.request,
        message=f"Your {request.pto_type.value} request was cancelled.",
        metadata={"request_id": request.id},
    )
    log_audit(
        db,
        actor_id=payload.reviewer_id,
        action="cancel",
        entity="pto_request",
        entity_id=request.id,
        details={"days": days},
    )
    db.commit()
    db.refresh(request)
    return to_request_read(request)


@app.get("/calendar", response_model=CalendarRead)
def calendar(
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> CalendarRead:
    start = start or date.today().replace(day=1)
    end = end or date(date.today().year, 12, 31)
    requests = (
        db.query(PTORequest)
        .filter(PTORequest.start_date <= end, PTORequest.end_date >= start)
        .order_by(PTORequest.start_date.asc())
        .all()
    )
    holidays = db.query(Holiday).filter(Holiday.day.between(start, end)).all()
    return CalendarRead(
        holidays=[HolidayRead(id=holiday.id, day=holiday.day, title=holiday.title) for holiday in holidays],
        requests=[to_request_read(request) for request in requests],
    )


@app.get("/conflicts", response_model=list[dict])
def list_conflicts(
    user_id: str | None = Query(default=None),
    team_id: str | None = Query(default=None),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[dict]:
    query = db.query(PTORequest).filter(
        PTORequest.status.in_([RequestStatus.pending, RequestStatus.approved])
    )
    if user_id:
        query = query.filter(PTORequest.user_id == user_id)
    if team_id:
        query = query.filter(PTORequest.team_id == team_id)
    if start:
        query = query.filter(PTORequest.end_date >= start)
    if end:
        query = query.filter(PTORequest.start_date <= end)
    requests = query.order_by(PTORequest.start_date.asc()).all()
    return build_conflict_summaries(requests)


@app.get("/reports/usage", response_model=list[dict])
def report_usage(db: Session = Depends(get_db)) -> list[dict]:
    return usage_stats(db.query(PTORequest).all())


@app.get("/reports/balances", response_model=list[dict])
def report_balances(db: Session = Depends(get_db)) -> list[dict]:
    rows = (
        db.query(User.name, Balance.pto_type, Balance.available, Balance.pending)
        .join(Balance, Balance.user_id == User.id)
        .all()
    )
    return [
        {
            "user": name,
            "pto_type": pto_type.value,
            "available": round(available, 2),
            "pending": round(pending, 2),
        }
        for name, pto_type, available, pending in rows
    ]


@app.get("/reports/approvals", response_model=list[dict])
def report_approvals(db: Session = Depends(get_db)) -> list[dict]:
    return approval_stats(db.query(PTORequest).all())


@app.get("/notifications/unread-count", response_model=dict)
def unread_notifications_count(
    user_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(Notification).filter(Notification.is_read.is_(False))
    if user_id:
        query = query.filter(Notification.user_id == user_id)
    return {"count": query.count()}


@app.get("/audit-logs", response_model=list[dict])
def list_audit_logs(db: Session = Depends(get_db)) -> list[dict]:
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(100).all()
    return [
        {
            "id": log.id,
            "actor": log.actor.name if log.actor else None,
            "action": log.action,
            "entity": log.entity,
            "entity_id": log.entity_id,
            "created_at": log.created_at,
            "details": log.details or {},
        }
        for log in logs
    ]


@app.get("/notifications", response_model=NotificationsRead)
def list_notifications(
    user_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> NotificationsRead:
    query = db.query(Notification)
    if user_id:
        query = query.filter(Notification.user_id == user_id)
    notifications = query.order_by(Notification.created_at.desc()).all()
    return NotificationsRead(
        notifications=[to_notification_read(notification) for notification in notifications]
    )


@app.post("/notifications/read", response_model=NotificationsRead)
def mark_notifications_read(
    payload: ReadNotificationsRequest, db: Session = Depends(get_db)
) -> NotificationsRead:
    if payload.notification_ids:
        db.query(Notification).filter(Notification.id.in_(payload.notification_ids)).update(
            {Notification.is_read: True}, synchronize_session=False
        )
        db.commit()
    return NotificationsRead(
        notifications=[to_notification_read(notification) for notification in db.query(Notification).order_by(Notification.created_at.desc()).all()]
    )


@app.get("/exports/{export_name}")
def export_csv(
    export_name: str,
    db: Session = Depends(get_db),
) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    if export_name == "usage":
        writer.writerow(["label", "days"])
        for row in usage_csv_rows(db.query(PTORequest).all()):
            writer.writerow([row["label"], row["days"]])
    elif export_name == "balances":
        writer.writerow(["user", "pto_type", "available", "pending"])
        rows = (
            db.query(User.name, Balance.pto_type, Balance.available, Balance.pending)
            .join(Balance, Balance.user_id == User.id)
            .all()
        )
        for row in balance_csv_rows(rows):
            writer.writerow([row["user"], row["pto_type"], row["available"], row["pending"]])
    elif export_name == "approvals":
        writer.writerow(["label", "count"])
        for row in approval_stats(db.query(PTORequest).all()):
            writer.writerow([row["label"], row["count"]])
    elif export_name == "audit-logs":
        writer.writerow(["actor", "action", "entity", "entity_id", "created_at", "details"])
        logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).all()
        for log in logs:
            writer.writerow(
                [
                    log.actor.name if log.actor else "",
                    log.action,
                    log.entity,
                    log.entity_id,
                    log.created_at.isoformat(),
                    log.details or {},
                ]
            )
    else:
        raise HTTPException(status_code=404, detail="Unknown export")

    content = buffer.getvalue()
    filename = f"{export_name}.csv"
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/dashboard", response_model=DashboardRead)
def dashboard(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
) -> DashboardRead:
    current_user = current_user or db.query(User).order_by(User.name.asc()).first()
    if not current_user:
        raise HTTPException(status_code=404, detail="No users found")
    users = db.query(User).order_by(User.name.asc()).all()
    teams = db.query(Team).order_by(Team.name.asc()).all()
    policies = db.query(Policy).order_by(Policy.name.asc()).all()
    balances = db.query(Balance).order_by(Balance.available.desc()).all()
    requests = db.query(PTORequest).order_by(PTORequest.submitted_at.desc()).all()
    holidays = db.query(Holiday).order_by(Holiday.day.asc()).all()
    notifications = db.query(Notification).order_by(Notification.created_at.desc()).limit(6).all()
    conflicts = build_conflict_summaries(
        db.query(PTORequest)
        .filter(PTORequest.status.in_([RequestStatus.pending, RequestStatus.approved]))
        .order_by(PTORequest.start_date.asc())
        .all()
    )
    audit_logs = (
        db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(8).all()
    )

    approved_days = sum(
        request_days(db, request.start_date, request.end_date)
        for request in requests
        if request.status == RequestStatus.approved
    )
    pending_requests = sum(1 for request in requests if request.status == RequestStatus.pending)
    team_out_today = sum(
        1
        for request in requests
        if request.status == RequestStatus.approved
        and request.start_date <= date.today() <= request.end_date
    )

    stats = [
        DashboardStat(label="Approved days", value=str(approved_days), tone="emerald"),
        DashboardStat(label="Pending requests", value=str(pending_requests), tone="amber"),
        DashboardStat(label="Team out today", value=str(team_out_today), tone="sky"),
        DashboardStat(label="Active users", value=str(len([user for user in users if user.is_active])), tone="violet"),
    ]

    return DashboardRead(
        user=to_user_read(current_user),
        stats=stats,
        balances=[to_balance_read(balance) for balance in balances],
        requests=[to_request_read(request) for request in requests],
        teams=[to_team_read(db, team) for team in teams],
        policies=[to_policy_read(policy) for policy in policies],
        holidays=[
            HolidayRead(id=holiday.id, day=holiday.day, title=holiday.title)
            for holiday in holidays
        ],
        notifications=[to_notification_read(notification) for notification in notifications],
        conflicts=conflicts,
        audit_logs=[
            {
                "id": log.id,
                "action": log.action,
                "entity": log.entity,
                "entity_id": log.entity_id,
                "created_at": log.created_at,
                "details": log.details or {},
            }
            for log in audit_logs
        ],
    )
