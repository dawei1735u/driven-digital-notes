
GRANT EXECUTE ON FUNCTION public.is_user_allowed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
