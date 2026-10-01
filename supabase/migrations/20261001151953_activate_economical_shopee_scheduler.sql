-- Apply only after deploying sync-v3, scheduler-v1 and oauth-v3 with the shared policy.
-- Reauthorization-required connections remain paused until a successful OAuth callback.
update public.shopee_sync_schedules s
set enabled=true,status='pending',attempts=0,initial_pending=false,last_status=null,last_error=null,
    lease_expires_at=null,next_run_at=now()+case s.action
      when 'sync-orders-step' then interval '0 minutes'
      when 'sync-financial' then interval '20 minutes' else interval '40 minutes' end,
    updated_at=now()
from public.shopee_connections c
where c.id=s.connection_id and c.environment='live' and c.status='active'
  and s.action in ('sync-orders-step','sync-financial','sync-catalog');

do $$
declare scheduler_job bigint;
begin
  select jobid into strict scheduler_job from cron.job where jobname='mavis-shopee-multishop-scheduler-every-minute';
  perform cron.alter_job(job_id:=scheduler_job,schedule:='*/5 * * * *',active:=true);
end;
$$;
