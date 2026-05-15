
-- Lock the note-images bucket: not public, and only approved users can read/write.
UPDATE storage.buckets SET public = false WHERE id = 'note-images';

-- Storage policies for note-images (replace if any exist with same names)
DROP POLICY IF EXISTS "note_images_select_allowed" ON storage.objects;
DROP POLICY IF EXISTS "note_images_insert_allowed" ON storage.objects;
DROP POLICY IF EXISTS "note_images_update_allowed" ON storage.objects;
DROP POLICY IF EXISTS "note_images_delete_admin" ON storage.objects;

CREATE POLICY "note_images_select_allowed"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'note-images' AND public.is_user_allowed(auth.uid()));

CREATE POLICY "note_images_insert_allowed"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'note-images' AND public.is_user_allowed(auth.uid()));

CREATE POLICY "note_images_update_allowed"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'note-images' AND public.is_user_allowed(auth.uid()))
WITH CHECK (bucket_id = 'note-images' AND public.is_user_allowed(auth.uid()));

CREATE POLICY "note_images_delete_admin"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'note-images' AND public.has_role(auth.uid(), 'admin'));

-- Tighten the notes table: only approved (signed-in) users can read/write.
DROP POLICY IF EXISTS "notes_select_all" ON public.notes;
DROP POLICY IF EXISTS "notes_insert_all" ON public.notes;
DROP POLICY IF EXISTS "notes_update_all" ON public.notes;

CREATE POLICY "notes_select_allowed"
ON public.notes FOR SELECT
TO authenticated
USING (public.is_user_allowed(auth.uid()));

CREATE POLICY "notes_insert_allowed"
ON public.notes FOR INSERT
TO authenticated
WITH CHECK (public.is_user_allowed(auth.uid()));

CREATE POLICY "notes_update_allowed"
ON public.notes FOR UPDATE
TO authenticated
USING (public.is_user_allowed(auth.uid()))
WITH CHECK (public.is_user_allowed(auth.uid()));
