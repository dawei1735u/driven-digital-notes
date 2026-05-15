-- 1. Add display_name column
ALTER TABLE public.allowed_users
  ADD COLUMN IF NOT EXISTS display_name text;

-- 2. Allow signed-in users to read their own allowed_users row by email match
CREATE POLICY "allowed_users_select_self"
ON public.allowed_users
FOR SELECT
TO authenticated
USING (
  lower(email) = lower((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()))
);

-- 3. Seed the 7 doormen
INSERT INTO public.allowed_users (email, display_name, note) VALUES
  ('vitaiacovone@hotmail.com',                'Vita Iacovone',     'Doorman'),
  ('pending-benjie-solatorre@shiftnotes.local',  'Benjie Solatorre',  'Doorman — email pending'),
  ('pending-carlos-garcia@shiftnotes.local',     'Carlos Garcia',     'Doorman — email pending'),
  ('pending-dave-edghill@shiftnotes.local',      'Dave Edghill',      'Doorman — email pending'),
  ('pending-luis-villafane@shiftnotes.local',    'Luis Villafane',    'Doorman — email pending'),
  ('pending-mike-kerr@shiftnotes.local',         'Mike Kerr',         'Doorman — email pending'),
  ('pending-williams-landestoy@shiftnotes.local','Williams Landestoy','Doorman — email pending')
ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name;