import { createClient } from "npm:@supabase/supabase-js@2.106.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEFAULT_ORIGIN = Deno.env.get("APP_RETURN_URL") ?? "https://mavis-hub.netlify.app";
const ALLOWED_ORIGINS = new Set([
  DEFAULT_ORIGIN,
  "https://ecommerce-control-jv.netlify.app",
  "http://localhost:8888",
  "http://127.0.0.1:8888"
]);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase env vars");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function headers(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const preview = /^https:\/\/[a-z0-9-]+--(?:mavis-hub|ecommerce-control-jv)\.netlify\.app$/i.test(origin);
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) || preview ? origin : DEFAULT_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers(req) }
  });
}

async function getUser(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new HttpError(401, "Sessão Supabase ausente.");
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Sessão Supabase inválida ou expirada.");
  return data.user;
}

async function assertManager(userId: string, accountId: string) {
  const { data, error } = await supabase
    .from("account_members")
    .select("role")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || !["owner", "admin"].includes(String(data.role))) {
    throw new HttpError(403, "Apenas proprietários e administradores podem importar Ads.");
  }
}

function asNumber(value: unknown) {
  const numberValue = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function asInteger(value: unknown) {
  return Math.max(0, Math.trunc(asNumber(value)));
}

function asDate(value: unknown) {
  const normalized = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new HttpError(400, `Data inválida no relatório: ${String(value)}`);
  }
  return normalized;
}

function normalizeRows(rows: unknown[]) {
  if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, "O relatório não contém linhas.");
  if (rows.length > 5000) throw new HttpError(413, "O MVP aceita até 5.000 linhas por arquivo.");

  return rows.map((raw: any, index) => {
    const expense = Math.max(0, asNumber(raw.expense));
    const directGmv = Math.max(0, asNumber(raw.direct_gmv));
    const broadGmv = Math.max(0, asNumber(raw.broad_gmv));
    return {
      performance_date: asDate(raw.performance_date),
      campaign_id: String(raw.campaign_id ?? "").trim().slice(0, 120),
      campaign_name: String(raw.campaign_name ?? "").trim().slice(0, 500) || null,
      item_id: asInteger(raw.item_id),
      model_id: asInteger(raw.model_id),
      placement_key: String(raw.placement_key ?? "").trim().slice(0, 120),
      source_row_hash: null,
      impressions: asInteger(raw.impressions),
      clicks: asInteger(raw.clicks),
      orders: asInteger(raw.orders),
      expense: expense.toFixed(4),
      direct_gmv: directGmv.toFixed(4),
      broad_gmv: broadGmv.toFixed(4),
      _row: index + 2
    };
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

async function contentHash(rows: unknown[]) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(rows))
  );
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const user = await getUser(req);
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.account_id || "");
    const connectionId = String(body.connection_id || "");
    if (!accountId || !connectionId) throw new HttpError(400, "Conta e conexão Shopee são obrigatórias.");
    await assertManager(user.id, accountId);

    const { data: connection, error: connectionError } = await supabase
      .from("shopee_connections")
      .select("id,account_id,external_shop_id,status")
      .eq("id", connectionId)
      .eq("account_id", accountId)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection) throw new HttpError(404, "Conexão Shopee não encontrada.");
    if (connection.status !== "active") throw new HttpError(409, "A loja precisa estar conectada.");

    if (body.replace_period !== true) {
      throw new HttpError(400, "Confirme que o arquivo representa o período completo antes de importar.");
    }
    const normalized = normalizeRows(body.rows);
    const hash = await contentHash(normalized);
    const dates = normalized.map((row) => row.performance_date).sort();
    const fileName = String(body.file_name || "relatorio-ads.xlsx").replace(/[\\/]/g, "_").slice(0, 180);

    const { data: duplicate, error: duplicateError } = await supabase
      .from("shopee_ads_import_batches")
      .select("id,status,row_count,imported_at")
      .eq("account_id", accountId)
      .eq("shop_id", connection.external_shop_id)
      .eq("content_sha256", hash)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate?.status === "completed") {
      return json(req, { ok: true, duplicate: true, batch: duplicate });
    }

    const batchPayload = {
      account_id: accountId,
      connection_id: connection.id,
      shop_id: connection.external_shop_id,
      report_kind: "product_daily",
      schema_version: 1,
      file_name: fileName,
      content_sha256: hash,
      period_start: dates[0],
      period_end: dates[dates.length - 1],
      row_count: normalized.length,
      replace_period: true,
      status: "processing",
      error_message: null,
      imported_by_user_id: user.id,
      imported_at: new Date().toISOString()
    };
    const { data: batch, error: batchError } = await supabase
      .from("shopee_ads_import_batches")
      .upsert(batchPayload, { onConflict: "account_id,shop_id,content_sha256" })
      .select("id")
      .single();
    if (batchError) throw batchError;

    const rows = normalized.map(({ _row: _ignored, ...row }) => row);
    const { data: committedRows, error: importError } = await supabase.rpc(
      "commit_shopee_ads_manual_v1",
      { p_batch_id: batch.id, p_rows: rows }
    );
    if (importError) {
      await supabase.from("shopee_ads_import_batches")
        .update({ status: "failed", error_message: importError.message })
        .eq("id", batch.id);
      throw importError;
    }

    return json(req, {
      ok: true,
      duplicate: false,
      batch_id: batch.id,
      shop_id: connection.external_shop_id,
      rows: Number(committedRows ?? normalized.length),
      period_start: dates[0],
      period_end: dates[dates.length - 1]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof HttpError ? error.status : 500;
    return json(req, { ok: false, error: message }, status);
  }
});
