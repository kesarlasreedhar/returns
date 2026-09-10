# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Neeros" — a laptop-ready returns processing app for a small business (package name `returns-ops`). Sellers upload catalog/package/item CSVs, processors scan packages and record item condition, and status flows through a refund pipeline. Three roles: `admin` (full access), `seller` (uploads + reports), `processor` (processing queue + scanning).

## Commands

```powershell
npm install
npm run dev         # next dev -p 8085 -> http://localhost:8085/login
npm run build        # next build
npm run start        # next start (serve production build)
npm run lint          # next lint
npm run typecheck   # tsc --noEmit
```

There is no test suite configured in this repo. Node 12/14-compatible target (Next.js 12) — don't introduce dependencies or syntax that assume Node 18+ only.

Demo users (see `src/lib/demo-data.ts` / seeded `app_users` table): `admin@returns.local`, `seller1@returns.local`, `seller2@returns.local`, `processor1@returns.local`.

## Architecture

**Stack:** Next.js 12 (Pages Router) + TypeScript + Supabase (Postgres), deployed to Netlify. Auth is a custom cookie/session system, NOT Supabase Auth.

**Path alias:** `@/*` maps to `src/*` (see `tsconfig.json`).

### Data flow (client -> API -> Supabase)

Every page reads/writes data through `src/lib/storage.ts`, a thin client-side wrapper that calls the Next.js API routes under `pages/api/*` (never calls Supabase directly from the browser). Each API route:

1. Calls `requireSession`/`requireRole` (`src/lib/server/session.ts`) to gate on the custom cookie-based session (`ro_session`, HMAC-signed, not JWT).
2. Validates the request body with `zod`.
3. Delegates to a function in `src/lib/server/data.ts`, which is the only place that talks to Supabase, via `supabaseAdmin` (`src/lib/supabase-admin.ts` — service-role client, bypasses RLS, server-only, never import from client code).

RLS policies were deliberately stripped down to deny `anon`/`authenticated` entirely (see `supabase/migrations/008_tighten_rls.sql`) — the service role is the only path in. When adding a new resource, follow the same three-layer pattern: `storage.ts` (client fetch wrapper) -> `pages/api/<resource>/*.ts` (session + zod) -> `src/lib/server/data.ts` (Supabase query), plus a type in `src/types/domain.ts` describing both the camelCase app shape and the snake_case DB row it's mapped from/to.

### Package/item status pipeline

`PackageStatus` (`src/types/domain.ts`) is `"open" | "scanned" | "ready_for_refund" | "review_for_refund" | "closed"`. The transition logic lives entirely in `evaluatePackageRefundStatus` (`src/lib/server/data.ts`): it loads all `package_items` for a package and computes status from whether every item has been inspected (`actual_condition` set), whether unit counts match, and whether any item's actual condition mismatches its expected condition — with the exception that an actual condition of `"New"` is always treated as acceptable regardless of what was expected. This function is called by client pages (`scanner.tsx`, `mobile-scanner.tsx`) immediately after each `updateItemCondition` call — status is not manually set by processors except via the explicit status dropdown on `processing.tsx`. Every status change is logged to `package_status_history`.

### Auth/session

Login (`pages/api/login.ts`) checks `app_users.password_hash` with bcrypt and sets a signed cookie via `setSessionCookie`. `SESSION_SECRET` env var is required (`src/lib/server/session.ts` throws if missing). The current user's profile for client-side role-gating (`getCurrentUser()` in `src/lib/auth.ts`) is cached in `localStorage`, separate from the httpOnly session cookie that actually authorizes API calls — don't assume the two are always in sync (e.g. after a cookie expires, `getCurrentUser()` can still return a stale cached user until an API call fails).

### CSV/workbook import

Seller-uploaded catalog/packages/package-items CSVs are parsed client-side (`src/lib/csv.ts`, using `papaparse`/`xlsx`) into the `CatalogProduct`/`PackageSummary`/`PackageItem` shapes, then POSTed to `pages/api/uploads/workbook.ts`, which calls `importReturnsWorkbook` — a single Supabase RPC (`import_returns_workbook`, defined in `supabase/migrations/007_atomic_import.sql`) that upserts everything atomically server-side rather than doing row-by-row inserts from Node.

### Scanning

Barcode scanning has three entry points: `scanner.tsx` (desktop, USB scanner or webcam via `@zxing/*`, see `src/lib/zxingScanner.ts`), `mobile-scanner.tsx` (phone camera flow), and manual tracking-number entry. All three ultimately call the same `updateItemCondition` / `evaluatePackageRefundStatus` storage functions.

### Supabase migrations

`supabase/migrations/*.sql` are applied in numeric-prefix order (note `005_add_login_credentials.sql` and `005_operation_notes.sql` share a prefix — check file contents, not just the number, when reasoning about schema history). Apply new schema changes as a new incrementally-numbered migration file rather than editing existing ones.
