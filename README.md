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

### Pen color picker (new in 1.14.2)
- **8-color swatch palette** on the `/ipad` toolbar — Black, Red, Blue, Green, Orange, Purple, Yellow, Pink. Tapping a swatch sets the active pen color and switches back to pen mode (so it works mid-erase).
- **Custom color** — a hidden `<input type="color">` is wired to the last swatch so doormen can pick any hex value for highlights or annotations.
- Active swatch shows a `border-2 border-foreground` ring; the canvas exposes `setColor` / `getColor` via its imperative handle, with `colorRef` driving both `ctx.strokeStyle` and `ctx.fillStyle` so bullet/number stamps inherit the chosen color too.

### Simpler edit dialog (1.14.1)
- `EditNoteDialog` on the lobby board now only exposes the fields that actually change day-to-day: **Written by**, **Status** (open / resolved), and **Display date**.
- Removed the Shift, Apartment/Unit, and Category selects — they were vestigial after the personal-mode iPad rework (1.11.0) and added noise to every edit. The underlying columns on `notes` are still populated from defaults at creation time; this is purely a UI simplification.

### Edit-mode safety (1.14.0)
- Opening a note from the lobby via `/ipad?edit=<id>` now **locks the input mode to handwriting** — the handwrite / type / voice switcher is hidden while editing.
  - Previously, tapping "Type" would unmount the canvas, blank out the loaded PNG, and silently overwrite the original note on save. Reported by a doorman who lost a note this way.
- Initial mode defaults to `handwrite` whenever `editId` is present, regardless of any `?mode=` deep link, so the existing PNG always loads back into `HandwritingCanvas` via `loadFromUrl`.

### Voice notes (new in 1.13.0)
- **Record + auto-transcribe** — both `/ipad` and `/monitor` expose a voice note flow. Recording uses the browser `MediaRecorder` API (`src/components/VoiceRecorder.tsx`) with start/stop/playback preview before saving.
- **Transcription** — recorded audio is base64-encoded and sent to the `transcribeAudio` server function (`src/lib/voice.functions.ts`), which calls the Lovable AI Gateway (`google/gemini-2.5-flash`) for a verbatim transcript. No API key needed.
- **Storage** — the original recording is uploaded to a new private `note-audio` bucket (RLS: allowlisted users upload/read, admins delete). The transcript is rendered to a PNG (same pipeline as handwriting) so it appears as a normal sticky on the lobby board, with `audio_url` stored on the `notes` row.
- **Playback** — `NoteCard` shows an audio toggle on any note that has `audio_url`; clicking it streams the recording via a short-lived `createSignedUrl` from the private bucket.
- **Entry points** — `/ipad` now accepts a `mode` search param (`handwrite | type | voice`); `/monitor` has a "Voice Note" quick-action button in the header that links to `/ipad?mode=voice`.

### Login UX hardening (1.13.1)
- Friendlier error message when Supabase returns "Invalid login credentials" — guides the user to **Continue with Google** (Google-only accounts) or **Forgot password** (password accounts) instead of the raw error.
- Emails are trimmed and lower-cased before `signInWithPassword`, `signUp`, and `resetPasswordForEmail` to avoid invisible-whitespace / case mismatches.
- Proper `autoComplete` + `inputMode` attributes on email/password fields so iOS password managers and autofill behave correctly.

### Capture (`/ipad`)
- Apple Pencil handwriting on `HandwritingCanvas` (pressure-aware strokes, exports a PNG into the `note-images` bucket).
- **Pen / Eraser / Clear all** toolbar — eraser paints over with the sticky-note background color so exports stay opaque.
- **Add space** (`+`) button extends the canvas height by 300px at a time; the canvas lives in a scrollable wrapper so notes can grow past the viewport.
- **Bullet & Number stamps** — two toolbar buttons arm a sticky "stamp mode" with a pulsing on-canvas banner. Tap to drop a marker, or tap-and-drag to lay out a whole checklist in one motion (smart min-spacing prevents overlap). Numbering auto-increments across taps; **Reset #** restarts at 1.
- **Paste from clipboard** — `Cmd/Ctrl+V` anywhere on `/ipad` (or the **Paste** toolbar button for touch) drops the clipboard contents into the note. Text is word-wrapped at the page margins; images are scaled to fit and the canvas auto-grows to fit pasted content.
- **YouTube AI summary** — paste a YouTube URL into the toolbar input and hit **Summarize** (or Enter). A server function pulls the video's caption track (preferring manual English, falling back to any English, then translating non-English captions), feeds the transcript to Lovable AI (Gemini 2.5 Flash), and inserts a 4–6 bullet summary into the note. If no captions exist, falls back to a best-guess summary from the title/channel and labels it as such.
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
    VoiceRecorder.tsx          # MediaRecorder UI w/ preview playback
    NoteCard.tsx               # sticky w/ per-note resize, edit, audio playback
    EditNoteDialog.tsx
  lib/
    admin.functions.ts         # createServerFn — admin-gated reads/writes
    voice.functions.ts         # createServerFn — audio → Gemini transcript
    youtube.functions.ts       # createServerFn — caption-scrape + AI summary
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

- **1.14.2** — Pen color picker on `/ipad`: 8 preset swatches plus a custom hex picker, threaded into `HandwritingCanvas` via `setColor` / `getColor` so strokes and bullet/number stamps all inherit the chosen color.
- **1.14.1** — `EditNoteDialog` simplified to Written by / Status / Display date — Shift, Apartment/Unit, and Category fields removed.
- **1.14.0** — Edit-mode safety: hide the handwrite/type/voice switcher when opening a note via `/ipad?edit=<id>` and force initial mode to handwriting so existing notes can't be accidentally blanked.
- **1.13.1** — Login: friendlier "invalid credentials" message that points users to Google sign-in or password reset; emails normalized (trim + lowercase); proper autocomplete attributes.
- **1.13.0** — Voice notes end-to-end: record on `/ipad` or `/monitor`, auto-transcribe via Lovable AI (Gemini 2.5 Flash), store original audio in a private `note-audio` bucket, play back inline on each `NoteCard`. New `audio_url` column on `notes`, new `transcribeAudio` server function, and a `mode=voice` deep link on `/ipad`.
- **1.12.0** — `/ipad`: bullet & number stamps (with tap-and-drag and auto-numbering), clipboard paste (text + images) via Cmd/Ctrl+V or toolbar button, and an AI-powered YouTube summary tool that uses the video's captions when available.
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
