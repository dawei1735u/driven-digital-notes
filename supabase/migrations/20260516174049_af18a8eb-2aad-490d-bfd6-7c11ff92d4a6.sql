
-- 1. workspace column on allowed_users
ALTER TABLE public.allowed_users
  ADD COLUMN IF NOT EXISTS workspace text NOT NULL DEFAULT 'shared'
  CHECK (workspace IN ('shared', 'solo'));

-- 2. workspace_id on notes (NULL = shared doorman workspace)
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

CREATE INDEX IF NOT EXISTS notes_workspace_id_idx ON public.notes (workspace_id);

-- 3. Helper: resolve the caller's workspace id.
--    Returns NULL for shared workspace, or the user's uid for solo workspace.
CREATE OR REPLACE FUNCTION public.get_my_workspace_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws text;
  uid uuid := auth.uid();
  uemail text := lower(auth.jwt() ->> 'email');
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT workspace INTO ws
  FROM public.allowed_users
  WHERE lower(email) = uemail
  LIMIT 1;
  IF ws = 'solo' THEN
    RETURN uid;
  END IF;
  RETURN NULL; -- shared (or admins who aren't in allowed_users)
END;
$$;

-- 4. Replace notes RLS with workspace-scoped policies.
DROP POLICY IF EXISTS notes_select_allowed ON public.notes;
DROP POLICY IF EXISTS notes_insert_allowed ON public.notes;
DROP POLICY IF EXISTS notes_update_allowed ON public.notes;

CREATE POLICY notes_select_workspace
ON public.notes
FOR SELECT
TO authenticated
USING (
  public.is_user_allowed(auth.uid())
  AND workspace_id IS NOT DISTINCT FROM public.get_my_workspace_id()
);

CREATE POLICY notes_insert_workspace
ON public.notes
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_user_allowed(auth.uid())
  AND workspace_id IS NOT DISTINCT FROM public.get_my_workspace_id()
);

CREATE POLICY notes_update_workspace
ON public.notes
FOR UPDATE
TO authenticated
USING (
  public.is_user_allowed(auth.uid())
  AND workspace_id IS NOT DISTINCT FROM public.get_my_workspace_id()
)
WITH CHECK (
  public.is_user_allowed(auth.uid())
  AND workspace_id IS NOT DISTINCT FROM public.get_my_workspace_id()
);
