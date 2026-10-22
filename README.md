# OfficeHub — office management & performance platform

A full-stack web app for running an office: members, attendance, prospecting, tasks, monthly plans, goals,
money-making challenges, personal and office finances, expenses, fines, notifications, analytics and an audit log.
Admins get a management console; members get a simpler personal workspace.

- **Stack:** Next.js 15 (App Router, server components + server actions), TypeScript, Tailwind CSS v4, PostgreSQL 16
  via `postgres.js`, Zod, Recharts, Vitest, Playwright (UI smoke/E2E scripts).
- **Security model:** every request runs in a database transaction as a restricted role with
  **Row Level Security**; roles are derived from the `memberships` table inside the database, never from the client.

---

## Quick start (local)

Prerequisites: Node 20+ and PostgreSQL 14+ (16 recommended).

```bash
# 1. Database + owner role (once)
sudo -u postgres psql -c "create role officehub_owner login password 'owner_pw' createrole;"
sudo -u postgres psql -c "create database officehub owner officehub_owner;"
sudo -u postgres psql -c "create database officehub_test owner officehub_owner;"   # for integration tests

# 2. Configure
cp .env.example .env          # edit passwords / secrets

# 3. Install, migrate, (optionally) seed demo data
npm install
npm run db:migrate            # applies db/migrations/*.sql and sets the app role's login password
npm run db:seed               # OPTIONAL demo office with sample data (clearly marked "Demo")

# 4. Run
npm run dev                   # http://localhost:3000
```

Demo accounts (only after `db:seed`; password `Password123!` or `SEED_PASSWORD`):

| Role | Email |
|---|---|
| Office admin (also platform super admin) | `admin@demo.officehub.test` |
| Member | `ada@demo.officehub.test` (also `emeka@`, `fatima@`, `kunle@`, `ngozi@`, `ibrahim@`, `chioma@`) |

The demo office is flagged `is_demo` and shows a “Demo office · sample data” badge. `npm run db:seed` replaces only the
demo office. `npm run db:reset` drops **everything** and re-seeds (development only).

There is no public sign-up: administrators create member accounts with a temporary password that must be changed at
first sign-in. A platform super admin creates offices and their first administrator at `/super`.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Runtime connection **as `officehub_app`** (RLS-restricted role). |
| `DATABASE_OWNER_URL` | for migrate/seed | Owner connection used only by `npm run db:migrate` / `db:seed`. Never used at runtime. |
| `DATABASE_APP_PASSWORD` | for migrate | Password the migration script assigns to the `officehub_app` login role. |
| `CRON_SECRET` | for reminders | Bearer token for `GET /api/cron/reminders`. |
| `SESSION_COOKIE_SECURE` | no | `false` to allow the session cookie over plain http outside development. |
| `SHOW_DEMO_LOGINS` | no | `true` shows the demo credentials on the sign-in page. |
| `SEED_PASSWORD` | no | Password for demo accounts created by the seed. |

No secrets are used in client code; all database access happens on the server.

---

## Scripts & checks

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server |
| `npm run lint`, `npm run typecheck` | ESLint (next/core-web-vitals + TS), `tsc --noEmit` |
| `npm test` | Vitest: unit tests + DB integration tests (rebuilds the `officehub_test` database each run) |
| `npm run db:migrate` / `db:seed` / `db:reset` | Apply migrations / load demo data / wipe + reseed |
| `node scripts/smoke.mjs <email> <paths> [x <shotsDir>]` | Signs in with a real browser and loads pages, failing on HTTP errors, error boundaries or console errors |
| `node scripts/e2e.mjs` | Real-UI flows against the demo seed: forms, persistence after reload, notifications, access control, CSV |

Set `PW_EXEC=/path/to/chromium` if Playwright should use a pre-installed browser.

Results at the time of writing: lint ✔, typecheck ✔, `npm test` 51/51 ✔ (25 unit, 26 integration), `next build` ✔,
smoke test of all 13 member and 31 admin pages ✔, E2E 18/18 ✔.

---

## Architecture

```
db/migrations/           Version-controlled SQL (schema, RLS, rules, functions)
scripts/                 migrate.ts, seed.ts, smoke.mjs, e2e.mjs
src/lib/logic/           Pure business rules (money, attendance, goals, challenges, fines) — unit tested
src/lib/validation/      Zod schemas for every form
src/lib/                 dates (office-timezone calendar math), formatting, CSV, chart palette
src/server/db.ts         Connection + withCtx(): transaction with RLS context (app.user_id, app.office_id)
src/server/auth.ts       Sessions (httpOnly cookie → hashed token in DB), login, role guards
src/server/action.ts     Standard server-action pipeline (session → role → Zod → RLS tx → safe errors)
src/server/services/     Business operations (DB writes, audit, notifications) — integration tested
src/server/queries/      Read models for pages/analytics
src/server/actions/      Thin 'use server' wrappers around services
src/components/ui/       Design system: buttons, form fields, dialogs, tables, cards, badges, toasts, filters…
src/components/charts/   Recharts wrappers (legend, tooltip, “view as table”)
src/app/                 Routes (member area, /admin, /super, /api)
```

### Main routes

**Member:** `/dashboard`, `/attendance`, `/money` (transactions, accounts, office expense claims), `/prospects` (+ `/prospects/[id]`),
`/tasks`, `/goals` (goals & performance), `/challenges` (+ `/challenges/[id]`), `/fines`, `/plan`, `/notifications`, `/profile`.

**Admin:** `/admin` (overview & approvals), `/admin/members` (+ `[id]`), `/admin/prospects` (+ `[id]`), `/admin/tasks`
(list/board/timeline/by member), `/admin/attendance` (register/summary/corrections), `/admin/plans` (+ `[id]`), `/admin/goals`,
`/admin/challenges` (+ `[id]`), `/admin/finances` (overview/ledger/verifications/receivables & payables/budget vs actual),
`/admin/expenses`, `/admin/fines` (fines/payments/disputes/attendance review/rules), `/admin/analytics`, `/admin/announcements`,
`/admin/settings`, `/admin/audit`. Admins also have the full member workspace.

**Platform:** `/super` (offices, create office + first admin). **API:** `/api/export/[kind]` (CSV; admin only),
`/api/cron/reminders` (bearer secret), `/api/attachments/[id]` (receipts; uploader or admin).

---

## Database

Migrations live in `db/migrations` and are applied in order by `scripts/migrate.ts` (tracked in `schema_migrations`).

- `0001_schema.sql` — tables, constraints, indexes, ledger views
- `0002_security.sql` — request-context helpers, auth functions, **RLS policies**, grants
- `0003_rules.sql` — business-rule triggers and SECURITY DEFINER operations
- `0004_notifications.sql` — validated cross-user notification delivery

Main entities: `offices`, `office_settings`, `users`, `memberships` (role, team, status), `teams`, `levels`, `member_levels`,
`sessions`, `attendance_records`, `attendance_corrections`, `prospects`, `prospect_interactions`, `tasks`, `task_comments`,
`office_plans`, `plan_activities`, `activity_registrations`, `goals`, `goal_progress`, `challenges`, `challenge_participants`,
`challenge_submissions`, `challenge_rewards`, `finance_categories`, `personal_accounts`, `personal_transactions`,
`office_accounts`, `office_transactions`, `office_obligations`, `budgets`, `expenses`, `expense_approvals`, `attachments`,
`fine_categories`, `fines`, `fine_payments`, `fine_disputes`, `fine_adjustments`, `notifications`, `announcements`, `audit_logs`.

Conventions: UUID keys; `numeric(14,2)` for all money (never floats — the app does exact minor-unit arithmetic and lets
PostgreSQL compute totals); `timestamptz` for instants; office-local calendar days stored as `date` computed in the office
timezone; unique constraints for one-attendance-per-member-per-day, duplicate prospect phone/email, idempotency tokens on
financial and challenge submissions, one reward per participant, one open dispute per fine.

## Authentication & permissions

- Passwords are bcrypt-hashed **inside PostgreSQL** (pgcrypto); hashes are not readable by the app role (column privileges).
  Login verification and session creation happen in one SECURITY DEFINER function. Sessions are random 256-bit tokens in an
  httpOnly, SameSite=Lax cookie; only the SHA-256 hash is stored. Login is rate-limited per IP and per email in the database.
- Deactivating a member signs them out and blocks sign-in; all history is retained. The last active admin cannot be removed.
- Admin account recovery: “Reset password” issues a temporary password, signs the member out everywhere and forces a change.
- **Enforcement layers:** (1) `/admin` layout and every admin page/action check the role server-side; (2) the database
  enforces RLS on every table for the `officehub_app` role, keyed on `app.user_id`/`app.office_id` set per transaction;
  (3) guard triggers enforce workflow rules (e.g. members can only change status/progress of assigned tasks, approved
  records are locked, expense status transitions, no overpayment). Changing an ID in a URL or request cannot expose another
  member’s attendance, finances, fines or private prospects — integration tests cover this.
- Office isolation: users only ever see rows of their *current* office, even if they belong to several.
- Super admins (`users.is_super_admin`) act as admins in any office they switch into and can create offices.

## Business rules (as implemented)

- **Attendance:** one record per member per office date. Self check-in is a DB function that computes the office-local
  date/time: before `checkin_opens` → refused; after `late_after` → *late*; after `checkin_closes` → refused; non-working
  day → refused. Members cannot write attendance directly. Admin corrections require a reason and are logged.
  *Rate* = (present + late) ÷ (eligible working days − excused), where eligible days run from max(period start, joining date)
  to min(period end, today); today counts only once it has a record or check-in has closed. Days with no record count as absent.
  Absences are only recorded by the explicit “Mark missing as absent” action.
- **Personal finance:** income/expense totals = non-rejected income/expense entries in the period; transfers between own
  accounts and adjustments are excluded. *Recorded balance* = opening balance + signed effects of non-rejected entries dated on
  or after the account’s opening date. Members may submit records for verification; verified (approved) records are locked —
  corrections are append-only mirror entries (direction −1) that net the original to zero. Admins cannot verify their own records,
  and cannot see member finances when the office setting is off. Nothing is connected to a bank.
- **Office books:** separate from personal finances; append-only (no update/delete privilege). Corrections are reversals.
  Paying an expense, confirming a fine payment and settling a receivable/payable each post exactly one linked ledger entry
  (unique foreign keys prevent double posting). Reconciliation compares the calculated balance with a counted/statement balance
  and posts the difference as an audited adjustment. Receivables = open receivables + outstanding fines; payables = open payables +
  approved-but-unpaid expenses. Budget vs actual uses expense entries in the month.
- **Fines:** outstanding = amount − confirmed payments (0 if waived). Status precedence: paid → disputed → partially paid → pending
  (waived is terminal). Payments exceeding the outstanding balance are rejected by a trigger that locks the fine row. Member payment
  submissions stay pending until confirmed. Amount changes are recorded in `fine_adjustments`; waivers and dispute outcomes need a
  reason. Attendance-based fines are only issued after admin review (Fines → Attendance review). Fines are never deducted from income.
- **Goals:** progress % = current ÷ target × 100 for positive targets (zero target = met; negative values don’t produce nonsense;
  over-achievement is shown above 100%, the bar caps at 100%). Automatic goals are computed from records by `app.goal_metric_value`
  (attendance days, prospects added/converted, tasks completed, personal/office income, active members, trainings attended, members
  at or above an admin-defined level, challenge score). Target changes keep history. Milestone (50%/100%) notifications are deduplicated.
  “Stepping up” is defined by each office’s configurable levels.
- **Challenges:** explicit start/end dates; eligibility (all / team / minimum level) validated on join; scores computed only from
  verified data (approved submissions when verification is required, approved income, admin-assigned tasks, admin-marked training
  attendance). Ranking: score desc → earliest latest qualifying activity → earliest join; exact ties share a rank. Duplicate
  submissions are blocked by idempotency tokens; one reward per participant. Scoring rules lock once published and are shown to members.
- **Metrics policy:** no composite “performance scores” — dashboards show raw counts with the formula next to ambiguous metrics.

## Notifications & reminders

In-app notifications are created for task assignment/comments/completion, prospect assignment, plan publication, new challenges,
submission reviews, goal milestones, fines and fine changes, financial submissions needing approval, expense decisions and
announcements. Time-based reminders (task due/overdue, prospect follow-ups, fine due dates, check-in reminders) are produced by
`app.generate_reminders`, which is idempotent (dedupe keys) and runs:

1. on a schedule via `GET /api/cron/reminders` with `Authorization: Bearer $CRON_SECRET` (`vercel.json` configures every 30 min); and
2. opportunistically when any member loads the app (throttled to once per 15 minutes per office).

If no scheduler is configured, reminders still appear through (2) but only when someone uses the app.

## Deployment

1. Provision PostgreSQL (any managed Postgres works, including Supabase’s Postgres). `pgcrypto` must be available.
2. Run `npm run db:migrate` with `DATABASE_OWNER_URL` (a role able to create tables, functions and the `officehub_app` role)
   and `DATABASE_APP_PASSWORD`.
3. Deploy the Next.js app (Vercel or any Node host) with `DATABASE_URL` pointing at `officehub_app` and `CRON_SECRET` set.
   With transaction-pooling proxies (PgBouncer/Supavisor) this works because the RLS context is set with `set_config(..., true)`
   inside each transaction.
4. Create the first super admin: insert a user and set `is_super_admin = true` (e.g. adapt `scripts/seed.ts`), then create offices at `/super`.

## Known limitations / integrations requiring configuration

- **Supabase Auth is not used**: authentication is implemented in-app against PostgreSQL (no external auth service was available
  here). Supabase Postgres can host the database; Supabase Auth/Storage are not wired in.
- **No email/SMS:** password recovery is admin-issued temporary passwords; notifications are in-app only.
- **Receipts** are stored in PostgreSQL (`attachments`, ≤5 MB, PDF/PNG/JPEG/WebP verified by file signature). For heavy use, move
  them to object storage behind the same authorization check.
- **Reminders** need the cron endpoint to be scheduled for timely delivery (see above).
- Login rate limiting is per IP/email in the database; there is no CAPTCHA. Other endpoints are not rate limited.
- Multi-currency per office is supported (configurable currency/locale), but there is no FX conversion between offices.
- Admin redirects from member-only users reaching `/admin/*` render the dashboard; the address bar may keep the requested URL
  (a Next.js streaming-redirect behaviour) — no admin data is ever rendered or queried for them.
