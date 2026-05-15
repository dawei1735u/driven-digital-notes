
CREATE TABLE public.allowed_users (
  email text PRIMARY KEY,
  invited_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.allowed_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allowed_users_admin_manage"
  ON public.allowed_users
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Normalize emails to lowercase
CREATE OR REPLACE FUNCTION public.allowed_users_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER allowed_users_normalize_trg
  BEFORE INSERT OR UPDATE ON public.allowed_users
  FOR EACH ROW EXECUTE FUNCTION public.allowed_users_normalize();

-- True if current user is on allowlist, is an admin, or no admin exists yet (bootstrap)
CREATE OR REPLACE FUNCTION public.is_user_allowed(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- bootstrap: nobody yet, allow first sign-in to claim admin
    (NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'))
    OR public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1
      FROM auth.users u
      JOIN public.allowed_users a ON lower(a.email) = lower(u.email)
      WHERE u.id = _user_id
    );
$$;
