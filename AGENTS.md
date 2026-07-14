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

Blank TanStack Start (React) app. No partner add-ons or feature scaffolding beyond the CLI default starter.

## Scaffold commands

Exact CLI command used (run from a scratch directory, then merged into this project root):

```bash
npx @tanstack/cli@latest create my-tanstack-app --agent --package-manager pnpm --tailwind
```

Notes from that run:
- `--tailwind` is deprecated/ignored; Tailwind is always enabled in TanStack Start scaffolds.
- Scaffold directory was `my-tanstack-app`; contents were merged into `con-carino` and `package.json` / `.cta.json` renamed to `con-carino`.
- Host bootstrap was an empty git repo via Cursor `create_project`; the TanStack CLI output is the source of truth for app files.

Follow-up Intent commands:

```bash
npx @tanstack/intent@latest install
npx @tanstack/intent@latest list
```

Intent result at scaffold time: 9 intent-enabled packages, 31 skills (Start, Router, Devtools, etc.). Prefer `pnpm dlx @tanstack/intent@latest load …` over guessing patterns.

## Chosen stack and integrations

| Choice | Value |
| --- | --- |
| Framework | React + TanStack Start |
| Starter | Blank (file router); `chosenAddOns: []` |
| Router | TanStack Router file-based (`src/routes`) |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` |
| Package manager | pnpm |
| Toolchain | Vite (default CLI toolchain), TypeScript, Vitest |
| Partner integrations | None requested; none installed |

Default starter still includes Header/Footer/ThemeToggle, Home + About routes, and TanStack Devtools — not partner add-ons.

## Environment variables

No env vars are required for the blank starter (`.cta.json` `envVarValues` is empty).

When adding secrets later (per Intent `start-core/execution-model`):
- Server secrets: `process.env.*` **inside** `createServerFn` handlers (or other per-request server code), never at module scope — and never with a `VITE_` prefix.
- Client-exposed values: only `VITE_*` (bundled into the client).
- Do not put secrets in `VITE_*` variables.

## Scripts

```bash
pnpm install   # if deps are missing
pnpm dev       # http://localhost:3000
pnpm build
pnpm preview
pnpm test
pnpm generate-routes
```

## Deployment

No host adapter was selected at scaffold time. Per Intent `start-core/deployment`, common paths are:
- Cloudflare Workers (`@cloudflare/vite-plugin` + wrangler)
- Netlify (`@netlify/vite-plugin-tanstack-start`)
- Nitro targets (Vercel, Node, Docker, Railway, Bun)

Default local production flow: `pnpm build` then `pnpm preview` until a host plugin is added.

## Architecture decisions

- Keep the generated Vite + `tanstackStart()` + React + Tailwind plugin order unless Intent skills say otherwise (`devtools()` should stay first).
- Code is isomorphic by default; use `createServerFn` for server-only work (DB, secrets).
- Do not introduce Next.js patterns (`"use server"`, `app/` router, etc.).
- Preserve file-based routes under `src/routes` and `#/*` import alias to `./src/*`.
- `routeTree.gen.ts` is generated; prefer `pnpm generate-routes` / Vite plugin regeneration over hand-edits.
- App forms use `#/components/app/ui/form` (`FormShell` / `FormField` / `FormRow` / `FormActions`); see `.cursor/rules/form-layout.mdc` and `AddTransferForm` as reference.

## Known gotchas

- Tailwind CLI flag `--tailwind` is ignored; Tailwind is on by default.
- pnpm 11 no longer reads `package.json#pnpm.onlyBuiltDependencies`; allowlist lives in `pnpm-workspace.yaml` (`esbuild`, `lightningcss`).
- Intent `install` keeps a short skill-loading block at the top of this file — keep project context **below** `<!-- intent-skills:end -->`.
- A future Intent version may require an explicit `intent.skills` allowlist; currently all discovered skills are surfaced.

## Next steps

1. Run `pnpm dev` and confirm Home/About.
2. Replace starter chrome (Header/Footer/theme) as product UI takes shape.
3. Add routes under `src/routes` as needed.
4. Load Intent skills before introducing server functions, auth, or a deploy adapter.
5. Optionally add a host plugin when deployment target is known.
