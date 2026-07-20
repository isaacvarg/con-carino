# Con Cariño

_Con cariño_ — "with love."

A self-hosted app for coordinating the care of one loved one alongside the household finances that surround it. It keeps the shared family ledger, the caregiver coverage calendar, invoices for paid caregivers, and the document library in one place.

This is built for a single family on their own hardware. There is no tenancy model and no invite flow: care settings are a singleton, sign-in is OAuth-only against providers you configure, and anyone who can sign in is family.

## Features

**[Suggest Features](https://feedback.isaacvargas.dev)**

**Family ledger**

- Accounts — checking, credit card, savings, loan, cash, and investment — organized into groups, each either shared with the family or private to you.
- Transactions covering expenses, income, transfers, balance adjustments, refunds, and reimbursements. Transfers are written as two paired rows so both accounts stay honest.
- Reconciliation mode for working an account against a statement, tracking each row as uncleared, cleared, needs review, or reconciled, with an audit trail of who changed what.
- Payees, categories, and tags as colored, icon-bearing badges you manage yourself.
- Receipt attachments on transactions (up to 5 each).

**Care**

- Loved-one coverage settings: full or partial days, all-day or specific shifts, and which days of the week need covering.
- Caregivers, both paid and family, with hourly rates, pay intervals, and their own calendar colors.
- Recurring weekly or biweekly coverage series that materialize into individual scheduled shifts.
- Shift swaps — one caregiver relinquishes an occurrence, another claims it, and a reviewer approves or rejects.
- A care calendar with event types you define.

**Invoices** — accrued caregiver hours roll into invoices whose lines snapshot the rate and hours at billing time, so later rate changes never rewrite history. Paying an invoice links it to a ledger transaction.

**Documents** — a typed, colored document library with thumbnails (images, plus the first page of PDFs) and fuzzy search.

**Activity** — a field-level audit log across the app recording what changed, from what, to what, and by whom.

**Appearance** — per-user Catppuccin theming: Latte or Macchiato, with 14 accent colors.

> Insights, Meds, Meals, Notes, and Shopping appear in the nav but are placeholders today.

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | [TanStack Start](https://tanstack.com/start) |
| Routing | TanStack Router 1.170, file-based (`src/routes`) |
| Forms & tables | TanStack Form, TanStack Table |
| Language | TypeScript 6 (strict) |
| Build | Vite 8 |
| Styling | Tailwind CSS v4 + daisyUI 5; Catppuccin Latte/Macchiato themes |
| Database | PostgreSQL via Prisma 7  |
| Auth | Auth.js |
| Object storage | [RustFS](https://rustfs.com/)|
| Charts & Search | Chart.js, Fuse.js |
| Tests | Vitest + Testing Library |
| Package manager | pnpm 11 |


## Local development

You need Node 24, pnpm, Docker, and **a PostgreSQL you supply yourself** — `docker-compose.yml` starts RustFS only, not a database. Point `DATABASE_URL` at whatever Postgres you have.

```bash
pnpm install
docker compose up -d      # RustFS: API on :9000, console on :9001
cp .env.example .env      # then fill in DATABASE_URL, AUTH_SECRET, OAuth credentials
pnpm prisma generate      # required — src/generated/prisma is gitignored
pnpm prisma migrate dev
pnpm prisma db seed       # care settings + Family/Employee caregiver types
pnpm dev                  # http://localhost:3000
```

`pnpm prisma generate` has to run before the first dev server or typecheck, since the generated client is not committed.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Dev server on port 3000 |
| `pnpm build` | Production build |
| `pnpm preview` | Serve the build locally |
| `pnpm start` | Run the production server (`server.prod.mjs`) |
| `pnpm test` | Vitest run |
| `pnpm generate-routes` | Regenerate `routeTree.gen.ts` |
| `pnpm exec tsc --noEmit` | Typecheck (no script for this) |

## Configuration

All of these live in `.env` locally; see `.env.example`. In production they are read from the environment by `docker-compose.prod.yml`.

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Used in dev and by `prisma.config.ts`. Production composes its own from the `POSTGRES_*` vars below and ignores this. |
| `POSTGRES_USER` | Defaults to `con_carino`. Production compose only. |
| `POSTGRES_PASSWORD` | **Required in production** — compose refuses to start without it. Keep it alphanumeric: it is interpolated into `DATABASE_URL` unescaped, so `@ / :` or `#` would corrupt the connection string. |
| `POSTGRES_DB` | Defaults to `con_carino`. |
| `AUTH_SECRET` | `npx auth secret`, or `openssl rand -base64 33`. Signs Auth.js sessions **and** the HMAC on file links — rotating it invalidates both. |
| `AUTH_TRUST_HOST` | `true` when running behind a proxy. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | [Google credentials](https://console.cloud.google.com/apis/credentials). |
| `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` | [Discord application](https://discord.com/developers/applications). |
| `AUTH_RESEND_KEY` | [Resend API key](https://resend.com/api-keys). Sends magic-link sign-in emails and swap-request notifications to linked assignees. |
| `AUTH_EMAIL_FROM` | **Required** — the app throws at boot without it. Sender for magic links and swap emails, e.g. `Con cariño <hola@example.com>`. The domain must be verified in Resend. |
| `S3_ENDPOINT` | `http://127.0.0.1:9000` in dev; `http://rustfs:9000` in production. |
| `S3_REGION` | Defaults to `us-east-1`. |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Compose feeds these to RustFS as its admin keys, so both sides must match. |
| `S3_BUCKET` | Defaults to `con-carino`. Created automatically if missing. |
| `S3_FORCE_PATH_STYLE` | `true` for RustFS. |
| `PORT` | Read by `server.prod.mjs` only; defaults to `3000`. |

`S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` are hard requirements — the app throws at startup without them.

## Deployment

Pushes to `main` and `v*` tags build two `linux/amd64` images and push them to GHCR (`.github/workflows/build.yml`):

- `ghcr.io/isaacvarg/con-carino` — the app (Dockerfile `runner` stage)
- `ghcr.io/isaacvarg/con-carino-migrate` — a one-shot `prisma migrate deploy` (Dockerfile `migrate` stage)

Both are tagged with the branch, the short SHA, the semver version on tags, and `latest` on the default branch. `docker-compose.prod.yml` pins them with `IMAGE_TAG` (defaults to `latest`).

To deploy:

```bash
docker network create edge                                    # once
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d
```

`migrate` sits behind the `tools` profile, so `up -d` never starts it — but it is a required step of any deploy carrying a new migration.


## Project structure

```
prisma/
  models/         # schema split by domain: account, care, transaction, document, …
  migrations/
  seed.ts
src/
  routes/         # file-based routes; _app.tsx is the authenticated layout
  server/         # server functions and API handlers — DB access, storage, auth
  lib/            # isomorphic logic: care recurrence, invoicing, reconciliation, search, theming
  components/app/ # UI, grouped by feature area
  styles.css      # Tailwind + daisyUI + the two Catppuccin themes
```

`src/generated/prisma` and `src/routeTree.gen.ts` are generated — don't edit them by hand.
