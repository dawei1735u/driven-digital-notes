# Changelog

All notable changes to **ShiftNotes** are documented in this file. The same content is rendered in-app at `/changelog`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.20.0] — 2026-06-02 — Search the board + OCR every handwritten note

### Added
- **Keyword search on `/monitor`.** New search box in the toolbar with a `Search` icon and a clear (×) button. Live, case-insensitive, multi-word AND filtering across `transcribed_text`, `written_by`, `category`, `apartment`, and `shift`. The existing `filtered / total` badge updates automatically.
- **Auto-tile search results.** When a search is active, results are re-tiled into a fresh grid (saved `position_x` / `position_y` are ignored for that view) so matches are always visible on the board instead of being hidden off-screen by their stored coordinates.
- **Search empty-state.** When no notes match, the board shows `No notes match "<query>"` instead of a blank canvas.
- **OCR for handwritten / drawn / photo notes.** New `ocrNote` server function (`src/lib/ocr.functions.ts`) downloads the saved PNG from the `note-images` bucket and sends it to `google/gemini-2.5-flash` via the Lovable AI Gateway with a strict-output system prompt (`Return ONLY the text content as plain text in the SAME LANGUAGE that was written — never translate.`). The extracted text is written back to `notes.transcribed_text` so the new search box can find it.
- **Auto-OCR on save from `/ipad`.** Any non-voice note (handwrite, type, photo, edit) triggers a fire-and-forget `ocrFn({ noteId })` after the row is inserted/updated. Voice notes skip OCR because their `transcribed_text` already comes from the audio transcript.
- **Admin backfill.** New `ocrBackfillAll` server function (admin-only, gated by `has_role(_, 'admin')`) iterates over every note with `transcribed_text IS NULL OR ''` and runs OCR on each. A **Run backfill** card on `/admin` reports `processed / ok / failed` and the first few errors; bails out early on AI-gateway rate-limit (429) or credit-exhausted (402) so admins can retry later without burning through quota.

### Fixed
- Searching for a word that exists only inside a handwritten or drawn note used to return zero hits because the text lived in the image pixels, not in `transcribed_text`. Auto-OCR on save + the one-time admin backfill make every note searchable.

### Files touched
- `src/lib/ocr.functions.ts` — new `ocrNote` (workspace-scoped) and `ocrBackfillAll` (admin-only) server functions; Gemini 2.5 Flash via the Lovable AI Gateway.
- `src/routes/_authenticated/ipad.tsx` — `useServerFn(ocrNote)`; fire-and-forget call after both insert and update branches when `mode !== "voice"`.
- `src/routes/_authenticated/admin.tsx` — new `OcrBackfillCard` with a **Run backfill** button + processed/ok/failed/errors readout.
- `src/routes/_authenticated/monitor.tsx` — `search` state, toolbar `<input>` with Search/X icons, multi-term AND filter, search-active tile override, search empty-state message.

---

## [1.19.0] — 2026-05-23 — Delete notes + restore mode toggle in edit

### Added
- **Delete a note from the lobby board.** Each `NoteCard` on `/monitor` now has a trash icon in its header that opens a confirmation `AlertDialog` ("This will permanently delete the note and its image. This action cannot be undone."). Confirming removes the row from Supabase and the card from the board in one motion.
- **Delete button in the edit dialog.** `EditNoteDialog` now exposes a red **Delete** button in the footer next to **Redraw on iPad**, gated by the same confirmation dialog. Useful when a doorman is already inspecting a note and decides it's stale.
- **`notes_delete_workspace` RLS policy** — allowlisted users can delete notes inside their own workspace. Previously DELETE was admin-only, which forced every cleanup through `/admin` bulk actions.

### Fixed
- **Mode toggle now appears when redrawing a note.** Opening `/ipad?edit=<id>` previously hid the Handwrite / Type / Voice / Photo switcher (the `!isEdit &&` guard short-circuited the JSX). It's now visible in edit mode too, so a doorman re-opening a note can switch to Type or attach a Photo without having to discard and recreate the note. The edit-mode safety rule from 1.14.0 — initial mode defaults to `handwrite` so the existing PNG always reloads — is still in force.

### Files touched
- `supabase/migrations/20260523055429_*.sql` — new `notes_delete_workspace` policy: `using (is_user_allowed(auth.uid()) and workspace_id is not distinct from get_my_workspace_id())`.
- `src/components/NoteCard.tsx` — trash icon in header + `AlertDialog` confirmation, calls `onDelete(note.id)`.
- `src/components/EditNoteDialog.tsx` — destructive **Delete** button in the footer wired to the same confirmation flow.
- `src/routes/_authenticated/monitor.tsx` — `onDelete` handler: `await supabase.from("notes").delete().eq("id", id)` then prunes the note from local state; toast on failure.
- `src/routes/_authenticated/ipad.tsx` — removed the `!isEdit &&` guard around the mode toggle so all four modes render in edit mode.

---

## [1.18.0] — 2026-05-19 — ES → EN translation on /monitor + camera error toasts

### Added
- **Translate ES → EN** button in the expanded sticky overlay on `/monitor`. Sends the note image to Gemini 2.5 Flash via the Lovable AI Gateway and renders a side panel with the verbatim Spanish original and a clean English translation.
- New `translateNote` server function (`src/lib/translate.functions.ts`) — calls `google/gemini-2.5-flash` with a strict-JSON system prompt (`{ original, translation }`); 429 / 402 errors are surfaced as user-facing toasts instead of throwing into the console.
- Root-level `sonner` toaster (`src/routes/__root.tsx`, `<Toaster richColors closeButton />`) so any error in the camera or translation flows becomes a clear, dismissable notification.
- Camera error toasts on `/ipad`: if `cameraInputRef.current` is null, the browser blocks `input.click()`, the picker never resolves within an 8s `photoTimerRef` timeout, or pasting the captured photo into `HandwritingCanvas` fails, the user gets a red toast with a **Retry** action that re-invokes `openCamera()`.

### How it was built
- Added `useServerFn(translateNote)` in `monitor.tsx` with `translation` / `translating` local state and a `runTranslate` handler that calls `translateNote({ data: { imageUrl: n.image_url } })` and `toast.error(...)` on failure with a Retry action.
- Wrote `translate.functions.ts` using `createServerFn({ method: "POST" })` + `inputValidator` (Zod) + a handler that posts to the Lovable AI Gateway with `messages: [{ role: "system", ... }, { role: "user", content: [{ type: "image_url", image_url: { url } }] }]` and parses the JSON response.
- Hardened `openCamera()` / `onCameraFile()` in `ipad.tsx` with try/catch, an 8s setTimeout cleared inside `onCameraFile`, and `toast.error(..., { action: { label: "Retry", onClick: openCamera } })`.
- Mounted `<Toaster />` once at the root so every route can call `toast.error()` without extra wiring.

### Files touched
- `src/lib/translate.functions.ts` — new server function (Gemini 2.5 Flash, strict-JSON output).
- `src/routes/_authenticated/monitor.tsx` — Translate ES → EN button, side panel, `useServerFn` wiring, error toasts.
- `src/routes/_authenticated/ipad.tsx` — camera error handling, `photoTimerRef` 8s watchdog, retry toasts.
- `src/routes/__root.tsx` — mounted `<Toaster richColors closeButton />` from `sonner`.

---

## [1.17.0] — 2026-05-19 — Expand-to-read overlay, pinch/double-tap zoom, and in-note photos

### Added
- **Expand any sticky to a readable size.** Tapping a note on `/monitor` opens a full-screen overlay that scales the PNG up to the viewport so handwriting is legible without resizing the card.
- **Pinch-to-zoom and double-tap zoom** on the expanded overlay (`src/components/ZoomableImage.tsx`) — two-finger pinch on touch, scroll-wheel zoom on desktop, double-tap to toggle between 1× and 2.5×. One-finger pan while zoomed.
- **Reset · Nx** button in the overlay — snaps zoom back to 1× and displays the current zoom level (disabled at 1×). Uses `Minimize2`.
- **Fit** button in the overlay — scales the image to fully fill the viewport edge-to-edge (eliminates `object-contain` letterboxing) and re-centers it. Uses `Maximize`.
- **Photo** button in the `/ipad` mode toolbar, sized to match the Handwrite/Type/Voice pills and placed to the right of Voice. Opens the device camera via a hidden `<input type="file" accept="image/*" capture="environment">` and pastes the captured image into the active sticky via `HandwritingCanvas.pasteImage(url)`. Requires Handwrite mode.

### Files touched
- `src/components/ZoomableImage.tsx` — new component (pinch/wheel/double-tap zoom, pan, `resetZoom()`, `fitToViewport()`, Reset/Fit buttons).
- `src/components/NoteCard.tsx` — click handler opens the expand overlay.
- `src/routes/_authenticated/monitor.tsx` — expanded-sticky overlay wired to `ZoomableImage`.
- `src/routes/_authenticated/ipad.tsx` — `Photo` button + hidden camera input next to the Voice button; `openCamera()` / `onCameraFile()` handlers.

---

## [1.16.0] — 2026-05-17 — Click-to-front sticky notes on /monitor

### Added
- **Click any sticky to bring it to the foreground.** Tapping or dragging a note on `/monitor` now raises it above its neighbors so the corner resize handle is reachable and overlapping notes can be widened/read without manually shuffling other stickies out of the way.
- Per-note z-index tracking: new `zOrder: Record<string, number>` state plus a `zCounterRef` (starts at 10). `bringToFront(id)` is a `useCallback` that increments the counter and writes the new value into `zOrder`.
- Each note wrapper now has `onPointerDown={() => bringToFront(n.id)}`. The wrapper's inline `zIndex` resolves to `9999` while the note is actively being dragged (`dragRef.current?.id === n.id`), otherwise `zOrder[n.id] ?? 1` — so the most recently touched note always stays on top.

### Files touched
- `src/routes/_authenticated/monitor.tsx` — `zOrder` state, `zCounterRef`, `bringToFront` callback, per-note `onPointerDown` + `zIndex` wiring.

---

## [1.15.1] — 2026-05-17 — Preview-iframe login hardening

### Fixed
- **Google sign-in inside the Lovable preview iframe.** `src/routes/login.tsx` now detects iframe context via `isEmbeddedPreview()` (`window.self !== window.top`). When embedded, the Google button opens the same login URL in a **new top-level tab** with `?oauth=google` appended, so the OAuth state cookie can round-trip and 2FA can complete — previously the flow failed with "State is invalid" because third-party cookies are blocked inside the preview iframe.
- **Friendlier 'Invalid login credentials' message.** The error copy now points the user to **Continue with Google + 2FA** (the actual flow for this account) instead of implying the typed password is wrong.

### Changed
- New `startGoogleSignIn()` helper wraps `lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin + destinationAfterAuth() })` so both the button click and the `?oauth=google` auto-resume path share one implementation.

### Files touched
- `src/routes/login.tsx` — `friendlyAuthError`, `isEmbeddedPreview`, `startGoogleSignIn`, `handleGoogle` branch, `?oauth=google` query handling.

---

## [1.15.0] — 2026-05-17 — Tile notes & snap-to-grid on /monitor

### Added
- **Tile notes** button in the `/monitor` header. `tileAll()` arranges every visible note into a clean grid sized to the current note dimensions and board width, then persists the new `position_x` / `position_y` to Supabase in one batched update. Useful after notes drift apart from manual dragging or pinch-resize.
- **Snap to grid** toggle (LayoutGrid icon). Persisted to `localStorage` under `shiftnotes:snapToGrid`. When on, dragged notes and the Tile action snap to a 24px grid via `snap(v) = Math.round(v / GRID_SIZE) * GRID_SIZE` applied inside the drag handler and the tile layout function. `aria-pressed` reflects state and the tooltip explains the behavior.

### Files touched
- `src/routes/_authenticated/monitor.tsx` — `snapToGrid` state + load/save effects, `snap()` helper, `tileAll()` callback, `LayoutGrid` icon import, two new toolbar buttons.

---

## [1.7.0] — 2026-05-15 — Editable notes & doorman roster

## [1.7.2] — 2026-05-15 — Backup status panel & history chart

### Added
- **Backup status panel on the admin panel.** New card in `/admin` that surfaces the data points an admin can verify directly from the app: total notes in DB, timestamp of the most recent note (with a coarse `Healthy` / `Stale` / `Inactive` badge based on hours since last write), approved-user count, and the `note-images` storage bucket object count + latest upload time. Auto-refreshes every 60s and has a manual Refresh button.
- **Backup activity history chart.** Second card on `/admin` rendering a 7-day / 30-day toggleable Recharts `ComposedChart` with per-day bars for Notes created and Images uploaded (left axis, write counts) plus two trend lines for end-of-day "hours stale" — i.e. how many hours had passed since the most recent note / image upload at the close of each day (right axis). Lower is fresher; the lines flatten into the floor on active days and ramp up across quiet days.

### Changed
- `src/lib/admin.functions.ts` got two new admin-gated server functions:
  - `adminGetBackupStatus` (GET) — runs four parallel Supabase queries (`notes` count head-only, latest+oldest `notes.created_at` via `maybeSingle`, `allowed_users` count) and lists the `note-images` storage bucket via the **admin** client (RLS on `storage.objects` blocks the user-scoped client from listing). Returns `{ checkedAt, provider, database: { notesTotal, latestNoteAt, oldestNoteAt, hoursSinceLastNote, approvedUsers }, storage: { bucket, imageCount, latestImageAt } }`. Storage failure is non-fatal — fields fall back to `null`.
  - `adminGetBackupHistory` (POST, `{ days: 7 | 30 }`) — fetches all `notes.created_at` since `now - days*24h` plus a `storage.list("", { limit: 1000, sortBy: created_at asc })` of the bucket. Bins both into per-UTC-day buckets, then walks the window day-by-day carrying a running `lastNoteSeen` / `lastImageSeen` so each row's `noteHoursStale` / `imageHoursStale` reflects staleness at end-of-day (or `now` for the current day, whichever is earlier). Returns `{ days, series: Array<{ date, notesCreated, imagesUploaded, lastNoteAt, lastImageAt, noteHoursStale, imageHoursStale }> }`.
- `src/routes/_authenticated/admin.tsx` wires both functions through `useServerFn` + `useQuery`. The history range is held in local `useState<7 | 30>(7)` and keyed into the query so toggling triggers a refetch (also re-runs every 5min). New `<BackupStatus>` and `<BackupHistoryChart>` components are rendered between `<StatsGrid>` and the Approved-users table.
- Both server functions go through `assertAdmin(supabase, userId)` (which calls `has_role(auth.uid(), 'admin')`) before doing any work — no data leaks to non-admin sessions.

### Implementation notes
- The chart uses `recharts` (already a project dependency) with `<ComposedChart>` + dual `<YAxis>` (`yAxisId="left"` for write-count bars, `yAxisId="right"` for hours-stale lines). Bars use the design tokens `hsl(var(--primary))` and `hsl(var(--muted-foreground))`; the two staleness lines use amber (`#f59e0b`, solid, "Note hours stale") and red (`#ef4444`, dashed `4 3`, "Image hours stale") so they remain distinguishable in both light and dark mode without leaning on theme colors that could collide with the bars.
- Tooltip is custom-formatted to render `Last note` / `Last image` ISO timestamps as locale strings instead of raw numbers, by reading `payload.lastNoteAt` / `payload.lastImageAt` off the Recharts payload row.
- Day labels switch format with the range: `weekday` short ("Mon") for 7d, `MM-DD` for 30d, to keep the X-axis readable at both widths.
- Storage listing is intentionally capped at 1000 objects (the Supabase JS default max). For the current note volume that is well above the 30-day window; if it ever caps out, the per-day counts and `latestImageAt` for the most recent days will still be correct because the list is sorted `created_at asc` — only the oldest tail of the window would under-count.

### Files touched
- `src/lib/admin.functions.ts` — added `adminGetBackupStatus` and `adminGetBackupHistory` server functions.
- `src/routes/_authenticated/admin.tsx` — added `<BackupStatus>` card, `<BackupHistoryChart>` card with 7d/30d toggle, recharts imports, and the `useQuery` wiring.

### Branching
- 1.7.2 lands on the GitHub default branch via Lovable's two-way sync. To stage separately, branch `release/1.7` from `main` in GitHub and cherry-pick — Lovable can't run `git` itself.

---

## [1.7.1] — 2026-05-15 — Pixel eraser tool

### Added
- **Eraser tool on the iPad writer.** `/ipad` now has three side-by-side tool buttons — **Pen**, **Eraser**, and **Clear all** — replacing the previous single "Clear" button. Pen and Eraser are a toggle pair (the active one renders with the primary background); Clear all still wipes the entire sticky to a fresh background. This lets a doorman fix a single character or strike-through without losing the rest of the note.

### Changed
- `HandwritingCanvas` now tracks a current tool (`pen` | `eraser`) via `toolRef` and exposes two new imperative methods on `HandwritingCanvasHandle`: `setTool(tool)` and `getTool()`. The pointer-move handler branches on `toolRef.current`:
  - **Pen** path is unchanged: black ink (`#1a1a1a`) with pressure-sensitive line width `(1.5 + pressure * 3.5) * dpr`.
  - **Eraser** path strokes with the sticky-note background color (`#fff2a8`) at a fixed `18 * dpr` width, wrapped in `ctx.save()`/`ctx.restore()` so the next pen stroke restores the prior style. We deliberately do **not** use `globalCompositeOperation = "destination-out"` because the exported PNG and the loaded background must remain opaque sticky-yellow — painting over with the same fill color preserves the note's visual identity and round-trips cleanly through `toBlob()` and `loadFromUrl()` in edit mode.
- `/ipad` (`src/routes/_authenticated/ipad.tsx`) holds the active tool in local `useState<"pen" | "eraser">("pen")` and mirrors it into the canvas via a `selectTool` helper that calls `canvasRef.current?.setTool(t)`. The toolbar buttons toggle visual state with `aria-pressed` for accessibility, and "Clear all" got a `Trash2` icon to visually distinguish it from the eraser stroke.

### Files touched
- `src/components/HandwritingCanvas.tsx` — added `setTool`/`getTool` to the handle interface, `toolRef`, eraser branch in `onPointerMove`.
- `src/routes/_authenticated/ipad.tsx` — `tool` state, `selectTool` helper, Pen/Eraser/Clear-all toolbar.

### Branching
- 1.7.1 lands on the GitHub default branch via Lovable's two-way sync. To stage it separately, branch `release/1.7` from `main` in GitHub and cherry-pick this commit — Lovable can't run `git` itself.

---

### Added
- **Edit a saved note's metadata.** Each sticky on `/monitor` now has a small pencil icon in its header (`src/components/NoteCard.tsx` — new `onEdit?: (id: string) => void` prop, `Pencil` lucide icon). Clicking it opens a new `EditNoteDialog` (`src/components/EditNoteDialog.tsx`, built on `@/components/ui/dialog`) that lets an approved user change `written_by`, `shift`, `apartment`, `category`, `display_date`, and `status`. On save, the dialog issues a single `supabase.from("notes").update(patch).eq("id", note.id)` (RLS: `notes_update_allowed` → `is_user_allowed(auth.uid())`) and the parent's `onLocalUpdate` patches the in-memory `notes` array so the change is visible immediately without waiting for the next 5s poll.
- **Redraw a note's handwritten image.** The edit dialog includes a "Redraw on iPad" link that navigates to `/ipad?edit=<note.id>`. The iPad route now declares `validateSearch: (s) => ({ edit: typeof s.edit === "string" ? s.edit : undefined })` and reads it via `useSearch({ from: "/_authenticated/ipad" })`. In edit mode it:
  1. Fetches the note row.
  2. Resolves the existing `image_url` (handles both legacy full URLs and bare storage paths) into a fresh `createSignedUrl(path, 3600)`.
  3. Polls briefly (≤1s) for the `<ClientOnly>`-wrapped canvas ref to mount, then calls a new `HandwritingCanvasHandle.loadFromUrl(url)` method (added to `src/components/HandwritingCanvas.tsx`) which paints the sticky background, draws the existing image into the canvas at native resolution, and marks the canvas dirty so the empty-check passes.
  4. Pre-fills `writtenBy`, `shift`, `apartment`, `category` from the row.
  5. On Save, uploads a new PNG to `note-images` under a fresh timestamped path and `update`s the existing `notes` row (instead of `insert`), then bounces back to `/monitor`. The old object is left in storage; admins (`UPDATE/DELETE` policies) can prune it later.
- **Approved doormen roster with auto-filled "Written by".** New `display_name text` column on `public.allowed_users` (nullable). Seeded the 7 active doormen — Benjie Solatorre, Carlos Garcia, Dave Edghill, Luis Villafane, Mike Kerr, Williams Landestoy, Vita Iacovone (only Vita has a real email today: `vitaiacovone@hotmail.com`; the rest use `pending-<slug>@shiftnotes.local` placeholders so the names are queued and visible in the admin panel until real addresses are provided). On `/ipad` mount, a new `useEffect` calls `supabase.auth.getUser()`, looks up `allowed_users.display_name` by `ilike(email)`, pre-fills the `writtenBy` state, and sets `writtenByLocked` so the input renders `readOnly` with an "Auto-filled from your approved doorman account" hint. Edit mode (`?edit=<id>`) skips the auto-fill so the original author is preserved.

### Changed
- `HandwritingCanvas` exposes a third imperative method (`loadFromUrl`) alongside `clear`, `toBlob`, `isEmpty`. The implementation uses an `Image` element with `crossOrigin = "anonymous"` so signed URLs from `note-images` draw without tainting the canvas, then `drawImage(img, 0, 0, canvas.width, canvas.height)` to fit the existing strokes into the current canvas size.
- `/ipad` header title flips between "Write" and "Edit" (with a Pencil icon) based on `?edit`. The save button label flips between "Save Note" and "Save Changes".
- `NoteCard` now accepts an optional `onEdit` callback; the pencil button is only rendered when the prop is supplied, so `EditNoteDialog`/Monitor opt in without affecting other consumers.

### Database
- Migration adds `display_name` to `public.allowed_users`, seeds 7 doormen (idempotent via `ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name`), and introduces a new `allowed_users_select_self` RLS policy so a signed-in user can read **their own** allowlist row by case-insensitive email match (`lower(email) = lower((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()))`). Admins keep the prior `allowed_users_admin_manage` (ALL) policy untouched.

### Files touched
- `src/components/HandwritingCanvas.tsx` — added `loadFromUrl` to the handle interface and the `useImperativeHandle` body.
- `src/components/NoteCard.tsx` — added `Pencil` import, optional `onEdit` prop, edit button.
- `src/components/EditNoteDialog.tsx` — new file. Dialog form + Supabase update + "Redraw on iPad" link.
- `src/routes/_authenticated/monitor.tsx` — imported `EditNoteDialog`, added `editingId` state, wired `onEdit` and `onSaved` (which calls `onLocalUpdate` for instant feedback).
- `src/routes/_authenticated/ipad.tsx` — `validateSearch` for `edit`, `useSearch`, edit-mode loader effect, doorman auto-fill effect, locked input UI, edit-vs-create branch in `onSave`, header/button label changes.
- `supabase/migrations/2026051505*.sql` — `display_name` column, `allowed_users_select_self` policy, doorman seed.

### Branching
- Lovable commits straight to the GitHub default branch via two-way sync; `1.7.0` lands on `main` automatically. To stage it on a release branch, create `release/1.7` from `main` in GitHub and cherry-pick the commits — the Lovable agent cannot run `git` itself.

---

## [1.6.0] — 2026-05-15 — Locked-down capture, monitor & storage

### Added
- **Auth-gated capture & display surfaces.** `/ipad` and `/monitor` are now child routes of the `_authenticated` layout (`src/routes/_authenticated/ipad.tsx`, `src/routes/_authenticated/monitor.tsx`). Unauthenticated visitors are redirected to `/login` with a contextual reason; non-approved users are signed out and bounced back to `/login?reason=not_approved`.
- **"Sign in to use iPad/Monitor" screen.** `src/routes/login.tsx` reads `?reason=signin_required` (in addition to `not_approved`) via `validateSearch` and renders a dedicated banner explaining why access was blocked, with a one-click return to the requested page after sign-in (`redirect` search param round-trip).
- **Sign-out buttons on `/ipad` and `/monitor` headers.** Each header now has a `LogOut`-icon button that calls `supabase.auth.signOut()` and `navigate({ to: "/" })`, returning the user to the public landing page. Placed alongside the existing cross-navigation links ("Monitor →", "Return to Main Screen", "Write New Note").

### Changed
- Route file moves: `src/routes/ipad.tsx` → `src/routes/_authenticated/ipad.tsx` and `src/routes/monitor.tsx` → `src/routes/_authenticated/monitor.tsx`. The TanStack Router Vite plugin regenerated `src/routeTree.gen.ts` accordingly. The `_authenticated` layout's `beforeLoad` runs the access-status check before the loader/component, so the iPad and Monitor screens never flash for unauthorized users.
- Login banner copy now distinguishes three states: signed-out (default), `signin_required` (came from a protected page), and `not_approved` (allowlist gate).

### Fixed
- **`Cannot convert object to primitive value` crash on `/monitor`.** The `_authenticated` `beforeLoad` was building the `redirect` search param via `location.pathname + location.search`, but TanStack Router's `location.search` is a parsed object — concatenating with a string threw at runtime. Switched both redirect branches (`signin_required` and `not_approved`) to use `location.href`, which is the already-stringified path + query.

### Security
- **`note-images` storage bucket locked down.** The bucket is no longer world-readable or world-writable. New RLS policies on `storage.objects` for the `note-images` bucket:
  - `SELECT` requires `auth.role() = 'authenticated'` AND `public.is_user_allowed(auth.uid())`.
  - `INSERT` requires the same two conditions in `WITH CHECK`.
  - No `LIST` policy, so the bucket cannot be enumerated by clients — objects are only reachable via known paths.
  - `UPDATE` / `DELETE` remain admin-only (`has_role(auth.uid(), 'admin')`).
- Combined with the existing route guard, this means handwritten note images are visible only to invited, authenticated users — even if a direct object URL leaks, an unapproved or signed-out client gets a 403.

### Files touched
- `src/routes/_authenticated/ipad.tsx` (renamed from `src/routes/ipad.tsx`) — added `useNavigate`, `handleSignOut`, and the `LogOut` button in the header.
- `src/routes/_authenticated/monitor.tsx` (renamed from `src/routes/monitor.tsx`) — same treatment.
- `src/routes/_authenticated.tsx` — added `signin_required` redirect path; switched both `redirect` search params from `location.pathname + location.search` to `location.href`.
- `src/routes/login.tsx` — extended `validateSearch` to include `reason: "signin_required" | "not_approved"` and rendered the matching banner; honors the `redirect` search param after a successful sign-in.
- `src/routeTree.gen.ts` — regenerated by the router plugin (do not edit by hand).
- `supabase/migrations/2026051504571*.sql`, `2026051504573*.sql` — `note-images` bucket policies (SELECT/INSERT gated on `is_user_allowed`, admin-only writes, no LIST).

### Branching
- This release was committed to the connected GitHub repo's default branch via Lovable's two-way sync. To stage `1.6.0` on its own branch, create `release/1.6` from `main` in GitHub and cherry-pick the commits — see the **Branching note** at the bottom of this file. The Lovable agent cannot run `git` itself.

---

## [1.5.0] — 2026-05-15 — Invite-only access & private changelog

### Added
- **Invite-only authentication.** A new `allowed_users` table holds the list of email addresses permitted to use the app. Admins manage the list from the admin panel.
- **Admin panel — Approved users card** with:
  - An "Invite" form (email + optional note) that upserts into `allowed_users`.
  - A table of every approved email with one-click **Revoke** (with confirmation).
- **Route guard** in `src/routes/_authenticated.tsx`:
  - Verifies a Supabase session.
  - Calls `getMyAccessStatus` server function on every navigation.
  - If the user is not on the allowlist (and is not bootstrapping the first admin), `supabase.auth.signOut()` runs and the user is redirected to `/login?reason=not_approved`.
- **Login page** now reads `?reason=not_approved` via `validateSearch` and surfaces a clear "Your account is not approved" message.
- **Home-page footer** with the D.A.V.E. monogram and the "Design . Ambition . Vision . Excellence" tagline (centered under the call-to-action cards).

### Changed
- `/changelog` is now `/_authenticated/changelog` and additionally checks `getMyAdminContext().isAdmin` inside the component — only the admin (you) can view release notes.
- Removed the public **Changelog** link from the homepage navigation.

### Security
- `allowed_users` has RLS enabled with a single policy `allowed_users_admin_manage` requiring `has_role(auth.uid(), 'admin')` for both `USING` and `WITH CHECK`.
- Email values are normalized (lowercased, trimmed) by the `allowed_users_normalize` trigger so casing differences cannot bypass the gate.
- New SQL helper `public.is_user_allowed(_user_id uuid)` is `SECURITY DEFINER`, lives in `public`, and has its `EXECUTE` privilege revoked from `PUBLIC`, `anon`, and `authenticated`. Only the server (calling via `supabaseAdmin`) can invoke it.
- The function returns `true` when:
  1. No admin exists yet (bootstrap), OR
  2. The user has the `admin` role, OR
  3. The user's `auth.users.email` matches an entry in `allowed_users` (case-insensitive).
- We deliberately did **not** add a trigger on `auth.users` (Supabase reserves the `auth` schema). The route guard performs the check instead, which works for both email/password and Google OAuth sign-ins.

### Server functions (TanStack `createServerFn`)
- `getMyAccessStatus` — `requireSupabaseAuth` middleware → calls `is_user_allowed` via the admin Supabase client → `{ allowed: boolean }`.
- `adminListAllowedUsers` — admin-gated `select email, note, created_at, invited_by from allowed_users`.
- `adminInviteUser` — Zod-validated `{ email, note? }`; upserts into `allowed_users` with `onConflict: 'email'` and stamps `invited_by` with the admin's user id.
- `adminRevokeUser` — Zod-validated `{ email }`; deletes from `allowed_users`. The user's existing Supabase session is invalidated on their next route navigation by the access guard.

### Files touched
- `supabase/migrations/*` — `allowed_users` table, `allowed_users_normalize` trigger, `is_user_allowed` function, `EXECUTE` revokes.
- `src/lib/admin.functions.ts` — four new server functions.
- `src/routes/_authenticated.tsx` — access-status check + sign-out-on-revoke.
- `src/routes/login.tsx` — `validateSearch({ reason })` + revoked-access banner.
- `src/routes/_authenticated/admin.tsx` — Approved-users management UI.
- `src/routes/_authenticated/changelog.tsx` — moved from public route, admin-only.
- `src/routes/index.tsx` — removed public changelog link, added D.A.V.E. footer.
- `public/favicon.png`, `src/assets/dave-logo.png` — branding.

---

## [1.4.0] — 2026-05-15 — Admin panel & changelog

### Added
- **Admin panel** at `/admin`, protected by an `_authenticated` layout route.
  - Stats dashboard: totals, open vs resolved, today's notes, breakdowns by shift, category, and day.
  - Notes table with status filter (`all` / `open` / `resolved`) and full-text search across apartment, author, transcribed text, and category.
  - Per-row selection plus header "select all".
  - Bulk actions: **Resolve**, **Reopen**, **Delete** (delete confirmed via prompt).
- **Authentication** at `/login`:
  - Email/password sign-in and sign-up (auto-confirm enabled).
  - Google OAuth button.
  - Leaked-password (HIBP) check enabled in Auth settings.
- **Role system**:
  - `app_role` enum (`admin`, `moderator`, `user`) and `user_roles` table linked to `auth.users`.
  - `has_role(_user_id, _role)` security-definer helper used in RLS to avoid recursive policies.
  - `has_any_admin()` helper that powers the **first-admin self-claim** flow when no admin exists yet.
- **Public changelog** at `/changelog`, sourced from `src/lib/changelog.ts`. This `CHANGELOG.md` is the canonical repo file.

### Security
- New RLS policy: only users with the `admin` role can delete from `notes`.
- `user_roles` is RLS-enabled. Users can read their own role rows; only admins can insert/update/delete role assignments.
- `has_role` and `has_any_admin` execute permissions revoked from `public`/`anon`; granted only to `authenticated`.

### Server functions (TanStack `createServerFn`)
- `getMyAdminContext` — returns the current user's roles and whether any admin exists.
- `claimFirstAdmin` — bootstrap path for the very first admin.
- `adminListNotes` — admin-gated list with status + search filters.
- `adminGetStats` — aggregate stats for the dashboard.
- `adminBulkResolve` / `adminBulkReopen` / `adminBulkDelete` — bulk operations.
- `adminUpdateNote` — partial update with a strict Zod schema.
- All admin functions verify the caller via `requireSupabaseAuth` + `has_role(... 'admin')` server-side.

### Wiring
- `attachSupabaseAuth` registered as a global `functionMiddleware` in `src/start.ts` so every server function call carries the user's bearer token.

---

## [1.3.0] — 2026-05-15 — Monitor: search, filters, status

### Added
- **Status filter** on the monitor (`open` / `resolved` / `all`), defaulting to `open`. The Supabase query is refetched whenever the filter changes.
- **Apartment/unit search** input with a clear (×) button. Filters notes by `apartment ILIKE` on the client.
- **Quick filter chips** for Shift and Category, derived from the current notes set, with a one-click "Clear filters".
- Filtered count display: `filtered / total` shown when any filter is active.

### Changed
- Resolving a note while viewing `open` removes it from the board immediately; in `all` / `resolved` it updates status in place.

---

## [1.2.0] — 2026-05-15 — Monitor navigation

### Added
- Large **"Return to Main Screen"** button on the monitor that links to `/` for quickly starting a new note.

---

## [1.1.0] — 2026-05-15 — Pinch-to-resize

### Added
- **Pinch gestures** on the monitor resize notes smoothly, synced with the existing per-note size setting.

---

## [1.0.0] — 2026-05-01 — Initial release

### Added
- iPad capture screen with handwriting canvas (Apple Pencil-friendly).
- Lobby monitor board for live shift handoff.
- `notes` schema: `written_by`, `shift`, `apartment`, `category`, `status`, `image_url`, `transcribed_text`, `position_x/y`, `display_date`.
- Storage bucket `note-images` for handwritten captures.
- Auto-transcription field populated by AI for searchability.

---

## Branching note

Lovable commits straight to your connected GitHub repo's default branch. To stage releases on a separate branch:

1. In GitHub, create a branch from `main` (e.g. `release/1.4`).
2. Cherry-pick or open a PR from `main` into that branch.
3. Lovable's two-way sync will reflect any merges back into the editor.

The agent itself cannot run `git` commands, so branch creation is a one-time GitHub action.