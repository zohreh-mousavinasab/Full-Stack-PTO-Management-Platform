from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models import (
    AccrualFrequency,
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


def business_days_between(start: date, end: date, holidays: set[date]) -> int:
    days = 0
    current = start
    while current <= end:
        if current.weekday() < 5 and current not in holidays:
            days += 1
        current += timedelta(days=1)
    return days


def request_overlaps(left: PTORequest, start: date, end: date) -> bool:
    return left.start_date <= end and start <= left.end_date


def build_conflict_summaries(requests: list[PTORequest]) -> list[dict]:
    summaries: list[dict] = []
    seen_pairs: set[tuple[str, str]] = set()

    for index, request in enumerate(requests):
        overlaps: list[dict] = []
        for other in requests[index + 1 :]:
            if not request_overlaps(request, other.start_date, other.end_date):
                continue
            pair = tuple(sorted((request.id, other.id)))
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            overlaps.append(
                {
                    "request_id": other.id,
                    "user_name": other.user.name if other.user else None,
                    "status": other.status.value,
                    "start_date": other.start_date,
                    "end_date": other.end_date,
                }
            )
        if overlaps:
            summaries.append(
                {
                    "request_id": request.id,
                    "user_name": request.user.name if request.user else None,
                    "status": request.status.value,
                    "pto_type": request.pto_type.value,
                    "start_date": request.start_date,
                    "end_date": request.end_date,
                    "conflicts": overlaps,
                }
            )
    return summaries


def log_audit(
    db: Session,
    *,
    actor_id: str | None,
    action: str,
    entity: str,
    entity_id: str,
    details: dict | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        details=details or {},
    )
    db.add(entry)
    return entry


def create_notification(
    db: Session,
    *,
    user_id: str,
    kind: NotificationType,
    message: str,
    metadata: dict | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        type=kind,
        message=message,
        meta=metadata or {},
    )
    db.add(notification)
    return notification


def recalculate_balance_row(db: Session, balance: Balance) -> Balance:
    policy = (
        db.query(Policy)
        .filter(Policy.pto_type == balance.pto_type, Policy.active.is_(True))
        .order_by(Policy.created_at.desc())
        .first()
    )
    if policy:
        balance.available = min(balance.available, policy.max_balance or balance.available)
    balance.adjusted_at = datetime.utcnow()
    return balance


def ensure_balance(db: Session, user_id: str, pto_type: PTOType) -> Balance:
    balance = (
        db.query(Balance)
        .filter(Balance.user_id == user_id, Balance.pto_type == pto_type)
        .first()
    )
    if balance:
        return balance
    balance = Balance(user_id=user_id, pto_type=pto_type, available=0, accrued_ytd=0, pending=0)
    db.add(balance)
    db.flush()
    return balance


def seed_database(db: Session) -> None:
    if db.query(User).count():
        return

    vacation_policy = Policy(
        name="Standard Vacation",
        pto_type=PTOType.vacation,
        accrual_rate=1.67,
        accrual_frequency=AccrualFrequency.monthly,
        carryover_cap=5,
        max_balance=30,
        active=True,
    )
    sick_policy = Policy(
        name="Health & Sick",
        pto_type=PTOType.sick,
        accrual_rate=1.0,
        accrual_frequency=AccrualFrequency.monthly,
        carryover_cap=0,
        max_balance=12,
        active=True,
    )
    personal_policy = Policy(
        name="Personal Days",
        pto_type=PTOType.personal,
        accrual_rate=0.5,
        accrual_frequency=AccrualFrequency.monthly,
        carryover_cap=0,
        max_balance=5,
        active=True,
    )
    db.add_all([vacation_policy, sick_policy, personal_policy])
    db.flush()

    users = [
        User(
            name="zohreh mousavi",
            email="zohreh@example.com",
            role=Role.employee,
            title="Product Designer",
            password_hash=hash_password("password123"),
        ),
        User(
            name="Liam Smith",
            email="liam@example.com",
            role=Role.manager,
            title="Engineering Manager",
            password_hash=hash_password("password123"),
        ),
        User(
            name="Maya Chen",
            email="maya@example.com",
            role=Role.hr_admin,
            title="HR Admin",
            password_hash=hash_password("password123"),
        ),
        User(
            name="Noah Patel",
            email="noah@example.com",
            role=Role.super_admin,
            title="Operations Lead",
            password_hash=hash_password("password123"),
        ),
    ]
    db.add_all(users)
    db.flush()

    teams = [
        Team(name="Product", manager_id=users[1].id, policy_id=vacation_policy.id),
        Team(name="Engineering", manager_id=users[1].id, policy_id=vacation_policy.id),
        Team(name="People Ops", manager_id=users[2].id, policy_id=personal_policy.id),
    ]
    db.add_all(teams)
    db.flush()

    users[0].team_id = teams[0].id
    users[0].manager_id = users[1].id
    users[1].team_id = teams[1].id
    users[2].team_id = teams[2].id
    users[3].team_id = teams[2].id
    db.flush()

    for user in users:
        for pto_type, available in (
            (PTOType.vacation, 18.5 if user.role == Role.employee else 24),
            (PTOType.sick, 8),
            (PTOType.personal, 3),
        ):
            db.add(
                Balance(
                    user_id=user.id,
                    pto_type=pto_type,
                    available=available,
                    accrued_ytd=available,
                    pending=0,
                )
            )

    holidays = [
        Holiday(day=date(2026, 12, 25), title="Christmas Day"),
        Holiday(day=date(2026, 1, 1), title="New Year's Day"),
        Holiday(day=date(2026, 5, 25), title="Spring Bank Holiday"),
    ]
    db.add_all(holidays)
    db.flush()

    requests = [
        PTORequest(
            user_id=users[0].id,
            team_id=teams[0].id,
            pto_type=PTOType.vacation,
            start_date=date(2026, 5, 14),
            end_date=date(2026, 5, 18),
            status=RequestStatus.pending,
            reason="Trip with family",
            conflict=False,
        ),
        PTORequest(
            user_id=users[1].id,
            team_id=teams[1].id,
            pto_type=PTOType.personal,
            start_date=date(2026, 5, 21),
            end_date=date(2026, 5, 21),
            status=RequestStatus.approved,
            reason="Appointment",
            reviewed_by=users[3].id,
            reviewed_at=datetime.utcnow(),
            approver_note="Approved",
            conflict=False,
        ),
        PTORequest(
            user_id=users[0].id,
            team_id=teams[0].id,
            pto_type=PTOType.sick,
            start_date=date(2026, 5, 27),
            end_date=date(2026, 5, 29),
            status=RequestStatus.rejected,
            reason="Flu recovery",
            reviewed_by=users[2].id,
            reviewed_at=datetime.utcnow(),
            approver_note="Please reschedule",
            conflict=False,
        ),
    ]
    db.add_all(requests)
    db.flush()

    notifications = [
        Notification(
            user_id=users[0].id,
            type=NotificationType.request,
            message="Your vacation request is awaiting review.",
            meta={"request_id": requests[0].id},
        ),
        Notification(
            user_id=users[1].id,
            type=NotificationType.approval,
            message="Your personal day request was approved.",
            is_read=True,
            meta={"request_id": requests[1].id},
        ),
    ]
    db.add_all(notifications)

    log_audit(
        db,
        actor_id=users[3].id,
        action="seed_data",
        entity="system",
        entity_id="bootstrap",
        details={"users": len(users), "teams": len(teams)},
    )
    db.commit()


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = db.query(User).filter(User.email == email).first()
    if user and verify_password(password, user.password_hash):
        return user
    return None


def member_count(db: Session, team_id: str) -> int:
    return db.query(User).filter(User.team_id == team_id).count()


def is_conflicting_request(db: Session, user: User, start: date, end: date) -> bool:
    query = db.query(PTORequest).filter(
        PTORequest.status.in_([RequestStatus.pending, RequestStatus.approved]),
        or_(
            PTORequest.user_id == user.id,
            PTORequest.team_id == user.team_id if user.team_id else False,
        ),
    )
    for request in query.all():
        if request_overlaps(request, start, end):
            return True
    return False


def request_days(db: Session, start: date, end: date) -> int:
    holidays = {holiday.day for holiday in db.query(Holiday).all()}
    return business_days_between(start, end, holidays)


def update_pending_balance(db: Session, user_id: str, pto_type: PTOType, delta: float) -> Balance:
    balance = ensure_balance(db, user_id, pto_type)
    balance.pending = max(balance.pending + delta, 0)
    balance.adjusted_at = datetime.utcnow()
    db.flush()
    return balance


def approval_stats(requests: list[PTORequest]) -> list[dict]:
    counts = Counter(request.status for request in requests)
    return [
        {"label": status.value, "count": counts.get(status, 0)}
        for status in RequestStatus
    ]


def usage_stats(requests: list[PTORequest]) -> list[dict]:
    totals: defaultdict[str, float] = defaultdict(float)
    for request in requests:
        if request.status == RequestStatus.approved:
            totals[request.pto_type.value] += (request.end_date - request.start_date).days + 1
    return [{"label": label, "days": round(total, 1)} for label, total in totals.items()]


def usage_csv_rows(requests: list[PTORequest]) -> list[dict[str, str | float]]:
    return [
        {
            "label": item["label"],
            "days": item["days"],
        }
        for item in usage_stats(requests)
    ]


def balance_csv_rows(rows: list[tuple[str, PTOType, float, float]]) -> list[dict[str, str | float]]:
    return [
        {
            "user": name,
            "pto_type": pto_type.value,
            "available": round(available, 2),
            "pending": round(pending, 2),
        }
        for name, pto_type, available, pending in rows
    ]
