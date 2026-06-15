from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import AccrualFrequency, NotificationType, PTOType, RequestStatus, Role


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=4)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserRead"


class TokenRead(BaseModel):
    user_id: str
    role: Role


class UserBase(BaseModel):
    name: str
    email: EmailStr
    role: Role = Role.employee
    title: str = "Team Member"
    team_id: str | None = None
    manager_id: str | None = None


class UserCreate(UserBase):
    password: str = Field(min_length=4)


class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    role: Role | None = None
    title: str | None = None
    team_id: str | None = None
    manager_id: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=4)


class TeamRead(BaseModel):
    id: str
    name: str
    manager_id: str | None
    policy_id: str | None
    member_count: int


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_active: bool
    team_name: str | None = None
    manager_name: str | None = None
    created_at: datetime


class PTORequestCreate(BaseModel):
    user_id: str
    pto_type: PTOType
    start_date: date
    end_date: date
    reason: str = ""


class PTORequestUpdate(BaseModel):
    pto_type: PTOType | None = None
    start_date: date | None = None
    end_date: date | None = None
    reason: str | None = None
    status: RequestStatus | None = None
    approver_note: str | None = None


class PTORequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    team_id: str | None
    pto_type: PTOType
    start_date: date
    end_date: date
    status: RequestStatus
    submitted_at: datetime
    reviewed_by: str | None
    reviewed_at: datetime | None
    reason: str
    approver_note: str
    conflict: bool
    user_name: str
    team_name: str | None = None


class PTORequestAction(BaseModel):
    reviewer_id: str
    note: str = ""


class BalanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    pto_type: PTOType
    available: float
    accrued_ytd: float
    pending: float
    user_name: str | None = None


class BalanceAdjustment(BaseModel):
    user_id: str
    pto_type: PTOType
    amount: float
    reason: str = ""


class PolicyCreate(BaseModel):
    name: str
    pto_type: PTOType
    accrual_rate: float
    accrual_frequency: AccrualFrequency
    carryover_cap: float = 0
    max_balance: float = 0
    active: bool = True


class PolicyUpdate(BaseModel):
    name: str | None = None
    pto_type: PTOType | None = None
    accrual_rate: float | None = None
    accrual_frequency: AccrualFrequency | None = None
    carryover_cap: float | None = None
    max_balance: float | None = None
    active: bool | None = None


class PolicyRead(PolicyCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime


class HolidayRead(BaseModel):
    id: str
    day: date
    title: str


class CalendarRead(BaseModel):
    holidays: list[HolidayRead]
    requests: list[PTORequestRead]


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    type: NotificationType
    message: str
    is_read: bool
    created_at: datetime
    metadata: dict
    user_name: str | None = None


class NotificationsRead(BaseModel):
    notifications: list[NotificationRead]


class DashboardStat(BaseModel):
    label: str
    value: str
    tone: str


class DashboardRead(BaseModel):
    user: UserRead
    stats: list[DashboardStat]
    balances: list[BalanceRead]
    requests: list[PTORequestRead]
    teams: list[TeamRead]
    policies: list[PolicyRead]
    holidays: list[HolidayRead]
    notifications: list[NotificationRead]
    conflicts: list[dict]
    audit_logs: list[dict]


class ReportsRead(BaseModel):
    usage: list[dict]
    balances: list[dict]
    approvals: list[dict]


class ReadNotificationsRequest(BaseModel):
    notification_ids: list[str]


class MessageRead(BaseModel):
    message: str


class HealthRead(BaseModel):
    status: str
    service: str


class CurrentUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: EmailStr
    role: Role
    title: str
    team_id: str | None
    manager_id: str | None
    is_active: bool
    created_at: datetime


LoginResponse.model_rebuild()
