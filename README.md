# Tasks (Future Solutions)

Handwritten tasks — written on the iPad with Apple Pencil, instantly visible on the lobby monitor. Branded as **Future Solutions DigitalNotes** (D.A.V.E. — Design · Ambition · Vision · Excellence). This build is configured for personal use: the iPad capture screen is a full-width canvas with metadata fields hidden.

- Preview: https://id-preview--3484a17f-9448-4b9c-96da-9e45faa6568d.lovable.app
- Published: https://doorman-digital-notes.lovable.app
- Custom domain: https://davedghill.com

## Stack

- **Frontend / SSR:** TanStack Start v1 (React 19, Vite 7, file-based routing in `src/routes/`)
- **Backend:** Lovable Cloud (Supabase) — Postgres + Auth + Storage (`note-images` bucket) + RLS
- **Server logic:** TanStack `createServerFn` (see `src/lib/admin.functions.ts`) — no Supabase Edge Functions
- **Styling:** Tailwind CSS v4 via `src/styles.css`, shadcn/ui primitives
- **Charts:** Recharts (admin backup history)
- **Deploy:** Cloudflare Workers (`wrangler.jsonc`)

## App surface

| Route | Purpose | Access |
|---|---|---|
| `/` | Landing — Tasks hero, Write a Note / Dashboard CTAs | Public |
| `/login` | Email+password & Google sign-in, show/hide password, forgot-password | Public |
| `/reset-password` | Set a new password from the email recovery link | Public (token-gated) |
| `/ipad` | Apple Pencil capture canvas (full-width, no side panel) | Authenticated + allowlisted |
| `/monitor` | Lobby board — live, filterable, per-note resize, pinch-zoom | Authenticated + allowlisted |
| `/admin` | Stats, bulk actions, approved-users roster, backup status & history chart | Admin role |
| `/changelog` | Release notes | Admin role |

## Feature highlights

### Capture (`/ipad`)
- Apple Pencil handwriting on `HandwritingCanvas` (pressure-aware strokes, exports a PNG into the `note-images` bucket).
- **Pen / Eraser / Clear all** toolbar — eraser paints over with the sticky-note background color so exports stay opaque.
- **Add space** (`+`) button extends the canvas height by 300px at a time; the canvas lives in a scrollable wrapper so notes can grow past the viewport.
- **No-select CSS** on the canvas prevents iOS from highlighting the page when the Pencil first touches down.
- **Personal mode** — the "Note details" side panel (Written by / Shift / Apartment / Category) has been removed; the canvas spans the full width. Metadata is still saved per note using defaults (writtenBy from the signed-in doorman, shift = Morning, category = Package).
- Edit mode (`/ipad?edit=<id>`) loads the existing PNG back into the canvas via `HandwritingCanvas.loadFromUrl` and updates the same `notes` row on save instead of inserting.

### Lobby board (`/monitor`)
- Live polling of the `notes` table; pinch-to-resize and a global size slider.
- **Per-note resize** — each sticky has its own `size_w` / `size_h` columns so individual notes can be sized independently of the board-wide setting.
- Status filter (open / resolved / all, default open), apartment search, shift & category chips, clear-all.
- **Edit dialog** on each card — change written_by, shift, apartment, category, display date, status, or jump to `/ipad?edit=<id>` to redraw the handwriting.

### Admin (`/admin`)
- Stats dashboard: totals, open vs resolved, today's count, shift/category/day breakdowns.
- Bulk resolve / reopen / delete.
- **Approved-users roster** — invite by email (with optional note) and revoke access in one click. Backed by an `allowed_users` table seeded with the 7 active doormen.
- **Backup status panel** — total notes, latest write (with Healthy/Stale/Inactive badge), approved-user count, storage object count + latest upload. Auto-refreshes every 60s.
- **Backup history chart** — 7d/30d Recharts ComposedChart: per-day bars for notes & images plus two "hours stale" trend lines (amber solid for notes, red dashed for images).

### Auth & access
- Email + password and **Google OAuth** via `supabase.auth.signInWithOAuth`.
- **Show/hide password** toggle on `/login` and `/reset-password`.
- **Forgot password** flow: `resetPasswordForEmail` → email link → `/reset-password` listens for `PASSWORD_RECOVERY` / `SIGNED_IN` and calls `updateUser({ password })`.
- **Invite-only allowlist** — `getMyAccessStatus` server fn revalidates every authenticated navigation and signs out revoked users.
- **Role system** (`user_roles` table + `has_role()` SECURITY DEFINER function) — first signed-in user can self-claim admin when none exists.

### Security
- `note-images` bucket is **private**; SELECT/INSERT require authenticated + allowlisted, UPDATE/DELETE admin-only, no LIST policy.
- `allowed_users` is RLS-locked to admins; the bootstrap path uses a SECURITY DEFINER `is_user_allowed()` with EXECUTE revoked from anon/authenticated.
- Every admin server function gates on `assertAdmin(supabase, userId)` before reading or writing anything.

## Project layout

```
src/
  routes/
    index.tsx                  # landing
    login.tsx
    reset-password.tsx
    _authenticated.tsx         # allowlist guard layout
    _authenticated/
      ipad.tsx
      monitor.tsx
      admin.tsx
      changelog.tsx
  components/
    HandwritingCanvas.tsx      # Pencil capture, pen/eraser, extend()
    NoteCard.tsx               # sticky w/ per-note resize + edit
    EditNoteDialog.tsx
  lib/
    admin.functions.ts         # createServerFn — admin-gated reads/writes
    changelog.ts               # source of truth for /changelog
  integrations/supabase/       # auto-generated — do not edit
supabase/
  migrations/                  # schema history
  config.toml
```

## Development

```bash
bun install
bun run dev      # vite dev server
```

`.env` (Supabase URL + publishable key) is provisioned automatically by Lovable Cloud — do not edit by hand.

## Changelog

See `CHANGELOG.md` or the in-app `/changelog` (admin-only). Latest releases:

- **1.11.0** — Personal-mode iPad: removed the note-details side panel so the canvas is full-width. Renamed every user-facing "ShiftNotes" / "Shift Handoff" string to "Tasks" across meta titles & descriptions (`/`, root, `/monitor`, `/ipad`).
- **1.10.0** — iPad: no-select canvas + extendable writing space (`+` add space button).
- **1.9.0** — Login: show/hide password toggle, forgot-password flow, `/reset-password` page.
- **1.8.1** — Per-note resize on `/monitor` (new `notes.size_w` / `size_h` columns).
- **1.8.0** — Rebrand to Future Solutions DigitalNotes; D.A.V.E. logo in hero.
- **1.7.2** — Admin backup status panel + 7d/30d history chart.
- **1.7.1** — Pixel eraser tool on `/ipad`.
- **1.7.0** — Editable notes, redraw-on-iPad, doorman roster with display names.
- **1.6.0** — Auth-gated `/ipad` & `/monitor`; private `note-images` bucket.
- **1.5.0** — Invite-only allowlist; `/changelog` moved behind admin.
- **1.4.0** — Admin panel, role system, public changelog.
- **1.3.0** — Monitor search, filters, status.
- **1.2.0** — "Return to Main Screen" on monitor.
- **1.1.0** — Pinch-to-resize.
- **1.0.0** — Initial release.
