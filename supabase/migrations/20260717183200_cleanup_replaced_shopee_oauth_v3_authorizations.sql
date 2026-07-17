-- Reauthorization can replace one or more existing authorizations. Revoke and
-- destroy the previous Vault secrets only after their last active connection
-- has moved to the new authorization.
create or replace function public.finalize_shopee_oauth_v3(
  p_state_hash text,
  p_partner_id bigint,
  p_access_token text,
  p_refresh_token text,
  p_access_expires_at timestamptz,
  p_refresh_expires_at timestamptz,
  p_shop_ids bigint[]
) returns table(authorization_id uuid,connection_count integer)
language plpgsql security definer set search_path = ''
as $$
declare
  oauth private.shopee_oauth_states_v3%rowtype;
  auth_id uuid := gen_random_uuid();
  access_secret uuid;
  refresh_secret uuid;
  shop bigint;
  conflict_account uuid;
  changed integer := 0;
  replaced_auth_ids uuid[] := array[]::uuid[];
  replaced_auth_id uuid;
  replaced_token private.shopee_authorization_tokens%rowtype;
begin
  select * into oauth from private.shopee_oauth_states_v3
   where state_hash=p_state_hash and status='processing'
   for update;
  if oauth.state_hash is null then raise exception 'OAuth state is not processing'; end if;
  if coalesce(array_length(p_shop_ids,1),0)=0 then raise exception 'No shops returned'; end if;

  select connection.account_id into conflict_account
  from public.shopee_connections connection
  where connection.provider='shopee' and connection.environment='live'
    and connection.region='BR' and connection.external_shop_id=any(p_shop_ids)
    and connection.account_id<>oauth.account_id
  limit 1;
  if conflict_account is not null then raise exception 'SHOP_ALREADY_CONNECTED'; end if;

  select coalesce(array_agg(distinct connection.authorization_id)
    filter (where connection.authorization_id is not null),array[]::uuid[])
    into replaced_auth_ids
  from public.shopee_connections connection
  where connection.provider='shopee' and connection.environment='live'
    and connection.region='BR' and connection.external_shop_id=any(p_shop_ids)
    and connection.account_id=oauth.account_id;

  insert into public.shopee_authorizations(
    id,account_id,provider_app_key,environment,region,partner_id,status,
    authorized_by_user_id,authorized_at,access_token_expires_at,refresh_token_expires_at
  ) values (
    auth_id,oauth.account_id,'third_party_v3','live','BR',p_partner_id,'active',
    oauth.user_id,now(),p_access_expires_at,p_refresh_expires_at
  );

  access_secret := vault.create_secret(
    p_access_token,'shopee_access_'||auth_id::text,'Shopee OAuth v3 access token'
  );
  refresh_secret := vault.create_secret(
    p_refresh_token,'shopee_refresh_'||auth_id::text,'Shopee OAuth v3 refresh token'
  );
  insert into private.shopee_authorization_tokens(
    authorization_id,access_token_secret_id,refresh_token_secret_id
  ) values (auth_id,access_secret,refresh_secret);

  foreach shop in array p_shop_ids loop
    insert into public.shopee_connections(
      authorization_id,account_id,provider,environment,region,external_shop_id,
      shop_name,status,authorized_by_user_id,authorized_at,legacy_source,metadata,updated_at
    ) values (
      auth_id,oauth.account_id,'shopee','live','BR',shop,'Shopee '||shop::text,
      'active',oauth.user_id,now(),false,jsonb_build_object('source','third_party_oauth_v3'),now()
    )
    on conflict (provider,environment,region,external_shop_id) do update set
      authorization_id=excluded.authorization_id,
      status='active',
      authorized_by_user_id=excluded.authorized_by_user_id,
      authorized_at=excluded.authorized_at,
      legacy_source=false,
      last_error=null,
      metadata=excluded.metadata,
      updated_at=now();
    changed := changed + 1;
  end loop;

  foreach replaced_auth_id in array replaced_auth_ids loop
    if replaced_auth_id<>auth_id and not exists(
      select 1 from public.shopee_connections connection
      where connection.authorization_id=replaced_auth_id and connection.status='active'
    ) then
      select * into replaced_token
      from private.shopee_authorization_tokens
      where authorization_id=replaced_auth_id
      for update;
      if replaced_token.authorization_id is not null then
        delete from vault.secrets
        where id in (replaced_token.access_token_secret_id,replaced_token.refresh_token_secret_id);
      end if;
      delete from private.shopee_authorization_tokens
      where authorization_id=replaced_auth_id;
      update public.shopee_authorizations
      set status='revoked',updated_at=now()
      where id=replaced_auth_id;
      replaced_token := null;
    end if;
  end loop;

  update private.shopee_oauth_states_v3
     set status='completed',completed_at=now(),result_authorization_id=auth_id
   where state_hash=p_state_hash;

  return query select auth_id,changed;
end;
$$;

revoke all on function public.finalize_shopee_oauth_v3(text,bigint,text,text,timestamptz,timestamptz,bigint[])
  from public,anon,authenticated;
grant execute on function public.finalize_shopee_oauth_v3(text,bigint,text,text,timestamptz,timestamptz,bigint[])
  to service_role;
