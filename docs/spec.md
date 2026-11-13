# Don't Ngiao — Spec

Full product and API spec for Don't Ngiao. The short overview is
[README.md](../README.md).

A Splitwise-like expense-splitting app: Vite + React + TypeScript frontend served as
static assets by a Cloudflare Worker, a Cloudflare Worker API in TypeScript, and
Cloudflare D1 (SQLite) as the database. Free tier, no cold start by architecture
(V8 isolates, not containers). No Render, no polling/keep-alive hack.

Live: frontend <https://dont-ngiao-web.wk-io.workers.dev> ·
API <https://dont-ngiao.wk-io.workers.dev> · D1 database `dont-ngiao`.

## What it does

- **Auth — email/password + Google sign-in.** Sessions are random tokens stored in D1
  (14-day idle sliding, 1-hour touch); app and admin sessions are separate tokens.
  Register is gated by Cloudflare Turnstile (Register tab only; the Worker verifies
  the token before the rate limit, fail closed). Google sign-in is an authorization-code
  flow with a full-page redirect; it verifies the email, so it is also the app's
  identity check — there is no separate email verification. Email/password login is kept.
  A Google account links to an existing account by email; linking never renames an
  existing account. Admin login stays email/password.
- **Self-service password:** Change password (or Set password for Google-only accounts),
  min 6 chars, must differ from the current one; a successful change deletes all
  sessions, so it logs out everywhere immediately. An admin can also reset any user's
  password and hands over the reset link manually — there is no email provider.
- **Groups, members.** A member *is* a user: member name = account name by default.
  Manual "Add member" is only for placeholders (name + email, no account); when a
  placeholder later registers with that email, the row activates and the name syncs
  to the account name. Groups have an invite link any member can generate: one active
  link per group, multi-use, no expiry; revoking immediately generates a fresh link.
  Invite tokens are stored in plaintext in D1 (accepted trade-off, so any member can
  re-show/copy the link). Joining is not a Log event; archived groups can't be joined.
- **Multi-currency expenses:** equal / exact amounts / percentages only (shares rejected),
  19-currency picker, per-group default currency (only pre-selects new expenses, never
  retroactive). Equal-split rounding: the entire remainder goes to the payer.
  Money is integer minor units; JPY/KRW/VND are zero-decimal (whole units).
- **Balances and settle, per currency, never netted or converted (no FX):**
  `balance = paid − share + settlements sent − settlements received`, greedy
  creditor/debtor matching, largest first. One Settle flow with an editable amount for
  partial payments; payments are records only, never move real money; a payment cannot
  exceed the outstanding simplified suggestion for that pair + currency.
  Settle auth: creditor only (debtor may settle if the creditor is a placeholder).
  Delete payment: debtor/creditor only. Delete or edit expense: any member may do it.
  Edit mode starts as "exact" with the stored per-person amounts and re-scales them
  when the total changes.
- **Expenses tab:** searchable/filterable list (description substring, Category and
  Paid-by pickers with faceted counts; frontend-only — the chart is not filtered)
  plus a per-currency chart with Group | Mine | Members views. Group = whole-group
  totals; Mine = the requester's own split shares only, computed on the server;
  Members = every member ranked by total paid (gross) in the selected currency.
  Chart currency defaults to the group default when it has data, else the first
  currency with data; an explicit pick always wins.
- **Log tab (money events only):** expense added/edited/deleted, payment
  recorded/deleted. `activity_log` stores member ids; names are resolved live at read.
  Categories: Food & Drink, Transport, Accommodation, Activities, Shopping, Other,
  plus implicit Uncategorized.
- **Calendar date picker** (button + month grid, prev/next, year jump, Today; no native
  date input) in the add-expense and Settle forms. Add-expense is a bottom sheet opened
  by the sticky bar.
- **Group settings:** rename, default currency, archive (not hard delete, restorable,
  preserves everything, archived banner), Leave. Leave is blocked server-side — and
  greyed out in the UI with an explanation — if you have any expense, any payment, or
  a non-zero balance in the group. If the leaver was the creator, creator transfers to
  the earliest remaining account member. If the last account member leaves, the group
  is auto-deleted if clean, archived if expenses/payments remain.
- **Admin (`?admin`, separate login, separate token):** Users module (all real accounts,
  per-user password reset), Groups module (every group with counts, created date +
  creator; detail with members, per-currency money summary, invite link + revoke,
  Archive/Restore, Delete for clean groups only; admin member-remove keeps the money
  guards but overrides the creator-only role check), and Feedback module (every
  submission, All / Open / Done, newest first; detail with sender, group, build and
  sent date; Mark done / Reopen — the only mutation).
- **Feedback (auth-only, no anonymous path).** Any signed-in user can send feedback
  from the You view Feedback section or the header icon on Home and Group screens
  (message-square-text, neutral grey like the gear, 40px circle immediately left of
  the ThemePill). All three doors open the same bottom sheet: type Bug / Idea /
  Question (default Bug), group picker (active groups + General, defaulting to the
  group it was opened from, else the last-opened group, else the first active
  group), message up to 2000 chars. Send is disabled while the message is empty;
  while sending the sheet cannot be dismissed and the label stays "Send" (spinner
  only). On success the Send button becomes a check-circle + "Sent" and the sheet
  closes after about a second — there is no separate success screen (the You row
  is a plain one-liner "Send feedback", no subline, no "New" pill). Sender name and build are recorded with the submission and shown in the
  admin detail, never to the sender. No in-app replies in v1 (the admin replies on
  WhatsApp), no screenshots, no push alert to the admin on new feedback, no
  anonymous submissions. Rate limit: 10 submissions/hour per user.
- **PWA + push notifications.** Installable (Add to Home Screen; iOS 16.4+), manifest +
  service worker with runtime caching only (no precache; `/api/` and `/version.json`
  are never cached). Web Push on new/edited/deleted expense and settle/payment, only
  to current members of that group, never the actor; one global on/off toggle per user
  (a `push_subscriptions` row *is* the opt-in; turning off deletes it). Two-stage
  onboarding: Add to Home Screen first, then Enable notifications (both dismissible
  per session). Dead subscriptions (404/410) are deleted on send.
- **Updates:** every build writes `public/version.json` with a unique `buildId`. The app
  checks it on mount and on returning to the foreground and force-reloads when the
  `buildId` changes — even if a form is open (unsaved drafts can be lost; accepted,
  deploys are infrequent).
- **You view:** avatar + name, "User since {Mon, YYYY} · N groups", appearance pill,
  Account rows (Edit name, Change/Set password, Link Google account, Admin row for
  admins), Notifications toggle, Archived groups list. Light/dark themes are CSS
  variables, follow the system on first load, manual override persisted.
- **Privacy page:** static `web/public/privacy.html`, served at `/privacy.html`.

Deliberately NOT in this app: expense lock, settle-to-expense allocation, payment method
note, FX conversion, real-money payments, recurring expenses, receipt photos, export,
Apple Sign-In, email verification (parked — needs a domain; Google sign-in covers the
identity purpose). No hash routing; invite links use `?invite=`.

## Layout

```
web/                 Vite + React frontend, served as static assets by a Worker
  src/App.tsx        all screens: auth, home, group tabs, modals, settings, admin
  src/api.ts         API client, currency formatting, minor-unit helpers, push + onboarding helpers
  src/calendar.tsx   calendar date picker
  src/pie.tsx        SVG pie/donut + stacked bar chart
  src/main.tsx       app entry, registers /sw.js
  scripts/           generate-icons.mjs (decodes icons.json to public/icons), generate-version.mjs (writes public/version.json)
  public/            manifest.webmanifest, sw.js, privacy.html, icons/, version.json (generated at build, not committed)
worker/              Cloudflare Worker API
  src/index.ts       REST API + auth, admin, invites, groups, expenses, payments
  src/logic.ts       currencies, minor units, equal/percent splits, greedy simplification
  src/push.ts        Web Push sender (VAPID)
  migrations/0001–0011.sql   D1 schema (see below)
  wrangler.toml      Worker + D1 binding (DB)
```

Migrations: `0001` base schema (users, sessions, groups, group_members, expenses,
expense_splits, payments, activity_log) · `0002` session last-seen + rate limits ·
`0003` group icon · `0004` indexes · `0005` admin (`is_admin`, password resets) ·
`0006` activity log member ids · `0007` group invites · `0008` user/member unification ·
`0009` push subscriptions · `0010` `google_sub` · `0011` feedback.

API surface (all group routes require membership, checked server-side; admin routes
require an admin session):

```
POST /api/auth/register   {name, email, password, turnstileToken} -> {user, token}
POST /api/auth/login      {email, password} -> {user, token}
POST /api/auth/google     {code} -> {user, token} (sign in or link-by-email or create)
POST /api/auth/logout
POST /api/auth/reset-password {token, newPassword} (single-use, 24h)
GET  /api/me              PATCH /api/me {name}
POST /api/me/password     {currentPassword?, newPassword} (change, or set when none)
POST /api/me/google/link  {code}
POST /api/me/push-subscription {endpoint, keys...}   DELETE /api/me/push-subscription {endpoint}
POST /api/me/feedback      {type, message, groupId?, buildId?} -> {id} (10/hour per user)
GET  /api/admin/feedback   -> {feedback} (newest first, with sender + group names)
PATCH /api/admin/feedback/:id {status} (open or done)
POST /api/admin/login     {email, password} -> {adminUser, token}
GET  /api/admin/me
GET  /api/admin/users     POST /api/admin/users/:id/reset
GET  /api/admin/groups    GET /api/admin/groups/:id
POST /api/admin/groups/:id/archive   POST /api/admin/groups/:id/restore
DELETE /api/admin/groups/:id         POST /api/admin/groups/:id/invite/revoke
DELETE /api/admin/groups/:id/members/:memberId
GET  /api/groups          -> {active, archived, totals}  (totals over active groups only, per currency)
POST /api/groups          {name, defaultCurrency}
GET  /api/groups/:id      -> full detail: members, expenses+splits, payments, balances, suggestions, categoryGroup, categoryMine, activity, myMemberId, myHasExpense
PATCH /api/groups/:id     {name, defaultCurrency}
POST /api/groups/:id/archive   POST /api/groups/:id/restore   POST /api/groups/:id/leave
GET  /api/groups/:id/activity
GET  /api/groups/:id/invite   POST /api/groups/:id/invite   DELETE /api/groups/:id/invite
POST /api/groups/:id/members  {name, email?}    DELETE /api/groups/:id/members/:memberId (hybrid role check + money guards)
PATCH /api/groups/:id/members/:memberId
POST /api/groups/:id/expenses {description, amountMinor, currency, date, paidByMemberId, category, splitType, participants, percents?, exactAmounts?}
PATCH /api/groups/:id/expenses/:expenseId (same body shape)
DELETE /api/groups/:id/expenses/:expenseId
POST /api/groups/:id/payments {fromMemberId, toMemberId, amountMinor, currency, date}
DELETE /api/groups/:id/payments/:paymentId
GET  /api/invite/:token   POST /api/invite/:token/join
```

Auth: `Authorization: Bearer <token>` header. Passwords are PBKDF2 (WebCrypto, 100k
iterations, SHA-256) with a per-user salt — never stored or logged in plain text.
Rate limits are D1-backed and fail open: register 5/hour + 20/day per IP; login
5 failed attempts / 15 min per IP + email.

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

## Deploy (Cloudflare Workers Builds, git-connected — no API token needed)

Prerequisites: a Cloudflare account linked to GitHub, and this repo pushed to GitHub.
Pushing to `main` deploys both Workers; there is no separate CI. The version source of
truth is the Cloudflare deployments API — there is no version string in the UI.

1. **D1 database:** Cloudflare dashboard → Workers & Pages → D1 → Create database named
   `dont-ngiao`. Apply `worker/migrations/0001–0010.sql` to it, in order, before any code
   that uses the new columns (see the sequencing rule below). Note the database id and
   put it in `worker/wrangler.toml` (`database_id`).
2. **Worker (API) `dont-ngiao`:** Workers & Pages → Create application → Worker →
   Connect to Git, same repo. Root directory: `worker/`. Build command: none (Worker
   builds from source). Bindings → D1 Database → variable name `DB` → database
   `dont-ngiao`. Runtime secrets (Worker → Settings → Variables → Add secret — **not**
   "Secrets used during build", which are invisible at runtime):
   `TURNSTILE_SECRET`, `VAPID_PRIVATE_KEY`, `GOOGLE_CLIENT_SECRET`. Values are never
   in the repo or in chat. Deploy. Note the Worker URL:
   `https://dont-ngiao.wk-io.workers.dev`.
3. **Worker (frontend) `dont-ngiao-web`:** same flow. Root directory: `web/`. Build
   command: `npm install && npm run build` (the `prebuild` step generates the PWA icons
   and `version.json`). Output directory: `dist`, served as static assets. There is no
   `wrangler.toml` in `web/` — the build config lives in the dashboard. Build
   environment variable: `VITE_API_URL=https://dont-ngiao.wk-io.workers.dev`
   (no trailing slash; Vite bakes this in at build time). Deploy. Note the URL:
   `https://dont-ngiao-web.wk-io.workers.dev`.
4. **CORS:** the Worker allows only the frontend origin
   (`https://dont-ngiao-web.wk-io.workers.dev`) — see `ALLOWED_ORIGINS` in
   `worker/src/index.ts`.
5. **Google OAuth (console):** redirect URI is the frontend origin root; scopes are
   `openid email profile` (non-sensitive, no verification review); the consent screen
   is published (In production), so any Google account can sign in. The privacy policy
   link is the `/privacy.html` URL above.

**Deployment sequencing rule — read before changing the schema.** Code inside `worker/`
triggers the API Worker deployment, so check-in order sequences schema vs code:
adding a column → apply the migration in D1 first, then push the code that uses it;
removing a column → push code that stops referencing it first, deploy, then drop the
column. Never retry a table-recreation migration in D1 (the batch runs in a
transaction; use ALTER/INSERT/UPDATE/CREATE INDEX only).

## First-run checklist (after deploy)

1. Open the frontend URL, register an account (Turnstile widget gates the button),
   log out, log back in. Sign in with Google also works once the OAuth client is set up.
2. Create a group, add a member by email, add a SGD 100 equal-split expense → balances
   +50/−50 and one S$50 suggestion.
3. Record the S$50 Settle payment → both balances back to 0.
4. Add a JPY expense → it appears as its own currency block, SGD balances untouched.
5. Try Leave as the expense payer → button greyed out with an explanation; leave as a
   no-expense member → succeeds.
6. Archive a group → it moves to Archived groups; Restore → back to active.
7. Create a solo group and leave → the group disappears from both active and archived
   lists (deleted, not archived).
8. Edit an expense as a different member → allowed; the Log records old → new amount.
9. Open `?admin`, sign in with the admin account → Users and Groups modules load.

## Security notes

- Never commit secrets: there are no secrets in this repo. Runtime secrets live in the
  Worker dashboard (`TURNSTILE_SECRET`, `VAPID_PRIVATE_KEY`, `GOOGLE_CLIENT_SECRET`);
  the Turnstile site key and Google Client ID are public by design and embedded in the
  frontend. The VAPID public key is a constant in both `worker/src/push.ts` and
  `web/src/api.ts`.
- Session tokens are stored in **plaintext** in D1 (known limitation; hashing them is a
  backlog item). Invite tokens are also plaintext, by design.
- CORS is locked to the frontend origin (see step 4 above).
- Automated weekly backup: every Sunday ~09:13 SGT the database is exported to a
  verified `.sql` dump (loads clean, row counts checked against live D1), keeping
  the 2 most recent copies. Before any schema change, still take a fresh manual
  export if real expense data is in it.
