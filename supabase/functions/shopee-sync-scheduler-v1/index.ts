import { createClient } from "npm:@supabase/supabase-js@2.106.2";
import { DAILY_SYNC_LIMIT, STORAGE_STOP_BYTES, syncFailure } from "../_shared/shopee-sync-policy.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SCHEDULER_SECRET = Deno.env.get("MAVIS_SHOPEE_SCHEDULER_SECRET") ?? "";
const LEASE_MINUTES = 15;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SCHEDULER_SECRET) {
  throw new Error("Missing scheduler environment variables");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

type Schedule = {
  id: string;
  account_id: string;
  connection_id: string;
  action: string;
  initial_action: string;
  initial_payload: Record<string, unknown>;
  payload: Record<string, unknown>;
  cadence_minutes: number;
  priority: number;
  initial_pending: boolean;
  attempts: number;
};
class SyncError extends Error {
  constructor(message: string, public code = "sync_failed") { super(message); }
}

async function getShopId(connectionId: string) {
  const { data, error } = await admin
    .from("shopee_connections")
    .select("external_shop_id")
    .eq("id", connectionId)
    .single();
  if (error) throw error;
  return Number(data.external_shop_id);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function authorized(req: Request) {
  return req.headers.get("x-mavis-scheduler-secret") === SCHEDULER_SECRET;
}

function nowIso() {
  return new Date().toISOString();
}

function afterMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function sanitizedError(error: unknown) {
  return String(error instanceof Error ? error.message : error).replace(/[\r\n]+/g, " ").slice(0, 500);
}

async function nextDueSchedule() {
  const now = nowIso();
  const dueFilter = `and(status.eq.pending,next_run_at.lte.${now}),and(status.eq.running,lease_expires_at.lt.${now})`;
  const { data: candidates, error } = await admin
    .from("shopee_sync_schedules")
    .select("id,account_id,connection_id,action,initial_action,initial_payload,payload,cadence_minutes,priority,initial_pending,attempts,connection:shopee_connections!inner(status,environment)")
    .eq("enabled", true)
    .eq("connection.status", "active")
    .eq("connection.environment", "live")
    .or(dueFilter)
    .order("priority", { ascending: false })
    .order("next_run_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  const candidate = candidates?.[0] as Schedule | undefined;
  if (!candidate) return null;

  const { data: claimed, error: claimError } = await admin
    .from("shopee_sync_schedules")
    .update({
      status: "running",
      lease_expires_at: afterMinutes(LEASE_MINUTES),
      last_started_at: now,
      updated_at: now
    })
    .eq("id", candidate.id)
    .eq("enabled", true)
    .or(dueFilter)
    .select("id,account_id,connection_id,action,initial_action,initial_payload,payload,cadence_minutes,priority,initial_pending,attempts")
    .maybeSingle();
  if (claimError) throw claimError;
  return claimed as Schedule | null;
}

async function callSync(schedule: Schedule) {
  const action = schedule.initial_pending ? schedule.initial_action : schedule.action;
  const payload = schedule.initial_pending ? schedule.initial_payload : schedule.payload;
  const response = await fetch(`${SUPABASE_URL}/functions/v1/shopee-sync-v3`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "x-mavis-scheduler-secret": SCHEDULER_SECRET
    },
    body: JSON.stringify({
      action,
      account_id: schedule.account_id,
      connection_id: schedule.connection_id,
      ...payload
    }),
    signal: AbortSignal.timeout(120_000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) throw new SyncError(body.error || `sync_http_${response.status}`, body.code || "sync_failed");
  return { action, result: body.result ?? null };
}

async function finish(schedule: Schedule, runId: string, outcome: { action: string; result: unknown }) {
  const finishedAt = nowIso();
  const { error: scheduleError } = await admin
    .from("shopee_sync_schedules")
    .update({
      status: "pending",
      initial_pending: false,
      attempts: 0,
      next_run_at: afterMinutes((outcome.result as any)?.hasMore ? 5 : schedule.cadence_minutes),
      lease_expires_at: null,
      last_finished_at: finishedAt,
      last_status: "success",
      last_error: null,
      updated_at: finishedAt
    })
    .eq("id", schedule.id);
  if (scheduleError) throw scheduleError;
  const { error: runError } = await admin
    .from("sync_runs")
    .update({ status: "success", finished_at: finishedAt, metadata: { action: outcome.action, result: outcome.result } })
    .eq("id", runId);
  if (runError) throw runError;
}

async function fail(schedule: Schedule, runId: string, error: unknown) {
  const finishedAt = nowIso();
  const message = sanitizedError(error);
  const attempts = schedule.attempts + 1;
  const code = error instanceof SyncError ? error.code : "sync_failed";
  const { retryMinutes, pause } = syncFailure(code, attempts);
  const { error: scheduleError } = await admin
    .from("shopee_sync_schedules")
    .update({
      status: "pending",
      enabled: !pause,
      attempts,
      next_run_at: afterMinutes(retryMinutes),
      lease_expires_at: null,
      last_finished_at: finishedAt,
      last_status: "error",
      last_error: message,
      updated_at: finishedAt
    })
    .eq("id", schedule.id);
  if (scheduleError) throw scheduleError;
  if (code === "partner_key_expired") {
    const { error: pauseError } = await admin.from("shopee_sync_schedules")
      .update({ enabled: false, last_status: "error", last_error: message, updated_at: finishedAt })
      .eq("account_id", schedule.account_id);
    if (pauseError) throw pauseError;
  }
  const { error: runError } = await admin
    .from("sync_runs")
    .update({ status: "error", finished_at: finishedAt, error_message: message })
    .eq("id", runId);
  if (runError) throw runError;
}

async function budgetAllows(schedule: Schedule) {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const [{ data: bytes, error: storageError }, { count, error: countError }] = await Promise.all([
    admin.rpc("shopee_sync_storage_bytes"),
    admin.from("sync_runs").select("id", { count: "exact", head: true })
      .eq("account_id", schedule.account_id).gte("started_at", day.toISOString())
  ]);
  if (storageError || countError) throw storageError || countError;
  if (!Number.isFinite(Number(bytes)) || bytes === null) throw new Error("Storage budget unavailable");
  const full = Number(bytes) >= STORAGE_STOP_BYTES;
  const daily = Number(count || 0) >= DAILY_SYNC_LIMIT;
  if (!full && !daily) return true;
  day.setUTCDate(day.getUTCDate() + 1);
  const message = full ? "Sincronização pausada: o banco atingiu o limite preventivo de 450 MB. Revise o armazenamento antes de retomar."
    : "Limite preventivo de sincronizações diárias atingido. A próxima tentativa ocorrerá amanhã.";
  let update = admin.from("shopee_sync_schedules").update({
    enabled: !full, status: "pending", lease_expires_at: null, next_run_at: day.toISOString(),
    last_status: "error", last_error: message, updated_at: nowIso()
  }).eq("account_id", schedule.account_id);
  if (!full) update = update.eq("id", schedule.id);
  const { error } = await update;
  if (error) throw error;
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!authorized(req)) return json({ ok: false, error: "Unauthorized" }, 401);
  try {
    const schedule = await nextDueSchedule();
    if (!schedule) return json({ ok: true, processed: false });
    if (!await budgetAllows(schedule)) return json({ ok: true, processed: false, budget_limited: true });
    const shopId = await getShopId(schedule.connection_id);

    const { data: run, error: runError } = await admin
      .from("sync_runs")
      .insert({
        account_id: schedule.account_id,
        connection_id: schedule.connection_id,
        shop_id: shopId,
        module: schedule.initial_pending ? schedule.initial_action : schedule.action,
        status: "running",
        metadata: { schedule_id: schedule.id, initial: schedule.initial_pending }
      })
      .select("id")
      .single();
    if (runError) throw runError;

    try {
      const outcome = await callSync(schedule);
      await finish(schedule, run.id, outcome);
      return json({ ok: true, processed: true, schedule_id: schedule.id, action: outcome.action });
    } catch (error) {
      await fail(schedule, run.id, error);
      return json({ ok: false, processed: true, schedule_id: schedule.id, error: sanitizedError(error) }, 502);
    }
  } catch (error) {
    return json({ ok: false, error: sanitizedError(error) }, 500);
  }
});
