from __future__ import annotations

import enum
from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def uuid_str() -> str:
    return str(uuid4())


class Role(str, enum.Enum):
    employee = "employee"
    manager = "manager"
    hr_admin = "hr_admin"
    super_admin = "super_admin"


class PTOType(str, enum.Enum):
    vacation = "vacation"
    sick = "sick"
    personal = "personal"
    parental = "parental"
    unpaid = "unpaid"


class RequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"


class AccrualFrequency(str, enum.Enum):
    yearly = "yearly"
    monthly = "monthly"
    per_pay_period = "per_pay_period"


class NotificationType(str, enum.Enum):
    request = "request"
    approval = "approval"
    policy = "policy"
    reminder = "reminder"


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    manager_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    policy_id: Mapped[str | None] = mapped_column(ForeignKey("policies.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    manager: Mapped["User | None"] = relationship(
        "User", foreign_keys=[manager_id], lazy="joined"
    )
    members: Mapped[list["User"]] = relationship(
        "User", back_populates="team", foreign_keys="User.team_id"
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.employee)
    title: Mapped[str] = mapped_column(String(120), default="Team Member")
    team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id"))
    manager_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    team: Mapped["Team | None"] = relationship(
        "Team", back_populates="members", foreign_keys=[team_id], lazy="joined"
    )
    manager: Mapped["User | None"] = relationship(
        "User", remote_side=[id], foreign_keys=[manager_id], lazy="joined"
    )


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[str] = mapped_column(primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    pto_type: Mapped[PTOType] = mapped_column(Enum(PTOType), nullable=False)
    accrual_rate: Mapped[float] = mapped_column(Float, nullable=False)
    accrual_frequency: Mapped[AccrualFrequency] = mapped_column(
        Enum(AccrualFrequency), nullable=False
    )
    carryover_cap: Mapped[float] = mapped_column(Float, default=0.0)
    max_balance: Mapped[float] = mapped_column(Float, default=0.0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Balance(Base):
    __tablename__ = "balances"

    id: Mapped[str] = mapped_column(primary_key=True, default=uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    pto_type: Mapped[PTOType] = mapped_column(Enum(PTOType), nullable=False)
    available: Mapped[float] = mapped_column(Float, default=0.0)
    accrued_ytd: Mapped[float] = mapped_column(Float, default=0.0)
    pending: Mapped[float] = mapped_column(Float, default=0.0)
    adjusted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user: Mapped[User] = relationship("User", lazy="joined")


class PTORequest(Base):
    __tablename__ = "pto_requests"

    id: Mapped[str] = mapped_column(primary_key=True, default=uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id"))
    pto_type: Mapped[PTOType] = mapped_column(Enum(PTOType), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[RequestStatus] = mapped_column(
        Enum(RequestStatus), default=RequestStatus.pending
    )
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)
    reason: Mapped[str] = mapped_column(Text, default="")
    approver_note: Mapped[str] = mapped_column(Text, default="")
    conflict: Mapped[bool] = mapped_column(Boolean, default=False)
    user: Mapped[User] = relationship("User", foreign_keys=[user_id], lazy="joined")
    reviewer: Mapped[User | None] = relationship(
        "User", foreign_keys=[reviewed_by], lazy="joined"
    )
    team: Mapped[Team | None] = relationship("Team", lazy="joined")


class Holiday(Base):
    __tablename__ = "holidays"

    id: Mapped[str] = mapped_column(primary_key=True, default=uuid_str)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(primary_key=True, default=uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType), default=NotificationType.request
    )
    message: Mapped[str] = mapped_column(String(280), nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    user: Mapped[User] = relationship("User", lazy="joined")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(primary_key=True, default=uuid_str)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    entity: Mapped[str] = mapped_column(String(120), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    actor: Mapped[User | None] = relationship("User", lazy="joined")
