
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS audio_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('note-audio', 'note-audio', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "note_audio_select_allowed"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'note-audio' AND public.is_user_allowed(auth.uid()));

CREATE POLICY "note_audio_insert_allowed"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'note-audio' AND public.is_user_allowed(auth.uid()));

CREATE POLICY "note_audio_delete_admin"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'note-audio' AND public.has_role(auth.uid(), 'admin'::app_role));
