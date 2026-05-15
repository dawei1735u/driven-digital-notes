
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

revoke all on function public.has_any_admin() from public, anon;
grant execute on function public.has_any_admin() to authenticated;
