<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

# con-carino

Private, self-hosted family app: a shared household ledger (accounts, transactions, reconciliation) plus care coordination for a single loved one (coverage schedule, shift swaps, caregiver invoices) and a document library. Single-family by design — care settings are a singleton and auth is OAuth-only.

See `README.md` for the product overview, setup, and deploy flow.

## Stack and integrations

| Choice | Value |
| --- | --- |
| Framework | React 19 + TanStack Start (SSR, `createServerFn`) |
| Router | TanStack Router file-based (`src/routes`) |
| Database | PostgreSQL via Prisma 7 + `@prisma/adapter-pg` driver adapter |
| Auth | Auth.js (`@auth/core`, `start-authjs`, Prisma adapter) — Google + Discord, database sessions |
| Object storage | RustFS (S3-compatible) via `@aws-sdk/client-s3` |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` + daisyUI; Catppuccin Latte/Macchiato themes in `src/styles.css` |
| Package manager | pnpm 11 |
| Toolchain | Vite, TypeScript, Vitest |
| Lint/format | None configured |

Prefer `pnpm dlx @tanstack/intent@latest load …` over guessing TanStack patterns.

## Environment variables

Required — see `.env.example` for the full list and comments. `DATABASE_URL`, `AUTH_SECRET`, the Google/Discord OAuth pairs, and `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` (hard-required via `requireEnv` in `src/lib/storage.ts`).

`AUTH_SECRET` also signs file-link HMACs (`src/lib/file-tokens.ts`), not just sessions.

Handling (per Intent `start-core/execution-model`):
- Server secrets: `process.env.*` **inside** `createServerFn` handlers (or other per-request server code), never at module scope — and never with a `VITE_` prefix.
- Client-exposed values: only `VITE_*` (bundled into the client).
- Do not put secrets in `VITE_*` variables.

## Scripts

```bash
pnpm install          # if deps are missing
pnpm prisma generate  # required before first dev/typecheck; src/generated/prisma is gitignored
pnpm dev              # http://localhost:3000
pnpm build
pnpm preview
pnpm test
pnpm generate-routes
pnpm exec tsc --noEmit  # typecheck; no script for it
```

Dev needs a Postgres you supply — `docker-compose.yml` starts RustFS only, no database.

## Deployment

Docker images built and pushed to GHCR by `.github/workflows/build.yml` (app = Dockerfile `runner` stage, migrations = `migrate` stage), deployed via `docker-compose.prod.yml` behind a reverse proxy on an external `edge` network. Migrations run as a separate `tools`-profile service before `up -d`. See `README.md` for the exact flow and network topology.

## Architecture decisions

- Keep the Vite plugin order in `vite.config.ts`: `[tailwindcss(), tanstackStart(), viteReact()]`.
- Code is isomorphic by default; use `createServerFn` for server-only work (DB, secrets). Server functions live in `src/server/`.
- Files are served through same-origin `/api/files` and `/api/uploads` with HMAC-signed links, never browser-facing presigned S3 URLs — the object store is unreachable from the browser in production.
- Do not introduce Next.js patterns (`"use server"`, `app/` router, etc.).
- Preserve file-based routes under `src/routes` and `#/*` import alias to `./src/*`.
- `routeTree.gen.ts` is generated; prefer `pnpm generate-routes` / Vite plugin regeneration over hand-edits.
- App forms use `#/components/app/ui/form` (`FormShell` / `FormField` / `FormRow` / `FormActions`); see `.cursor/rules/form-layout.mdc` and `AddTransferForm` as reference.

## Known gotchas

- pnpm 11 no longer reads `package.json#pnpm.onlyBuiltDependencies`; allowlist lives in `pnpm-workspace.yaml` (`esbuild`, `lightningcss`, `@prisma/engines`, `prisma`).
- Prisma uses directory mode (`schema: 'prisma'` in `prisma.config.ts`), so models are split across `prisma/models/*.prisma`; `prisma/schema.prisma` holds only the datasource and generator.
- `sharp`, `@napi-rs/canvas`, and `pdfjs-dist` are native/ESM-awkward — they stay in `ssr.external` and `optimizeDeps.exclude` in `vite.config.ts`.
- Theme and accent names are duplicated in the pre-paint `THEME_INIT_SCRIPT` in `src/routes/__root.tsx`; keep them in sync with `src/lib/themes.ts` and `src/lib/accents.ts`.
- `src/routes/about.tsx` is leftover starter content, not product.
- Intent `install` keeps a short skill-loading block at the top of this file — keep project context **below** `<!-- intent-skills:end -->`.
- A future Intent version may require an explicit `intent.skills` allowlist; currently all discovered skills are surfaced.
