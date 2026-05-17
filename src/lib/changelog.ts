export type ChangelogSection = { heading: string; items: string[] };
export type ChangelogEntry = {
  version: string;
  date: string;
  title?: string;
  sections: ChangelogSection[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.15.1",
    date: "2026-05-17",
    title: "Preview-iframe login hardening",
    sections: [
      {
        heading: "Fixed",
        items: [
          "Google sign-in inside the Lovable preview iframe. `src/routes/login.tsx` now detects iframe context via `isEmbeddedPreview()` (`window.self !== window.top`); when embedded, the Google button opens the same login URL in a new top-level tab with `?oauth=google` so the OAuth state cookie can round-trip and 2FA can complete, instead of failing with 'State is invalid'.",
          "Friendlier 'Invalid login credentials' copy on `/login` — guides users to Continue with Google + 2FA (the canonical flow for this account) rather than implying the password is wrong.",
          "New `startGoogleSignIn()` helper centralizes the `lovable.auth.signInWithOAuth('google', { redirect_uri })` call so both the button click and the `?oauth=google` auto-redirect path use the same code.",
        ],
      },
    ],
  },
  {
    version: "1.15.0",
    date: "2026-05-17",
    title: "Tile notes & snap-to-grid on /monitor",
    sections: [
      {
        heading: "Added",
        items: [
          "**Tile notes** button in the `/monitor` header — `tileAll()` arranges every visible note into a clean grid based on the current note size and board width, then persists the new `position_x` / `position_y` to Supabase in one batch. Useful after notes drift from manual dragging or pinch-resize.",
          "**Snap to grid** toggle (LayoutGrid icon, persisted to `localStorage` under `shiftnotes:snapToGrid`). When on, dragged notes and the Tile action snap to a 24px grid via a `snap(v) = round(v / GRID_SIZE) * GRID_SIZE` helper applied inside the drag handler and the tile layout. Aria-pressed reflects state; tooltip explains behavior.",
        ],
      },
      {
        heading: "Files touched",
        items: [
          "src/routes/_authenticated/monitor.tsx — `snapToGrid` state + persistence effect, `snap()` helper, `tileAll()` callback, `LayoutGrid` icon, two new toolbar buttons.",
        ],
      },
    ],
  },
  {
    version: "1.12.0",
    date: "2026-05-16",
    title: "Task lists, paste, and AI YouTube summaries on /ipad",
    sections: [
      {
        heading: "Added",
        items: [
          "Bullet & Number stamps on the canvas. Two new toolbar buttons (List / ListOrdered icons) arm a sticky 'stamp mode' — a pulsing banner across the top of the canvas tells you the next tap will drop a marker. Numbering auto-increments (1., 2., 3., …) across taps; a 'Reset #' button restarts at 1. Tap-and-drag places multiple markers in one gesture with smart min-spacing (40px for bullets, 56px for numbers) so they don't pile on top of each other. Cancel exits the mode without saving.",
          "Tap-and-drag stamping. While in bullet/number mode the canvas captures pointer move events and drops additional markers as the pen sweeps across the page, so a checklist can be laid out in one continuous motion.",
          "Clipboard paste into the canvas. Cmd/Ctrl+V anywhere on /ipad (outside form inputs) pastes the clipboard contents directly into the note. Text is word-wrapped at a 24px margin in a 22px sans serif and the cursor advances down the page. Images are scaled to fit within the page margins, drawn at the current paste position, and the cursor moves below them. A 'Paste' toolbar button calls navigator.clipboard.read() / readText() for iPad where there is no keyboard shortcut. The canvas auto-grows (extraHeight) when pasted content would overflow. A 'Pasted to the note.' confirmation flashes for 1.5s; permission/empty-clipboard errors surface as an amber banner.",
          "YouTube summary tool. New 'Paste YouTube URL…' input + Summarize button in the toolbar (Enter also submits). Calls a TanStack server function (src/lib/youtube.functions.ts) that: (1) validates the URL (youtu.be, /watch?v=, /embed/, /shorts/, /v/), (2) fetches the watch page and parses ytInitialPlayerResponse to find the best caption track (preferring manual English, then any English, then any manual; non-English tracks are translated via tlang=en), (3) downloads the timed-text XML and strips tags/entities to a plain transcript, (4) sends the transcript (truncated to 25k chars) to google/gemini-2.5-flash via the Lovable AI gateway for a 4–6 bullet grounded summary, and (5) falls back to a title/channel-only best-guess summary when no captions exist. The inserted text is prefixed with the video title — channel, the youtu.be link, and a 'Summary based on transcript / auto-captions / translated captions / title' label so you can see how grounded the summary is, then pasted into the canvas via the same pasteText pipeline.",
        ],
      },
      {
        heading: "Files touched",
        items: [
          "src/components/HandwritingCanvas.tsx — new stampNext / cancelStamp / resetNumbering / pasteText / pasteImage imperative methods; stampDraggingRef + lastStampPosRef for drag-to-stamp; pasteCursorYRef for paste flow; min-spacing math scaled by devicePixelRatio.",
          "src/routes/_authenticated/ipad.tsx — Bullet / Number / Reset # / Paste / YouTube input + Summarize toolbar buttons; pendingStamp banner with cancel; document-level 'paste' listener (skips form inputs); navigator.clipboard fallback for touch; ytUrl state + Enter-to-submit; pasteOk / pasteError status banners; ClipboardPaste & Youtube lucide icons.",
          "src/lib/youtube.functions.ts — new createServerFn endpoint: URL validation, oEmbed metadata, watch-page scrape, caption track selection, XML transcript fetch + entity decode, Lovable AI gateway call, transcript-vs-fallback labeling.",
        ],
      },
    ],
  },
  {
    version: "1.11.0",
    date: "2026-05-16",
    title: "Personal-mode iPad + Tasks rename across user-facing copy",
    sections: [
      {
        heading: "Changed",
        items: [
          "Removed the 'Note details' side panel on /ipad (Written by / Shift / Apartment / Category fields and the Apple Pencil tip). The capture grid collapsed from md:grid-cols-[1fr_320px] to a single column so the canvas now uses the full width of the layout. State for writtenBy / shift / apartment / category is still tracked in the component and saved with each note — defaults are auto-filled from the signed-in doorman record (writtenBy) and from the first option of each list (shift = 'Morning', category = 'Package') — but doormen no longer adjust them per note in this personal-use build.",
          "Renamed every user-facing 'ShiftNotes' / 'Shift Handoff' string to 'Tasks'. Updated meta titles & descriptions on the home (/), root, /monitor, and /ipad routes so SEO + social previews now read 'Tasks' instead of 'Tasks — Digital Doorman Shift Handoff' / 'shift handoff note' wording. Historical changelog entries, migration files, and the internal localStorage key 'shiftnotes:noteSize' were left untouched so older browser preferences keep working.",
        ],
      },
      {
        heading: "Files touched",
        items: [
          "src/routes/_authenticated/ipad.tsx — removed <aside> with note details, collapsed grid to single column, updated head() description to 'Write a handwritten task on iPad.'.",
          "src/routes/index.tsx — head().title changed to 'Tasks'; description rewritten without 'shift'.",
          "src/routes/__root.tsx — meta description, og:description, twitter:description rewritten as 'Tasks is a digital system for creating and displaying handwritten notes.'.",
          "src/routes/_authenticated/monitor.tsx — head() description changed to 'Live wall of open tasks.'.",
        ],
      },
    ],
  },
  {

    version: "1.10.0",
    date: "2026-05-16",
    title: "iPad writing comfort: no-select canvas & extendable space",
    sections: [
      {
        heading: "Fixed",
        items: [
          "Apple Pencil no longer triggers an iOS text-selection highlight over the canvas. The HandwritingCanvas container and <canvas> element now set userSelect/WebkitUserSelect: 'none' and WebkitTouchCallout: 'none', so the Pencil can start a stroke immediately without needing a stray tap outside the canvas to clear the selection state.",
        ],
      },
      {
        heading: "Added",
        items: [
          "Extendable writing space on /ipad. The canvas is wrapped in a scrollable container (maxHeight: 70vh, overflowY: auto, -webkit-overflow-scrolling: touch) and the toolbar has a new + button that calls a new HandwritingCanvas.extend(extraPx = 300) imperative method. Each tap grows the canvas height by 300px so doormen can keep writing past the original viewport and scroll the note up as they go.",
          "HandwritingCanvas now tracks a baseHeight via ResizeObserver and an extraHeight state, applying height = baseHeight + extraHeight (with a 300px minHeight fallback) so growth is additive and survives width changes without clipping existing ink.",
        ],
      },
      {
        heading: "Files touched",
        items: [
          "src/components/HandwritingCanvas.tsx — no-select CSS, ResizeObserver, extend() on the imperative handle.",
          "src/routes/_authenticated/ipad.tsx — scroll wrapper, Plus 'add space' button wired to canvasRef.current?.extend(300).",
        ],
      },
    ],
  },
  {
    version: "1.9.0",
    date: "2026-05-16",
    title: "Login UX: password visibility & reset flow",
    sections: [
      {
        heading: "Added",
        items: [
          "Show/hide password toggle on /login — Eye / EyeOff icon inside the password input flips type='password' ↔ type='text' so users can verify what they typed before submitting.",
          "Forgot-password link on /login that calls supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/reset-password }) and surfaces a 'Check your inbox' info message inline.",
          "New /reset-password page (src/routes/reset-password.tsx, ssr: false) that listens for PASSWORD_RECOVERY / SIGNED_IN auth events, accepts a new password (also with the show/hide toggle), calls supabase.auth.updateUser({ password }), and redirects to /admin on success.",
        ],
      },
      {
        heading: "Notes on the in-editor preview",
        items: [
          "Google 'Continue with' rendering blank and intermittent login failures inside the Lovable preview iframe are a third-party-cookie limitation of the Cloud Dev auth environment, not an app bug — confirmed working on the published site and on iPad Safari. The fix is to open the preview in its own tab; no code change required.",
        ],
      },
    ],
  },
  {
    version: "1.8.1",
    date: "2026-05-16",
    title: "Per-note resizing on the monitor",
    sections: [
      {
        heading: "Added",
        items: [
          "Resize handle on each sticky on /monitor — every NoteCard now persists its own width/height to a new notes.size_w / notes.size_h pair so individual notes can be sized independently of the board's global size setting. Drag-to-resize updates local state during the drag and writes to Supabase on release.",
        ],
      },
      {
        heading: "Database",
        items: [
          "Migration adds nullable integer columns size_w and size_h to public.notes (defaulting to NULL so existing notes fall back to the board-wide size). RLS unchanged — the existing notes_update policy already covers the new columns since it grants column-agnostic UPDATE to authenticated allowlisted users.",
          "src/integrations/supabase/types.ts regenerated to expose size_w / size_h on the notes Row/Insert/Update types.",
        ],
      },
      {
        heading: "Files touched",
        items: [
          "supabase/migrations/20260516075719_*.sql — ALTER TABLE notes ADD COLUMN size_w int, size_h int.",
          "src/components/NoteCard.tsx — resize handle, controlled size state, debounced persistence.",
          "src/routes/_authenticated/monitor.tsx — passes per-note size through and ignores the global size when a row-level override exists.",
        ],
      },
    ],
  },
  {
    version: "1.8.0",
    date: "2026-05-15",
    title: "Rebrand to Future Solutions Digital Notes",
    sections: [
      {
        heading: "Changed",
        items: [
          "Renamed product on the landing page from 'Tasks' to 'DigitalNotes' — updated the H1 in src/routes/index.tsx so 'Digital' renders in foreground and 'Notes' in primary accent.",
          "Replaced the old 'Digital Doorman Shift Handoff' eyebrow with 'Future Solutions Digital Notes' and then removed the eyebrow entirely once the logo took over as the primary brand mark in the header.",
          "Moved the D.A.V.E. monogram (src/assets/dave-logo.png) from the footer into the hero header, stacked above the DigitalNotes wordmark with mb-6 spacing, so the brand identity reads top-down: logo → wordmark → CTAs.",
          "Removed the marketing subtitle ('Handwritten shift handoff notes — written on the iPad, instantly visible on the lobby monitor.') to tighten the hero now that the logo carries the brand weight.",
          "Simplified the right-hand CTA card on the home page: 'Monitor Board' + 'Live shift handoff dashboard' collapsed to a single 'Dashboard' label so the two entry points (Write a Note / Dashboard) read symmetrically.",
          "Footer keeps only the 'Design . Ambition . Vision . Excellence' tagline now that the monogram has moved up.",
        ],
      },
      {
        heading: "Implementation notes",
        items: [
          "All edits are presentation-only and confined to src/routes/index.tsx — no route, server function, RLS policy, or schema change. The /ipad and /monitor flows, auth guard, and admin panel are untouched.",
          "The logo continues to import as an ES module (import daveLogo from '@/assets/dave-logo.png') so Vite fingerprints and inlines it; no <img> path strings or public/ copies were introduced.",
          "Hero container switched to flex flex-col items-center text-center to vertically stack logo + H1 cleanly without the previous mx-auto paragraph constraints.",
        ],
      },
      {
        heading: "Branching",
        items: [
          "1.8.0 lands on the GitHub default branch via Lovable's two-way sync — every edit in this release pushed automatically as Lovable saved the files. To stage separately, branch release/1.8 from main in GitHub and cherry-pick; Lovable itself can't run git commands, but the connected repo already has the full commit history for this release.",
        ],
      },
    ],
  },
  {
    version: "1.7.2",
    date: "2026-05-15",
    title: "Backup status panel & history chart",
    sections: [
      {
        heading: "Added",
        items: [
          "Backup status panel on /admin — total notes in DB, latest note timestamp with a Healthy/Stale/Inactive badge, approved-user count, and note-images storage object count + latest upload. Auto-refreshes every 60s with a manual Refresh button.",
          "Backup activity history chart on /admin — 7d/30d toggleable Recharts ComposedChart with per-day bars for notes created and images uploaded plus two trend lines showing end-of-day 'hours stale' (how long since the most recent write at the close of each day). Lower is fresher.",
        ],
      },
      {
        heading: "Changed",
        items: [
          "Added two admin-gated server functions in src/lib/admin.functions.ts: adminGetBackupStatus (parallel notes count + latest/oldest + allowed-users count + storage list via the admin client because RLS blocks the user-scoped client from listing storage.objects) and adminGetBackupHistory ({ days: 7|30 } → bins notes.created_at and storage objects into per-UTC-day buckets, then walks the window carrying running lastNoteSeen / lastImageSeen so each row's noteHoursStale / imageHoursStale reflects staleness at end-of-day).",
          "Both functions go through assertAdmin(supabase, userId) (has_role(auth.uid(), 'admin')) before reading anything.",
          "src/routes/_authenticated/admin.tsx wires both functions through useServerFn + useQuery; the history range lives in useState<7|30>(7) and is keyed into the query so toggling refetches. New <BackupStatus> and <BackupHistoryChart> cards render between the stats grid and the approved-users table.",
        ],
      },
      {
        heading: "Implementation notes",
        items: [
          "Chart uses ComposedChart with dual YAxis — left for write-count bars (hsl(var(--primary)) and hsl(var(--muted-foreground))), right for hours-stale lines (amber #f59e0b solid for notes, red #ef4444 dashed for images) so they stay distinguishable in light/dark without colliding with theme tokens.",
          "Tooltip is custom-formatted to render lastNoteAt / lastImageAt ISO strings as locale times by reading them off the Recharts payload row.",
          "Day labels switch format with the range — short weekday for 7d, MM-DD for 30d — to keep the X-axis readable at both widths.",
          "Storage listing is capped at 1000 objects (Supabase JS default max). Sorted asc, so even if the cap is hit the most-recent days stay accurate; only the oldest tail of a long window would under-count.",
        ],
      },
      {
        heading: "Branching",
        items: [
          "1.7.2 lands on the GitHub default branch via Lovable's two-way sync. To stage separately, branch release/1.7 from main in GitHub and cherry-pick — Lovable can't run git itself.",
        ],
      },
    ],
  },
  {
    version: "1.7.1",
    date: "2026-05-15",
    title: "Pixel eraser tool",
    sections: [
      {
        heading: "Added",
        items: [
          "Eraser tool on /ipad — new Pen/Eraser toggle plus a separate 'Clear all' button so doormen can rub out a single character without wiping the whole note.",
        ],
      },
      {
        heading: "Changed",
        items: [
          "HandwritingCanvas tracks the active tool via toolRef and exposes setTool/getTool on its imperative handle. The eraser strokes paint over with the sticky-note background color (#fff2a8) at 18*dpr width — not destination-out — so the exported PNG stays opaque and round-trips cleanly through toBlob/loadFromUrl in edit mode.",
          "/ipad toolbar shows Pen, Eraser, and Clear all side-by-side; the active tool button uses the primary background and aria-pressed for accessibility. Clear all got a Trash2 icon to distinguish it from the eraser.",
        ],
      },
      {
        heading: "Branching",
        items: [
          "1.7.1 lands on the GitHub default branch via Lovable's two-way sync. To stage separately, branch release/1.7 from main in GitHub and cherry-pick — Lovable can't run git itself.",
        ],
      },
    ],
  },
  {
    version: "1.7.0",
    date: "2026-05-15",
    title: "Editable notes & doorman roster",
    sections: [
      {
        heading: "Added",
        items: [
          "Edit a saved note's metadata from /monitor — new pencil icon on each sticky opens a dialog to change written by, shift, apartment, category, display date, and status. Changes save in one update and appear instantly without waiting for the poll.",
          "Redraw a note's handwriting — the edit dialog has a 'Redraw on iPad' link that opens /ipad?edit=<id>; the existing image is loaded into the canvas via a new HandwritingCanvas.loadFromUrl method, sidebar fields are pre-filled, and Save uploads a new PNG and updates the same notes row instead of inserting.",
          "Approved doormen roster — added a display_name column to allowed_users and seeded the 7 active doormen (Benjie Solatorre, Carlos Garcia, Dave Edghill, Luis Villafane, Mike Kerr, Williams Landestoy, Vita Iacovone). Vita is live with vitaiacovone@hotmail.com; the others use pending-<slug>@shiftnotes.local placeholders until real emails arrive.",
          "/ipad auto-fills 'Written by' with the signed-in doorman's display name and locks the field, with a 'Auto-filled from your approved doorman account' hint. Edit mode skips this so the original author is preserved.",
        ],
      },
      {
        heading: "Changed",
        items: [
          "HandwritingCanvas now exposes loadFromUrl alongside clear/toBlob/isEmpty so signed bucket URLs can be drawn back into the canvas at native resolution.",
          "/ipad header title and save-button label switch between 'Write'/'Save Note' and 'Edit'/'Save Changes' based on the ?edit search param.",
          "NoteCard accepts an optional onEdit callback; the pencil button only renders when the prop is supplied.",
        ],
      },
      {
        heading: "Database",
        items: [
          "Added display_name to allowed_users and a new allowed_users_select_self policy so a signed-in user can read only their own allowlist row by case-insensitive email match. Admin-manage policy is unchanged.",
          "Doorman seed is idempotent (ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name) so re-running it just refreshes display names.",
        ],
      },
      {
        heading: "Branching",
        items: [
          "1.7.0 lands on the GitHub default branch via Lovable's two-way sync. To stage it separately, branch release/1.7 from main in GitHub and cherry-pick — Lovable can't run git itself.",
        ],
      },
    ],
  },
  {
    version: "1.6.0",
    date: "2026-05-15",
    title: "Locked-down capture, monitor & storage",
    sections: [
      {
        heading: "Added",
        items: [
          "/ipad and /monitor now live behind authentication — only signed-in, approved users can open them.",
          "Dedicated 'Sign in to use iPad/Monitor' screen on /login when an unauthenticated visitor hits a protected page; after sign-in they're returned to the page they wanted.",
          "Sign out button in the /ipad and /monitor headers that ends the session and returns to the landing page.",
        ],
      },
      {
        heading: "Changed",
        items: [
          "Route files moved under the _authenticated layout (src/routes/_authenticated/ipad.tsx and monitor.tsx) so the access guard runs before the page renders — no flash of protected content.",
          "Login banner now distinguishes signed-out, sign-in-required, and not-approved states with the right copy for each.",
        ],
      },
      {
        heading: "Fixed",
        items: [
          "Crash on /monitor ('Cannot convert object to primitive value') caused by concatenating TanStack Router's parsed search object with a string. The redirect now uses location.href, which is already a string.",
        ],
      },
      {
        heading: "Security",
        items: [
          "note-images storage bucket is no longer public. New RLS policies require authenticated + allowlisted users for SELECT and INSERT, admins-only for UPDATE/DELETE, and there is no LIST policy so objects can't be enumerated.",
          "Combined with the route guard, handwritten note images are visible only to invited users — direct object URLs return 403 for everyone else.",
        ],
      },
      {
        heading: "Branching",
        items: [
          "Released to the connected GitHub default branch via Lovable's two-way sync. To stage 1.6.0 separately, branch release/1.6 from main in GitHub and cherry-pick — Lovable can't run git itself.",
        ],
      },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-05-15",
    title: "Invite-only access & private changelog",
    sections: [
      {
        heading: "Added",
        items: [
          "Email allowlist (allowed_users table) — only emails the admin invites can sign in.",
          "Admin panel section to invite a user (email + optional note) and revoke access in one click.",
          "Server-side access guard: every authenticated route revalidates the user against the allowlist on each navigation and signs out anyone who is no longer approved.",
          "Friendly 'not approved' message on /login when access is denied or revoked.",
          "Footer monogram (D.A.V.E.) and 'Design . Ambition . Vision . Excellence' tagline on the home page.",
        ],
      },
      {
        heading: "Changed",
        items: [
          "/changelog moved behind admin authentication — release notes are no longer public.",
          "Public homepage nav cleaned up; the Changelog link is removed.",
        ],
      },
      {
        heading: "Security",
        items: [
          "allowed_users table is RLS-protected: only admins can read or modify it.",
          "Allowlist check runs through a SECURITY DEFINER function (is_user_allowed) with EXECUTE revoked from anon/authenticated; only the server (service role) can call it.",
          "Bootstrap path preserved: when no admin exists, the first signed-in user can still claim admin and become the gatekeeper.",
          "Email values are normalized (lowercased, trimmed) on insert/update to prevent bypass via casing.",
        ],
      },
      {
        heading: "Server functions",
        items: [
          "getMyAccessStatus — returns { allowed } for the current user; called by the route guard.",
          "adminListAllowedUsers — admin-only list of invited emails.",
          "adminInviteUser — admin-only upsert into allowed_users (Zod-validated email + optional note).",
          "adminRevokeUser — admin-only delete from allowed_users.",
        ],
      },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-05-15",
    title: "Admin panel & changelog",
    sections: [
      {
        heading: "Added",
        items: [
          "Auth-protected /admin panel with stats, filters, and per-row management.",
          "Bulk actions: resolve, reopen, and delete multiple notes in one click.",
          "Stats dashboard: totals, open vs resolved, today's count, and breakdowns by shift, category, and day.",
          "Email/password and Google sign-in via /login.",
          "Role system (admin/moderator/user) with a secure has_role() check used by RLS.",
          "First-admin self-claim flow when no admin exists yet.",
          "Public /changelog page rendering this file plus a CHANGELOG.md in the repo.",
        ],
      },
      {
        heading: "Security",
        items: [
          "Notes can now only be deleted by users with the admin role.",
          "user_roles table protected by RLS: users can read their own roles; only admins can manage them.",
          "Role helpers are SECURITY DEFINER and limited to authenticated callers.",
        ],
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-05-15",
    title: "Monitor: search, filters, status",
    sections: [
      {
        heading: "Added",
        items: [
          "Status filter on the monitor (open / resolved / all), defaulting to open.",
          "Apartment / unit text search to quickly find a specific note.",
          "Quick filter chips for Shift and Category, with a one-click clear.",
          "Counts now show filtered/total when any filter is active.",
        ],
      },
      {
        heading: "Changed",
        items: [
          "Resolving a note while viewing 'open' removes it from the board immediately; in 'all' or 'resolved' it just updates status.",
        ],
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-05-15",
    title: "Monitor navigation",
    sections: [
      {
        heading: "Added",
        items: [
          "Large 'Return to Main Screen' button on the monitor for quick navigation back to the home/iPad flow.",
        ],
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-05-15",
    title: "Pinch-to-resize notes",
    sections: [
      {
        heading: "Added",
        items: [
          "Pinch gestures on the monitor smoothly resize notes, syncing with the existing size setting.",
        ],
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-05-01",
    title: "Initial release",
    sections: [
      {
        heading: "Added",
        items: [
          "iPad note capture with Apple Pencil handwriting canvas.",
          "Lobby monitor board showing the live shift handoff.",
          "Note metadata: written_by, shift, apartment, category, status.",
          "Image storage in the note-images bucket and AI transcription field.",
        ],
      },
    ],
  },
];