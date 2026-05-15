DROP POLICY IF EXISTS allowed_users_select_self ON public.allowed_users;

CREATE POLICY allowed_users_select_self
ON public.allowed_users
FOR SELECT
TO authenticated
USING (lower(email) = lower((auth.jwt() ->> 'email')));