# Per-user workspaces

## Goal
Let you invite a new user from `/admin` who gets their **own private notes, monitor and iPad** — completely isolated from your doorman board. Your existing 7 doormen continue to share the lobby board exactly as today.

## Model

Introduce a `workspace_id` concept:

- **Shared workspace** (`workspace_id = NULL`) — your current doormen. All 7 see and edit the same notes. No change for them.
- **Solo workspace** (`workspace_id = <that user's uuid>`) — each invited "solo" user sees only their own notes.

A user's workspace is determined by a new column on `allowed_users`:
- `workspace = 'shared'` (default) — joins the doorman board
- `workspace = 'solo'` — gets their own isolated instance

## Database changes (one migration)

1. `allowed_users`: add `workspace text NOT NULL DEFAULT 'shared'` with check `in ('shared','solo')`.
2. `notes`: add `workspace_id uuid` (nullable — NULL = shared workspace).
3. Backfill: all existing notes get `workspace_id = NULL` (shared). All existing allowlisted users stay on `workspace='shared'`.
4. New SECURITY DEFINER fn `get_my_workspace_id()`:
   - Looks up the caller's row in `allowed_users` by email.
   - Returns `NULL` if `workspace='shared'`, or `auth.uid()` if `workspace='solo'`.
5. Rewrite `notes` RLS:
   - SELECT/INSERT/UPDATE: `workspace_id IS NOT DISTINCT FROM get_my_workspace_id()`
   - Solo users can only see/write rows where `workspace_id = their uid`. Shared users can only see/write rows where `workspace_id IS NULL`.
   - DELETE: admin-only (unchanged).
6. `note-images` and `note-audio` buckets: keep existing allowlist policy (RLS on `notes` is the real gate; the image just sits in storage).

## Code changes

- `src/lib/admin.functions.ts`
  - `inviteUser` accepts a `workspace: 'shared' | 'solo'` argument.
  - `listAllowedUsers` returns the workspace value.
  - New `setUserWorkspace(email, workspace)` so you can flip a user later.
- `src/routes/_authenticated/admin.tsx`
  - Invite form gets a **Workspace** select: "Shared doorman board" (default) / "Private (their own instance)".
  - Roster shows a small badge: `Shared` or `Private`.
- `src/routes/_authenticated/ipad.tsx`
  - On note create, set `workspace_id` from a new server fn `getMyWorkspaceId()` (one call, cached per session). Edit path unchanged — RLS filters automatically.
- `src/routes/_authenticated/monitor.tsx`
  - No change needed — RLS already scopes the query. Page title shows "Your notes" when the signed-in user is on a solo workspace, "Lobby board" otherwise.
- `src/routes/index.tsx` (landing)
  - Solo users land straight on `/ipad` after sign-in (skip the doorman framing). Optional polish; can defer.

## What this does NOT change
- Your `/monitor`, `/ipad`, `/admin` for the 7 doormen — identical behavior, same shared notes.
- Auth, Google sign-in, MFA, password reset — all untouched.
- Existing notes — they stay shared.

## Inviting the new user (your workflow afterwards)
1. Go to `/admin` → Approved users → enter email → pick **Private (their own instance)** → Invite.
2. They sign up at `/login` (email+password or Google) with that email.
3. They land on their own empty `/monitor` and `/ipad`. Nothing of yours is visible to them, nothing of theirs is visible to you.

---

Shall I run the migration and ship this?
