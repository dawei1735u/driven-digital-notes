CREATE POLICY "notes_delete_workspace"
ON public.notes
FOR DELETE
TO authenticated
USING (is_user_allowed(auth.uid()) AND (NOT (workspace_id IS DISTINCT FROM get_my_workspace_id())));