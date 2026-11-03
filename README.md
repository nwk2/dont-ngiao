# Don't Ngiao

Split expenses fairly. Don't be ngiao.

A Cloudflare port of the Splitwise-like expense-splitting MVP: Vite + React + TypeScript
frontend on Cloudflare Pages, a Cloudflare Worker API in TypeScript, and Cloudflare D1
(SQLite) as the database. Free tier, no cold start by architecture (V8 isolates, not
containers). No Render, no polling/keep-alive hack.

## What it does (MVP, no more)

- Accounts/login (email/password, session token in D1; no email verification, no password reset)
- Groups, members (existing accounts link by email; otherwise a placeholder they can claim by signing up with the same email)
- Multi-currency expenses: equal / exact amounts / percentages only (shares rejected),
  19-currency picker, group default currency (SGD) only pre-selects new expenses, never retroactive
- Money as integer minor units; JPY/KRW/VND are zero-decimal (whole units)
- Per-currency balances and simplified settle-up, never netted or converted (no FX):
  `balance = paid − share + settlements sent − settlements received`, greedy creditor/debtor matching
- One Settle flow with an editable amount for partial payments; payments are records only, never move real money;
  a payment cannot exceed the outstanding simplified suggestion for that pair + currency
- Categories: Food & Drink, Transport, Accommodation, Activities, Shopping, Other, plus implicit Uncategorized.
  Expenses tab shows a per-currency pie chart with a Group | Mine toggle. Group = whole-group totals.
  Mine = the requester's own split shares only, computed on the server — other members' individual
  breakdowns are never sent to the client. No category filter.
- 4 tabs: Expenses | Balances | Members | Activity. Append-only activity log, actor name snapshotted at write time, newest first.
- Calendar date picker (button + month grid, prev/next, year jump, Today; no native date input) in the
  add-expense and Settle forms. Add-expense is a full-screen modal opened only by the sticky button.
- Group settings: rename, default currency for new expenses, archive (not hard delete, restorable,
  preserves everything, archived banner), Leave. Leave is blocked server-side — and greyed out in the UI
  with an explanation — if you have any expense in the group as payer or split participant, regardless
  of settled/zero balances. A member with no expenses can leave; if the last member leaves, the group is
  deleted (it has no expenses to preserve), unless expenses/payments somehow remain, in which case it is archived instead.
- Expense list rows show each expense's own currency code + symbol (SGD S$, JPY ¥, USD $, …) next to the amount.

Deliberately NOT in this port: edit expense, expense lock, settle-to-expense allocation, payment method
note, Google OAuth, invite/share code, recurring expenses, notifications, receipt photos, export.

## Layout

```
web/                 Vite + React frontend (Cloudflare Pages)
  src/App.tsx        all screens: auth, home, group tabs, modals, settings
  src/api.ts         API client, currency formatting, minor-unit helpers
  src/calendar.tsx   calendar date picker
  src/pie.tsx        SVG pie chart
worker/              Cloudflare Worker API
  src/index.ts       REST API: /api/auth/*, /api/me, /api/groups/*, /api/groups/:id/expenses|payments|members
  src/logic.ts       currencies, minor units, equal/percent splits, greedy simplification
  migrations/0001_init.sql   D1 schema: users, sessions, groups, group_members, expenses, expense_splits, payments, activity_log
  wrangler.toml      Worker + D1 binding (DB)
```

API surface (all group routes require membership, checked server-side):

```
POST /api/auth/register   {name, email, password} -> {user, token}
POST /api/auth/login      {email, password} -> {user, token}
POST /api/auth/logout
GET  /api/me              PATCH /api/me {name}
GET  /api/groups          -> {active, archived, totals}  (totals over active groups only, per currency)
POST /api/groups          {name, defaultCurrency}
GET  /api/groups/:id      -> full detail: members, expenses+splits, payments, balances, suggestions, categoryGroup, categoryMine, activity, myMemberId, myHasExpense
PATCH /api/groups/:id     {name, defaultCurrency}
POST /api/groups/:id/archive   POST /api/groups/:id/restore   POST /api/groups/:id/leave
POST /api/groups/:id/members  {name, email?}    DELETE /api/groups/:id/members/:memberId (zero balance + no expenses/payments only)
POST /api/groups/:id/expenses {description, amountMinor, currency, date, paidByMemberId, category, splitType, participants, percents?, exactAmounts?}
DELETE /api/groups/:id/expenses/:expenseId
POST /api/groups/:id/payments {fromMemberId, toMemberId, amountMinor, currency, date}
DELETE /api/groups/:id/payments/:paymentId
```

Auth: `Authorization: Bearer <token>` header. Passwords are PBKDF2 (WebCrypto, 100k iterations,
SHA-256) with a per-user salt — never stored or logged in plain text.

## Local development

```bash
# API
cd worker && npm install && npm run typecheck
# Frontend
cd ../web && npm install && npm run build
# Frontend dev server (point it at a Worker with VITE_API_URL):
VITE_API_URL=http://localhost:8787 npm run dev
```

Worker dev against a local D1 (requires wrangler login for remote, local works without):

```bash
cd worker
npx wrangler d1 create dont-ngiao        # note the database_id it prints
# put that id in wrangler.toml, then:
npx wrangler d1 migrations apply dont-ngiao --local
npx wrangler dev
```

## Deploy to Cloudflare (dashboard, git-connected — no API token needed)

Prerequisites: a Cloudflare account linked to GitHub, and this repo pushed to GitHub.

1. **D1 database:** Cloudflare dashboard → Workers & Pages → D1 → Create database named `dont-ngiao`.
   Then, from a machine with wrangler logged in, or via the dashboard's D1 console, apply
   `worker/migrations/0001_init.sql` to that database. Note the database id and put it in
   `worker/wrangler.toml` (`database_id`), or set the binding in the Worker settings.
2. **Worker (API):** Workers & Pages → Create application → Workers → Connect to Git, or
   import this repo. Root directory: `worker/`. Build command: none (Worker builds from source).
   Bindings → D1 Database → variable name `DB` → database `dont-ngiao`.
   Deploy. Note the Worker URL, e.g. `https://dont-ngiao-api.<subdomain>.workers.dev`.
3. **Pages (frontend):** Workers & Pages → Create application → Pages → Connect to Git, same repo.
   Root directory: `web/`. Framework preset: Vite. Build command: `npm install && npm run build`.
   Output directory: `dist`. Environment variable (production): `VITE_API_URL=https://dont-ngiao-api.<subdomain>.workers.dev`
   (no trailing slash). Redeploy after setting it — Vite bakes this in at build time.
4. **CORS:** the Worker currently allows `*` origins for the MVP. If you want to lock it down later,
   replace `*` in `worker/src/index.ts` with your Pages domain.

## First-run checklist (after deploy)

1. Open the Pages URL, register an account, log out, log back in.
2. Create a group, add a member by email, add an SGD 100 equal-split expense → balances +50/−50 and one S$50 suggestion.
3. Record the S$50 Settle payment → both balances back to 0.
4. Add a JPY expense → it appears as its own currency block, SGD balances untouched.
5. Try Leave as the expense payer → button greyed out with an explanation; leave as a no-expense member → succeeds.
6. Archive a group → it moves to Archived groups; Restore → back to active.
7. Create a solo group and leave → the group disappears from both active and archived lists (deleted, not archived).

## Security notes

- Never commit secrets: there are no secrets in this repo. Session secret handling is via random
  session tokens in D1; the Worker has no JWT secret to manage in this MVP.
- The Worker allows CORS `*` in this MVP — see step 4 above to tighten it.
- Free D1 has no automated backups. Export/backup the database before any schema change if real
  expense data is in it.
