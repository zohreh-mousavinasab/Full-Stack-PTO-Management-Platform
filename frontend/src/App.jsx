import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gauge,
  LogOut,
  Menu,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react'
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useOutletContext,
} from 'react-router-dom'
import './App.css'
import { api, API_BASE } from './api'

const STORAGE_KEY = 'timely.pto.token'
const ROUTER_BASENAME = import.meta.env.BASE_URL
const DEMO_CREDENTIALS = {
  email: 'zohreh@example.com',
  password: 'password123',
}
const DEFAULT_REQUEST = {
  pto_type: 'vacation',
  start_date: '',
  end_date: '',
  reason: '',
}
const BACKEND_UNAVAILABLE_MESSAGE = 'Backend is currently unavailable. Some data may not be loaded.'
const FALLBACK_USER = {
  id: 0,
  name: 'Demo User',
  email: DEMO_CREDENTIALS.email,
  title: 'PTO workspace preview',
  role: 'employee',
  team_name: 'Offline mode',
}
const FALLBACK_DASHBOARD = {
  user: FALLBACK_USER,
  stats: [
    { label: 'Available PTO', value: '--', tone: 'sky' },
    { label: 'Pending requests', value: '--', tone: 'amber' },
    { label: 'Approved days', value: '--', tone: 'emerald' },
    { label: 'Team conflicts', value: '--', tone: 'rose' },
  ],
  requests: [],
  balances: [],
  notifications: [],
  conflicts: [],
  teams: [{ id: 0, name: 'Offline preview', member_count: 0 }],
  policies: [],
  audit_logs: [],
}
const FALLBACK_REPORTS = {
  usage: [],
  balances: [],
  approvals: [
    { label: 'pending', count: 0 },
    { label: 'approved', count: 0 },
    { label: 'rejected', count: 0 },
    { label: 'cancelled', count: 0 },
  ],
}

const navItems = [
  { to: '/', label: 'Dashboard', icon: Gauge },
  { to: '/requests', label: 'Requests', icon: Clock3 },
  { to: '/approvals', label: 'Approvals', icon: CheckCircle2 },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/reports', label: 'Reports', icon: Sparkles },
  { to: '/admin', label: 'Admin', icon: ShieldCheck },
]

const statusTone = {
  pending: 'amber',
  approved: 'emerald',
  rejected: 'rose',
  cancelled: 'slate',
}

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function formatRange(request) {
  return `${formatDate(request.start_date)} - ${formatDate(request.end_date)}`
}

function businessDaysBetween(start, end) {
  const first = new Date(start)
  const last = new Date(end)
  let total = 0
  for (let current = new Date(first); current <= last; current.setDate(current.getDate() + 1)) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) total += 1
  }
  return total
}

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function addMonths(date, offset) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1)
}

function monthLabel(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function useDashboardContext() {
  return useOutletContext()
}

function toneClasses(tone) {
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/30'
    case 'amber':
      return 'bg-amber-400/15 text-amber-200 ring-amber-400/30'
    case 'rose':
      return 'bg-rose-400/15 text-rose-200 ring-rose-400/30'
    case 'violet':
      return 'bg-violet-400/15 text-violet-200 ring-violet-400/30'
    case 'sky':
      return 'bg-sky-400/15 text-sky-200 ring-sky-400/30'
    default:
      return 'bg-white/10 text-slate-200 ring-white/15'
  }
}

function toneDotColor(tone) {
  switch (tone) {
    case 'emerald':
      return '#34d399'
    case 'amber':
      return '#fbbf24'
    case 'rose':
      return '#fb7185'
    case 'violet':
      return '#c084fc'
    case 'sky':
      return '#38bdf8'
    default:
      return '#64748b'
  }
}

function Panel({ title, subtitle, actions, children, className = '' }) {
  return (
    <section
      className={`min-w-0 rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur ${className}`}
    >
      {(title || subtitle || actions) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            {title ? <h2 className="text-lg font-semibold text-white">{title}</h2> : null}
            {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

function Badge({ tone = 'slate', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ring-1 ${toneClasses(
        tone,
      )}`}
    >
      {children}
    </span>
  )
}

function StatCard({ stat }) {
  return (
    <article className="min-w-0 rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">{stat.label}</p>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: toneDotColor(stat.tone) }} />
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-white">{stat.value}</p>
    </article>
  )
}

function AppShell({
  token,
  session,
  dashboard,
  users,
  notifications,
  calendar,
  reports,
  calendarRange,
  loading,
  error,
  onLogout,
  onRefresh,
  onCreateRequest,
  onReviewRequest,
  onMarkNotificationsRead,
  onCalendarRangeChange,
  onCreatePolicy,
  onUpdatePolicy,
  onDownloadExport,
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const unreadCount = notifications.filter((item) => !item.is_read).length

  if (loading || !session.user || !dashboard) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 px-8 py-6 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-full bg-cyan-300/70" />
            <p className="text-lg font-semibold text-white">Loading your PTO workspace</p>
            <p className="mt-1 text-sm text-slate-400">{error || 'Syncing with the backend...'}</p>
          </div>
        </div>
      </main>
    )
  }

  const shellContext = {
    token,
    session,
    dashboard,
    users,
    notifications,
    calendar,
    reports,
    calendarRange,
    onRefresh,
    onCreateRequest,
    onReviewRequest,
    onMarkNotificationsRead,
    onCalendarRangeChange,
    onCreatePolicy,
    onUpdatePolicy,
    onDownloadExport,
  }

  return (
    <main className="min-h-screen bg-[#020617] text-slate-100">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-8rem] top-[-6rem] h-[24rem] w-[24rem] rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute right-[-10rem] top-[10rem] h-[26rem] w-[26rem] rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-[20%] h-[20rem] w-[20rem] rounded-full bg-amber-500/10 blur-3xl" />
      </div>

      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 overflow-x-hidden px-3 py-3 lg:grid-cols-[minmax(16rem,17rem)_minmax(0,1fr)] lg:px-6 lg:py-6">
        <aside className="hidden min-w-0 rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-slate-950/40 backdrop-blur lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:overflow-x-hidden">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/30">
                <Sparkles size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200">
                  Timely
                </p>
                <p className="text-xs text-slate-400">PTO operations hub</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              One workspace for balances, approvals, team availability, and policy controls.
            </p>
          </div>

          <nav className="mt-5 min-w-0 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                    className={({ isActive }) =>
                      [
                        'flex items-center justify-between rounded-2xl px-4 py-3 text-sm transition',
                        isActive
                          ? 'bg-cyan-400/15 text-white ring-1 ring-cyan-300/30'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white',
                    ].join(' ')
                  }
                >
                  <span className="flex items-center gap-3">
                    <Icon size={16} />
                    {item.label}
                  </span>
                  <ArrowRight size={14} className="opacity-60" />
                </NavLink>
              )
            })}
          </nav>

          <div className="mt-5 min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Signed in as</p>
            <div className="mt-3 min-w-0 space-y-1">
              <p className="break-words font-semibold text-white">{session.user.name}</p>
              <p className="break-words text-sm text-slate-400">{session.user.title}</p>
            </div>
            <div className="mt-4 flex min-w-0 flex-wrap gap-2">
              <Badge tone="sky">{session.user.role}</Badge>
              {dashboard.user.team_name ? <Badge tone="violet">{dashboard.user.team_name}</Badge> : null}
              {unreadCount ? (
                <Badge tone="amber">{unreadCount} unread</Badge>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex flex-col gap-6">
          <header className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.35)] backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen((value) => !value)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 lg:hidden"
                >
                  <Menu size={18} />
                </button>
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-cyan-200">
                    PTO dashboard
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-4xl">
                    Manage time off without losing the thread.
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onRefresh}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                >
                  <Clock3 size={16} />
                  Refresh
                </button>
                <div className="hidden rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100 md:block">
                  API: <span className="font-semibold">{API_BASE}</span>
                </div>
              </div>
            </div>

            {mobileOpen ? (
              <div className="mt-5 grid gap-2 lg:hidden">
                {navItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        [
                          'flex items-center justify-between rounded-2xl px-4 py-3 text-sm transition',
                          isActive
                            ? 'bg-cyan-400/15 text-white ring-1 ring-cyan-300/30'
                            : 'text-slate-300 hover:bg-white/5 hover:text-white',
                        ].join(' ')
                      }
                    >
                      <span className="flex items-center gap-3">
                        <Icon size={16} />
                        {item.label}
                      </span>
                      <ArrowRight size={14} className="opacity-60" />
                    </NavLink>
                  )
                })}
              </div>
            ) : null}
          </header>

          {error ? (
            <div className="rounded-[1.5rem] border border-amber-300/25 bg-amber-400/10 px-5 py-4 text-sm text-amber-50">
              {error}
            </div>
          ) : null}

          <div className="min-w-0">
            <Outlet context={shellContext} />
          </div>
        </div>
      </div>
    </main>
  )
}

function DashboardView() {
  const { dashboard, notifications, onCreateRequest, onMarkNotificationsRead } = useDashboardContext()
  const [form, setForm] = useState(DEFAULT_REQUEST)
  const [submitting, setSubmitting] = useState(false)

  const summary = useMemo(() => {
    const approved = dashboard.requests.filter((request) => request.status === 'approved')
    const pending = dashboard.requests.filter((request) => request.status === 'pending')
    const totalDays = approved.reduce(
      (count, request) => count + businessDaysBetween(request.start_date, request.end_date),
      0,
    )

    return {
      approvedCount: approved.length,
      pendingCount: pending.length,
      approvedDays: totalDays,
    }
  }, [dashboard.requests])

  async function submitRequest(event) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await onCreateRequest(form)
      setForm(DEFAULT_REQUEST)
    } finally {
      setSubmitting(false)
    }
  }

  const recentNotifications = dashboard.notifications.slice(0, 4)
  const unreadNotifications = notifications.filter((item) => !item.is_read)

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6">
        <Panel
          title={`Welcome back, ${dashboard.user.name.split(' ')[0]}`}
          subtitle="Your PTO snapshot, requests, and team context at a glance."
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {dashboard.stats.map((stat) => (
              <StatCard key={stat.label} stat={stat} />
            ))}
          </div>
          <p className="mt-5 text-sm text-slate-400">
            {summary.approvedCount} approved requests, {summary.pendingCount} pending items, and{' '}
            {summary.approvedDays} approved days currently in motion.
          </p>
        </Panel>

        {dashboard.conflicts.length ? (
          <Panel
            title="Conflict alerts"
            subtitle="Overlapping leave that the scheduler should review."
          >
            <div className="space-y-3">
              {dashboard.conflicts.slice(0, 3).map((conflict) => (
                <div key={conflict.request_id} className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">
                        {conflict.user_name} · {conflict.pto_type}
                      </p>
                      <p className="mt-1 text-sm text-amber-100/80">
                        {formatRange(conflict)} overlaps with {conflict.conflicts.length} request
                        {conflict.conflicts.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Badge tone="amber">conflict</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel
          title="Create a PTO request"
          subtitle="Submit time off directly from the dashboard."
          className="overflow-hidden"
        >
          <form onSubmit={submitRequest} className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              Requester
              <select
                disabled
                value={dashboard.user.id}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none"
              >
                <option value={dashboard.user.id}>{dashboard.user.name}</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              PTO type
              <select
                value={form.pto_type}
                onChange={(event) => setForm((current) => ({ ...current, pto_type: event.target.value }))}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none"
              >
                <option value="vacation">Vacation</option>
                <option value="sick">Sick</option>
                <option value="personal">Personal</option>
                <option value="parental">Parental</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              Start date
              <input
                type="date"
                value={form.start_date}
                onChange={(event) =>
                  setForm((current) => ({ ...current, start_date: event.target.value }))
                }
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none"
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              End date
              <input
                type="date"
                value={form.end_date}
                onChange={(event) =>
                  setForm((current) => ({ ...current, end_date: event.target.value }))
                }
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none"
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
              Reason
              <textarea
                rows="4"
                value={form.reason}
                onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                placeholder="Add a short note for your manager or HR."
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none"
              />
            </label>
            <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-slate-400">
                Requested working days:{' '}
                <span className="text-white">
                  {form.start_date && form.end_date
                    ? businessDaysBetween(form.start_date, form.end_date)
                    : 0}
                </span>
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Sparkles size={16} />
                {submitting ? 'Submitting...' : 'Submit request'}
              </button>
            </div>
          </form>
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel title="Balances" subtitle="Current available leave by type.">
          <div className="space-y-3">
            {dashboard.balances.map((balance) => (
              <div
                key={`${balance.user_id}-${balance.pto_type}`}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{balance.pto_type}</p>
                    <p className="text-sm text-slate-400">{balance.user_name}</p>
                  </div>
                  <p className="text-2xl font-semibold text-white">{balance.available.toFixed(1)} days</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-400">
                  <div>Accrued YTD: {balance.accrued_ytd.toFixed(1)}</div>
                  <div>Pending: {balance.pending.toFixed(1)}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Recent requests" subtitle="The latest time-off activity.">
          <div className="space-y-3">
            {dashboard.requests.slice(0, 5).map((request) => (
              <article
                key={request.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{request.user_name}</p>
                    <p className="text-sm text-slate-400">{formatRange(request)}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {request.conflict ? <Badge tone="amber">conflict</Badge> : null}
                    <Badge tone={statusTone[request.status] ?? 'slate'}>{request.status}</Badge>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-300">{request.reason || 'No reason provided.'}</p>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="Notifications" subtitle="Unread activity and reminders.">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-400">
              Latest inbox items from the backend. {unreadNotifications.length} unread.
            </p>
            <button
              type="button"
              onClick={() => onMarkNotificationsRead(unreadNotifications.map((item) => item.id))}
              disabled={!unreadNotifications.length}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              Mark all read
            </button>
          </div>
          <div className="space-y-3">
            {recentNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-2xl border p-4 ${notification.is_read ? 'border-white/10 bg-white/5' : 'border-cyan-300/30 bg-cyan-400/10'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">{notification.message}</p>
                  {notification.is_read ? null : <BellRing size={16} className="text-cyan-200" />}
                </div>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                  {formatDate(notification.created_at)}
                </p>
              </div>
            ))}
            {!recentNotifications.length ? (
              <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                No recent notifications.
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel title="Team snapshot" subtitle="Who is currently attached to this workspace.">
          <div className="space-y-2 text-sm text-slate-300">
            {dashboard.teams.map((team) => (
              <div key={team.id} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span>{team.name}</span>
                <span className="text-slate-400">{team.member_count} members</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function RequestsView() {
  const { dashboard } = useDashboardContext()
  const [filter, setFilter] = useState('all')
  const requests = dashboard.requests.filter((request) => filter === 'all' || request.status === filter)

  return (
    <Panel title="Request history" subtitle="A full view of PTO requests and their status.">
      <div className="mb-4 flex flex-wrap gap-2">
        {['all', 'pending', 'approved', 'rejected', 'cancelled'].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={`rounded-full px-4 py-2 text-sm transition ${
              filter === item
                ? 'bg-cyan-300 text-slate-950'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {requests.map((request) => (
              <article key={request.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-white">{request.user_name}</p>
                      {request.conflict ? <Badge tone="amber">conflict</Badge> : null}
                      <Badge tone={statusTone[request.status] ?? 'slate'}>{request.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      {request.pto_type} · {formatRange(request)}
                    </p>
                  </div>
              <p className="text-sm text-slate-400">
                Submitted {formatDate(request.submitted_at)}
              </p>
            </div>
            <p className="mt-3 text-sm text-slate-300">{request.reason || 'No reason added.'}</p>
            {request.approver_note ? (
              <p className="mt-2 text-sm text-slate-400">Note: {request.approver_note}</p>
            ) : null}
          </article>
        ))}
      </div>
    </Panel>
  )
}

function ApprovalsView() {
  const { dashboard, session, onReviewRequest } = useDashboardContext()
  const [busyId, setBusyId] = useState(null)
  const pendingRequests = dashboard.requests.filter((request) => request.status === 'pending')

  async function review(id, mode) {
    setBusyId(id)
    try {
      await onReviewRequest(id, mode, `${mode}d from the dashboard`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Panel title="Approval queue" subtitle="Pending requests are waiting for a decision.">
      <div className="grid gap-3">
        {pendingRequests.map((request) => (
          <article key={request.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-white">{request.user_name}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {request.pto_type} · {formatRange(request)}
                </p>
                <p className="mt-2 text-sm text-slate-300">{request.reason}</p>
              </div>
              <Badge tone="amber">pending</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => review(request.id, 'approve')}
                disabled={busyId === request.id}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
              >
                <CheckCircle2 size={16} />
                Approve
              </button>
              <button
                type="button"
                onClick={() => review(request.id, 'reject')}
                disabled={busyId === request.id}
                className="inline-flex items-center gap-2 rounded-2xl bg-rose-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
              >
                <XCircle size={16} />
                Reject
              </button>
              <button
                type="button"
                onClick={() => review(request.id, 'cancel')}
                disabled={busyId === request.id}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </article>
        ))}
        {pendingRequests.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">
            No pending requests right now.
          </p>
        ) : null}
      </div>
      <p className="mt-4 text-sm text-slate-500">
        Current reviewer context: {session.user.name}
      </p>
    </Panel>
  )
}

function CalendarView() {
  const { dashboard, calendar, calendarRange, onCalendarRangeChange } = useDashboardContext()
  const visibleCalendar = calendar ?? { holidays: [], requests: [] }
  const rangeBounds = useMemo(
    () => ({
      start: new Date(calendarRange.start),
      end: new Date(calendarRange.end),
    }),
    [calendarRange.end, calendarRange.start],
  )

  const agendaDays = useMemo(() => {
    const holidayMap = new Map(visibleCalendar.holidays.map((holiday) => [holiday.day, holiday]))
    const requestMap = new Map()

    for (const request of visibleCalendar.requests) {
      const current = new Date(request.start_date)
      const last = new Date(request.end_date)
      while (current <= last) {
        const key = isoDate(current)
        if (!requestMap.has(key)) {
          requestMap.set(key, [])
        }
        requestMap.get(key).push(request)
        current.setDate(current.getDate() + 1)
      }
    }

    const days = []
    const current = new Date(rangeBounds.start)
    while (current <= rangeBounds.end) {
      const key = isoDate(current)
      days.push({
        key,
        date: new Date(current),
        holiday: holidayMap.get(key) ?? null,
        requests: (requestMap.get(key) ?? []).sort((left, right) =>
          left.user_name.localeCompare(right.user_name),
        ),
      })
      current.setDate(current.getDate() + 1)
    }
    return days
  }, [rangeBounds.end, rangeBounds.start, visibleCalendar.holidays, visibleCalendar.requests])

  async function shiftMonth(offset) {
    const nextMonth = addMonths(rangeBounds.start, offset)
    await onCalendarRangeChange({
      start: isoDate(startOfMonth(nextMonth)),
      end: isoDate(endOfMonth(nextMonth)),
    })
  }

  async function handleRangeInput(field, value) {
    const nextRange = {
      ...calendarRange,
      [field]: value,
    }
    await onCalendarRangeChange(nextRange)
  }

  const approvedCount = visibleCalendar.requests.filter((request) => request.status === 'approved').length
  const pendingCount = visibleCalendar.requests.filter((request) => request.status === 'pending').length

  return (
    <div className="space-y-6">
      <Panel
        title="Team calendar"
        subtitle="Browse approved leave, holidays, and overlapping absences by day."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              Previous month
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              Next month
            </button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Range</p>
            <p className="mt-2 text-lg font-semibold text-white">{monthLabel(rangeBounds.start)}</p>
          </div>
          <label className="grid gap-2 text-sm text-slate-300">
            Start
            <input
              type="date"
              value={calendarRange.start}
              onChange={(event) => handleRangeInput('start', event.target.value)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none"
            />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            End
            <input
              type="date"
              value={calendarRange.end}
              onChange={(event) => handleRangeInput('end', event.target.value)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none"
            />
          </label>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-slate-400">Approved absences</p>
            <p className="mt-2 text-3xl font-semibold text-white">{approvedCount}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-slate-400">Pending requests</p>
            <p className="mt-2 text-3xl font-semibold text-white">{pendingCount}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-slate-400">Holidays</p>
            <p className="mt-2 text-3xl font-semibold text-white">{visibleCalendar.holidays.length}</p>
          </div>
        </div>
      </Panel>

      {dashboard.conflicts.length ? (
        <Panel title="Conflict watch" subtitle="Requests that currently overlap in the calendar.">
          <div className="space-y-3">
            {dashboard.conflicts.slice(0, 5).map((conflict) => (
              <div
                key={conflict.request_id}
                className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">
                      {conflict.user_name} · {conflict.pto_type}
                    </p>
                    <p className="mt-1 text-sm text-amber-100/80">
                      {formatRange(conflict)} overlaps with {conflict.conflicts.length} request
                      {conflict.conflicts.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Badge tone="amber">conflict</Badge>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel title="Agenda" subtitle="Each day shows holidays and PTO blocks overlapping the selected range.">
        <div className="space-y-3">
          {agendaDays.map((day) => (
            <article key={day.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-white">{formatDate(day.key)}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {day.date.toLocaleDateString('en-US', { weekday: 'long' })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {day.holiday ? <Badge tone="violet">{day.holiday.title}</Badge> : null}
                  {day.requests.length ? <Badge tone="sky">{day.requests.length} requests</Badge> : null}
                </div>
              </div>

              {day.requests.length ? (
                <div className="mt-4 grid gap-2">
                  {day.requests.map((request) => (
                    <div
                      key={request.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-950/70 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-white">{request.user_name}</p>
                        <p className="text-sm text-slate-400">
                          {request.pto_type} · {formatRange(request)}
                        </p>
                      </div>
                      <Badge tone={statusTone[request.status] ?? 'slate'}>{request.status}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">No PTO recorded for this day.</p>
              )}
            </article>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function ReportsView() {
  const { dashboard, reports, onDownloadExport } = useDashboardContext()
  const usage = reports?.usage?.length
    ? reports.usage
    : Array.from(
        dashboard.requests
          .filter((request) => request.status === 'approved')
          .reduce((totals, request) => {
            const days = businessDaysBetween(request.start_date, request.end_date)
            totals.set(request.pto_type, (totals.get(request.pto_type) ?? 0) + days)
            return totals
          }, new Map())
      ).map(([label, days]) => ({ label, days }))

  const balances = reports?.balances ?? dashboard.balances.map((balance) => ({
    user: balance.user_name,
    pto_type: balance.pto_type,
    available: balance.available,
    pending: balance.pending,
  }))

  const approvals = reports?.approvals ?? [
    { label: 'pending', count: dashboard.requests.filter((request) => request.status === 'pending').length },
    { label: 'approved', count: dashboard.requests.filter((request) => request.status === 'approved').length },
    { label: 'rejected', count: dashboard.requests.filter((request) => request.status === 'rejected').length },
    { label: 'cancelled', count: dashboard.requests.filter((request) => request.status === 'cancelled').length },
  ]

  const maxUsage = Math.max(...usage.map((item) => item.days), 1)

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Panel
        title="Usage"
        subtitle="Approved PTO days by type, from the reporting API."
        actions={
          <button
            type="button"
            onClick={() => onDownloadExport('usage', 'usage.csv')}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Download CSV
          </button>
        }
      >
        <div className="space-y-4">
          {usage.map((item) => (
            <div key={item.label}>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-slate-300">{item.label}</span>
                <span className="text-white">{item.days} days</span>
              </div>
              <div className="h-3 rounded-full bg-white/10">
                <div
                  className="h-3 rounded-full bg-cyan-300"
                  style={{ width: `${Math.max((item.days / maxUsage) * 100, 8)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Approvals"
        subtitle="Lifecycle counts for the current workspace."
        actions={
          <button
            type="button"
            onClick={() => onDownloadExport('approvals', 'approvals.csv')}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Download CSV
          </button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {approvals.map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
              <p className="mt-3 text-3xl font-semibold text-white">{item.count ?? item.value}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Balances"
        subtitle="Current leave by user and PTO type."
        actions={
          <button
            type="button"
            onClick={() => onDownloadExport('balances', 'balances.csv')}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Download CSV
          </button>
        }
      >
        <div className="space-y-3">
          {balances.map((balance, index) => (
            <div key={`${balance.user ?? balance.user_name}-${balance.pto_type}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-white">{balance.user ?? balance.user_name}</p>
                <p className="text-white">{Number(balance.available).toFixed(1)} days</p>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                {balance.pto_type} · pending {Number(balance.pending ?? 0).toFixed(1)}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Trends" subtitle="Quick read on how leave is moving through the system.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-slate-400">Approved requests</p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {dashboard.requests.filter((request) => request.status === 'approved').length}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-slate-400">Pending requests</p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {dashboard.requests.filter((request) => request.status === 'pending').length}
            </p>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function AdminView() {
  const { dashboard, users, onCreatePolicy, onUpdatePolicy, onDownloadExport } = useDashboardContext()
  const blankPolicy = {
    name: '',
    pto_type: 'vacation',
    accrual_rate: 0,
    accrual_frequency: 'monthly',
    carryover_cap: 0,
    max_balance: 0,
    active: true,
  }
  const [policyForm, setPolicyForm] = useState(blankPolicy)
  const [editingPolicyId, setEditingPolicyId] = useState(null)
  const [savingPolicy, setSavingPolicy] = useState(false)
  const [auditFilter, setAuditFilter] = useState('all')

  function loadPolicy(policy) {
    setEditingPolicyId(policy.id)
    setPolicyForm({
      name: policy.name,
      pto_type: policy.pto_type,
      accrual_rate: policy.accrual_rate,
      accrual_frequency: policy.accrual_frequency,
      carryover_cap: policy.carryover_cap,
      max_balance: policy.max_balance,
      active: policy.active,
    })
  }

  function resetPolicyForm() {
    setEditingPolicyId(null)
    setPolicyForm(blankPolicy)
  }

  async function submitPolicy(event) {
    event.preventDefault()
    setSavingPolicy(true)
    try {
      const payload = {
        ...policyForm,
        accrual_rate: Number(policyForm.accrual_rate),
        carryover_cap: Number(policyForm.carryover_cap),
        max_balance: Number(policyForm.max_balance),
      }
      if (editingPolicyId) {
        await onUpdatePolicy(editingPolicyId, payload)
      } else {
        await onCreatePolicy(payload)
      }
      resetPolicyForm()
    } finally {
      setSavingPolicy(false)
    }
  }

  const filteredAuditLogs =
    auditFilter === 'all'
      ? dashboard.audit_logs
      : dashboard.audit_logs.filter((log) => log.entity === auditFilter)

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Panel
        title="Policy management"
        subtitle="Create or update PTO policies from the admin workspace."
      >
        <form onSubmit={submitPolicy} className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
            Policy name
            <input
              type="text"
              value={policyForm.name}
              onChange={(event) => setPolicyForm((current) => ({ ...current, name: event.target.value }))}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none"
            />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            PTO type
            <select
              value={policyForm.pto_type}
              onChange={(event) => setPolicyForm((current) => ({ ...current, pto_type: event.target.value }))}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none"
            >
              <option value="vacation">Vacation</option>
              <option value="sick">Sick</option>
              <option value="personal">Personal</option>
              <option value="parental">Parental</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Accrual frequency
            <select
              value={policyForm.accrual_frequency}
              onChange={(event) =>
                setPolicyForm((current) => ({ ...current, accrual_frequency: event.target.value }))
              }
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none"
            >
              <option value="yearly">Yearly</option>
              <option value="monthly">Monthly</option>
              <option value="per_pay_period">Per pay period</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Accrual rate
            <input
              type="number"
              step="0.1"
              value={policyForm.accrual_rate}
              onChange={(event) =>
                setPolicyForm((current) => ({ ...current, accrual_rate: event.target.value }))
              }
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none"
            />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Carryover cap
            <input
              type="number"
              step="0.1"
              value={policyForm.carryover_cap}
              onChange={(event) =>
                setPolicyForm((current) => ({ ...current, carryover_cap: event.target.value }))
              }
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none"
            />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Max balance
            <input
              type="number"
              step="0.1"
              value={policyForm.max_balance}
              onChange={(event) =>
                setPolicyForm((current) => ({ ...current, max_balance: event.target.value }))
              }
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none"
            />
          </label>
          <label className="flex items-center gap-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={policyForm.active}
              onChange={(event) =>
                setPolicyForm((current) => ({ ...current, active: event.target.checked }))
              }
              className="h-4 w-4 rounded border-white/20 bg-white/10"
            />
            Policy active
          </label>
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={savingPolicy}
              className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {editingPolicyId ? 'Update policy' : 'Create policy'}
            </button>
            {editingPolicyId ? (
              <button
                type="button"
                onClick={resetPolicyForm}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200 transition hover:bg-white/10"
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </Panel>

      <Panel title="Policies" subtitle="Live policies from the backend.">
        <div className="space-y-3">
          {dashboard.policies.map((policy) => (
            <div key={policy.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{policy.name}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {policy.pto_type} · {policy.accrual_rate} / {policy.accrual_frequency}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={policy.active ? 'emerald' : 'slate'}>
                    {policy.active ? 'active' : 'inactive'}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => loadPolicy(policy)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Audit log" subtitle="Recent actions captured by the backend.">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => onDownloadExport('audit-logs', 'audit-logs.csv')}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Download CSV
          </button>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {['all', 'system', 'policy', 'pto_request', 'user', 'balance'].map((entity) => (
            <button
              key={entity}
              type="button"
              onClick={() => setAuditFilter(entity)}
              className={`rounded-full px-4 py-2 text-sm transition ${
                auditFilter === entity
                  ? 'bg-cyan-300 text-slate-950'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {entity}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {filteredAuditLogs.map((log) => (
            <div key={log.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-white">{log.action}</p>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  {formatDate(log.created_at)}
                </p>
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {log.actor ? `${log.actor} · ` : ''}
                {log.entity} / {log.entity_id}
              </p>
            </div>
          ))}
          {filteredAuditLogs.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
              No audit records for this filter.
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel title="Team roster" subtitle="Users and teams loaded from the database.">
        <div className="space-y-3">
          {users.length
            ? users.map((user) => (
                <div key={user.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{user.name}</p>
                      <p className="mt-1 text-sm text-slate-400">{user.email}</p>
                    </div>
                    <Badge tone="sky">{user.role}</Badge>
                  </div>
                </div>
              ))
            : dashboard.teams.map((team) => (
                <div key={team.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-white">{team.name}</p>
                    <p className="text-sm text-slate-400">{team.member_count} members</p>
                  </div>
                </div>
              ))}
        </div>
      </Panel>

      <Panel title="Workspace" subtitle="Backend availability and current integration status.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4 text-sm text-cyan-100">
            Backend endpoint: <span className="font-semibold">{API_BASE}</span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            Policy updates, audit logs, and report views are now driven from the backend.
          </div>
        </div>
      </Panel>
    </div>
  )
}

function AppContent() {
  const [token, setToken] = useState('')
  const [session, setSession] = useState({ user: null })
  const [dashboard, setDashboard] = useState(null)
  const [users, setUsers] = useState([])
  const [notifications, setNotifications] = useState([])
  const [calendar, setCalendar] = useState(null)
  const [reports, setReports] = useState(null)
  const [calendarRange, setCalendarRange] = useState(() => {
    const today = new Date()
    return {
      start: isoDate(startOfMonth(today)),
      end: isoDate(endOfMonth(today)),
    }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function showFallbackWorkspace(message = BACKEND_UNAVAILABLE_MESSAGE) {
    setSession({ user: FALLBACK_USER })
    setDashboard(FALLBACK_DASHBOARD)
    setUsers([])
    setNotifications([])
    setCalendar({ holidays: [], requests: [] })
    setReports(FALLBACK_REPORTS)
    setError(message)
  }

  async function refreshWorkspace(nextToken = token, range = calendarRange) {
    if (!nextToken) {
      showFallbackWorkspace()
      return
    }
    try {
      const [me, nextDashboard, nextUsers, nextCalendar, usage, balances, approvals, allNotifications] =
        await Promise.all([
        api('/me', { token: nextToken }),
        api('/dashboard', { token: nextToken }),
        api('/users', { token: nextToken }),
        api(`/calendar?start=${range.start}&end=${range.end}`, { token: nextToken }),
        api('/reports/usage', { token: nextToken }),
        api('/reports/balances', { token: nextToken }),
        api('/reports/approvals', { token: nextToken }),
        api('/notifications', { token: nextToken }),
      ])
      setSession({ user: me })
      setDashboard(nextDashboard)
      setUsers(nextUsers)
      setNotifications(allNotifications.notifications.filter((item) => item.user_id === me.id))
      setCalendar(nextCalendar)
      setReports({ usage, balances, approvals })
      setError('')
    } catch {
      showFallbackWorkspace()
    }
  }

  useEffect(() => {
    let active = true

    async function bootstrap() {
      setLoading(true)
      try {
        let activeToken = token
        if (!activeToken) {
          const response = await api('/auth/login', {
            method: 'POST',
            body: DEMO_CREDENTIALS,
          })
          if (!active) return
          localStorage.setItem(STORAGE_KEY, response.access_token)
          setToken(response.access_token)
          activeToken = response.access_token
        }

        const [me, nextDashboard, nextUsers, nextCalendar, usage, balances, approvals, allNotifications] =
          await Promise.all([
          api('/me', { token: activeToken }),
          api('/dashboard', { token: activeToken }),
          api('/users', { token: activeToken }),
          api(`/calendar?start=${calendarRange.start}&end=${calendarRange.end}`, { token: activeToken }),
          api('/reports/usage', { token: activeToken }),
          api('/reports/balances', { token: activeToken }),
          api('/reports/approvals', { token: activeToken }),
          api('/notifications', { token: activeToken }),
        ])
        if (!active) return
        setSession({ user: me })
        setDashboard(nextDashboard)
        setUsers(nextUsers)
        setNotifications(allNotifications.notifications.filter((item) => item.user_id === me.id))
        setCalendar(nextCalendar)
        setReports({ usage, balances, approvals })
        setError('')
      } catch {
        if (!active) return
        localStorage.removeItem(STORAGE_KEY)
        setToken('')
        showFallbackWorkspace()
      } finally {
        if (active) setLoading(false)
      }
    }

    bootstrap()

    return () => {
      active = false
    }
  }, [calendarRange.end, calendarRange.start, token])

  async function handleLogout() {
    if (token) {
      try {
        await api('/auth/logout', { method: 'POST', token })
      } catch {
        // Logout is best-effort.
      }
    }
    localStorage.removeItem(STORAGE_KEY)
    setToken('')
    setSession({ user: null })
    setDashboard(null)
    setUsers([])
    setNotifications([])
    setCalendar(null)
    setReports(null)
    setError('')
    navigate('/', { replace: true })
  }

  async function handleCreateRequest(form) {
    try {
      await api('/pto-requests', {
        method: 'POST',
        token,
        body: {
          user_id: session.user.id,
          ...form,
        },
      })
      await refreshWorkspace()
    } catch {
      showFallbackWorkspace(BACKEND_UNAVAILABLE_MESSAGE)
    }
  }

  async function handleReviewRequest(requestId, action, note) {
    try {
      await api(`/pto-requests/${requestId}/${action}`, {
        method: 'POST',
        token,
        body: {
          reviewer_id: session.user.id,
          note,
        },
      })
      await refreshWorkspace()
    } catch {
      showFallbackWorkspace(BACKEND_UNAVAILABLE_MESSAGE)
    }
  }

  async function handleMarkNotificationsRead(notificationIds) {
    try {
      await api('/notifications/read', {
        method: 'POST',
        token,
        body: { notification_ids: notificationIds },
      })
      await refreshWorkspace()
    } catch {
      showFallbackWorkspace(BACKEND_UNAVAILABLE_MESSAGE)
    }
  }

  async function handleCalendarRangeChange(nextRange) {
    setCalendarRange(nextRange)
  }

  async function handleCreatePolicy(payload) {
    try {
      await api('/policies', {
        method: 'POST',
        token,
        body: payload,
      })
      await refreshWorkspace()
    } catch {
      showFallbackWorkspace(BACKEND_UNAVAILABLE_MESSAGE)
    }
  }

  async function handleUpdatePolicy(policyId, payload) {
    try {
      await api(`/policies/${policyId}`, {
        method: 'PATCH',
        token,
        body: payload,
      })
      await refreshWorkspace()
    } catch {
      showFallbackWorkspace(BACKEND_UNAVAILABLE_MESSAGE)
    }
  }

  async function handleDownloadExport(resource, filename) {
    try {
      const response = await fetch(`${API_BASE}/exports/${resource}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        throw new Error(`Unable to export ${resource}`)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch {
      showFallbackWorkspace(BACKEND_UNAVAILABLE_MESSAGE)
    }
  }

  return (
    <Routes>
      <Route
        path="/*"
        element={
          <AppShell
            token={token}
            session={session}
            dashboard={dashboard}
            users={users}
            notifications={notifications}
            calendar={calendar}
            reports={reports}
            calendarRange={calendarRange}
            loading={loading}
            error={error}
            onLogout={handleLogout}
            onRefresh={() => refreshWorkspace()}
            onCreateRequest={handleCreateRequest}
            onReviewRequest={handleReviewRequest}
            onMarkNotificationsRead={handleMarkNotificationsRead}
            onCalendarRangeChange={handleCalendarRangeChange}
            onCreatePolicy={handleCreatePolicy}
            onUpdatePolicy={handleUpdatePolicy}
            onDownloadExport={handleDownloadExport}
          />
        }
      >
        <Route index element={<DashboardView />} />
        <Route path="requests" element={<RequestsView />} />
        <Route path="approvals" element={<ApprovalsView />} />
        <Route path="calendar" element={<CalendarView />} />
        <Route path="reports" element={<ReportsView />} />
        <Route path="admin" element={<AdminView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={ROUTER_BASENAME}>
      <AppContent />
    </BrowserRouter>
  )
}
