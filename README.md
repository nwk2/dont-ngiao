# Don't Ngiao

Split expenses fairly. Don't be ngiao.

A Splitwise-like expense-splitting app for friends and family: Vite + React +
TypeScript frontend served as static assets by a Cloudflare Worker, a Cloudflare
Worker API in TypeScript, and Cloudflare D1 (SQLite) as the database. Free tier,
no cold start by architecture (V8 isolates, not containers).

Live: frontend <https://dont-ngiao-web.wk-io.workers.dev> ·
API <https://dont-ngiao.wk-io.workers.dev> · D1 database `dont-ngiao`.

The full product and API spec — every feature, route, migration, and rule in
detail — lives in [docs/spec.md](docs/spec.md).

## The rules that define the app

- **No FX, ever.** Balances are per currency, never netted or converted. 19
  currencies; JPY/KRW/VND are whole units, the rest integer cents.
- **One Settle flow**, amount editable for partial payments. Payments are records
  only, never move real money, and can't exceed the outstanding amount. Settle is
  creditor-only (debtor may settle if the creditor is a placeholder); deleting a
  payment is debtor/creditor only.
- **Any member may edit or delete any expense.** Equal-split rounding sends the
  entire remainder to the payer. Splits: equal / exact amounts / percentages only.
- **Leave is guarded.** Leaving is blocked if you have any expense, payment, or
  non-zero balance in the group; creator transfers to the earliest remaining
  account member. A group whose last account member leaves is deleted if clean,
  archived if it has money history.
- **A member is a user.** Member name = account name; manual "Add member" is only
  for placeholders, which activate when they register with that email.
- **Identity is Google sign-in.** Email/password login is kept; there is no
  separate email verification (parked — needs a domain). Admin login stays
  email/password.
- **Invite links:** one active link per group, multi-use, no expiry; revoking
  generates a fresh link immediately. Tokens are stored in plaintext in D1
  (accepted trade-off, so any member can re-show/copy the link).
- **Push notifications** on new/edited/deleted expense and settle/payment, only to
  current members of that group, never the actor; one global on/off toggle per user.
- **PWA** — Add to Home Screen (iOS 16.4+); the app force-reloads on a new build
  when opened or resumed.

Deliberately NOT in this app: expense lock, settle-to-expense allocation, payment
method note, FX conversion, real-money payments, recurring expenses, receipt
photos, export, Apple Sign-In, email verification. No hash routing; invite links
use `?invite=`.

## Layout

```
web/                 Vite + React frontend, served as static assets by a Worker
  src/App.tsx        all screens: auth, home, group tabs, modals, settings, admin
  src/api.ts         API client, currency formatting, minor-unit helpers, push + onboarding helpers
  src/calendar.tsx   calendar date picker
  src/pie.tsx        SVG pie/donut + stacked bar chart
  src/main.tsx       app entry, registers /sw.js
  scripts/           generate-icons.mjs, generate-version.mjs
  public/            manifest.webmanifest, sw.js, privacy.html, icons/, version.json (generated at build)
worker/              Cloudflare Worker API
  src/index.ts       REST API + auth, admin, invites, groups, expenses, payments
  src/logic.ts       currencies, minor units, splits, greedy simplification
  src/push.ts        Web Push sender (VAPID)
  migrations/0001–0010.sql   D1 schema (see docs/spec.md)
  wrangler.toml      Worker + D1 binding (DB)
```

## Local development

```bash
# API
cd worker && npm install && npm run typecheck
# Frontend
cd ../web && npm install && npm run build
# Frontend dev server (point it at a Worker with VITE_API_URL):
VITE_API_URL=http://localhost:8787 npm run dev
```

Worker dev against a local D1:

```bash
cd worker
npx wrangler d1 create dont-ngiao        # note the database_id it prints
# put that id in wrangler.toml, then:
npx wrangler d1 migrations apply dont-ngiao --local
npx wrangler dev
```

## Deploy (Cloudflare Workers Builds, git-connected)

Prerequisites: a Cloudflare account linked to GitHub, and this repo pushed to
GitHub. Pushing to `main` deploys both Workers; there is no separate CI. The
version source of truth is the Cloudflare deployments API — there is no version
string in the UI.

1. **D1 database:** create a database named `dont-ngiao` in the dashboard, apply
   `worker/migrations/0001–0010.sql` in order, and put its id in
   `worker/wrangler.toml` (`database_id`).
2. **Worker (API) `dont-ngiao`:** Connect to Git, root directory `worker/`, no
   build command. Bind D1 as variable `DB`. Runtime secrets (Worker → Settings →
   Variables → Add secret — **not** "Secrets used during build", which are
   invisible at runtime): `TURNSTILE_SECRET`, `VAPID_PRIVATE_KEY`,
   `GOOGLE_CLIENT_SECRET`. Values are never in the repo or in chat.
3. **Worker (frontend) `dont-ngiao-web`:** same flow. Root directory `web/`.
   Build command: `npm install && npm run build` (the `prebuild` step generates
   the PWA icons and `version.json`). Output directory: `dist`. There is no
   `wrangler.toml` in `web/` — the build config lives in the dashboard. Build
   environment variable: `VITE_API_URL=https://dont-ngiao.wk-io.workers.dev`
   (no trailing slash; Vite bakes this in at build time).
4. **CORS:** the Worker allows only the frontend origin
   (`https://dont-ngiao-web.wk-io.workers.dev`) — see `ALLOWED_ORIGINS` in
   `worker/src/index.ts`.
5. **Google OAuth (console):** redirect URI is the frontend origin root; scopes
   are `openid email profile` (non-sensitive, no verification review); the consent
   screen is published (In production), so any Google account can sign in. The
   privacy policy link is `/privacy.html`.

**Deployment sequencing rule — read before changing the schema.** Code inside
`worker/` triggers the API Worker deployment, so check-in order sequences schema
vs code: adding a column → apply the migration in D1 first, then push the code
that uses it; removing a column → push code that stops referencing it first,
deploy, then drop the column. Never retry a table-recreation migration in D1
(the batch runs in a transaction; use ALTER/INSERT/UPDATE/CREATE INDEX only).

## Security notes

- Never commit secrets: there are none in this repo. Runtime secrets live in the
  Worker dashboard; the Turnstile site key and Google Client ID are public by
  design and embedded in the frontend.
- Session tokens are stored in **plaintext** in D1 (known limitation; hashing them
  is a backlog item). Invite tokens are also plaintext, by design.
- CORS is locked to the frontend origin.
- Automated weekly backup: every Sunday ~09:13 SGT the database is exported to a
  verified `.sql` dump (loads clean, row counts checked against live D1), keeping
  the 2 most recent copies. Before any schema change, still take a fresh manual
  export if real expense data is in it.
