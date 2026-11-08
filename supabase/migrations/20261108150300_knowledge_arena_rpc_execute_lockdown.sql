revoke all on function public.ka_get_leaderboard(integer) from public, anon, authenticated;
revoke all on function public.ka_admin_summary() from public, anon, authenticated;
grant execute on function public.ka_get_leaderboard(integer) to authenticated;
grant execute on function public.ka_admin_summary() to authenticated;
