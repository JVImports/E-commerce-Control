-- RETURNS TABLE declares an authorization_id variable. Qualify the token-table
-- column in both cleanup statements so replacing an existing OAuth connection
-- does not fail with SQLSTATE 42702. Preserve signatures, grants and token logic.
do $$
declare definition text; patched text; functions_found integer:=0;
begin
  for definition in
    select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='finalize_shopee_oauth_v3'
  loop
    functions_found:=functions_found+1;
    patched:=replace(definition,'where authorization_id=replaced_auth_id',
      'where private.shopee_authorization_tokens.authorization_id=replaced_auth_id');
    if patched=definition and position('where private.shopee_authorization_tokens.authorization_id=replaced_auth_id' in definition)=0 then
      raise exception 'Unexpected OAuth cleanup definition; review required';
    end if;
    if patched<>definition then execute patched; end if;
  end loop;
  if functions_found=0 then raise exception 'OAuth finalization function not found'; end if;
end;
$$;
