import { createClient } from "npm:@supabase/supabase-js@2.106.2";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ENABLED = Deno.env.get("MAVIS_SHOPEE_V3_ENABLED") === "true";
const PARTNER_KEY = Deno.env.get("SHOPEE_THIRD_PARTY_PARTNER_KEY") ?? "";
const BASE_URL = "https://partner.shopeemobile.com";
const DEFAULT_ORIGIN = Deno.env.get("APP_RETURN_URL") ?? "https://mavis-hub.netlify.app";
const ALLOWED_ORIGINS = new Set((Deno.env.get("APP_ALLOWED_RETURN_ORIGINS") ?? DEFAULT_ORIGIN).split(",").map((v) => v.trim()).filter(Boolean));
if (!URL || !KEY) throw new Error("Missing Supabase environment variables");
const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", ...cors(req) } });
}
function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) || /^https:\/\/[a-z0-9-]+--mavis-hub\.netlify\.app$/i.test(origin);
  return { "Access-Control-Allow-Origin": allowed ? origin : new URL(DEFAULT_ORIGIN).origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
}
async function userFor(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "Sessão ausente.");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Sessão inválida ou expirada.");
  return data.user;
}
async function manager(userId: string, accountId: string) {
  const { data, error } = await db.from("account_members").select("role").eq("user_id", userId).eq("account_id", accountId).maybeSingle();
  if (error) throw error;
  if (!data || !["owner", "admin"].includes(String(data.role))) throw new HttpError(403, "Ação não permitida para este perfil.");
}
async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const result = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function refresh(authorizationId: string, shopId: number) {
  const { data, error } = await db.rpc("get_shopee_authorization_tokens_v3", { p_authorization_id: authorizationId });
  if (error) throw error;
  const credential = (data ?? [])[0];
  if (!credential) throw new HttpError(409, "Autorização indisponível.");
  const path = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await hmac(PARTNER_KEY, `${credential.partner_id}${path}${timestamp}`);
  const endpoint = new URL(`${BASE_URL}${path}`);
  endpoint.search = new URLSearchParams({ partner_id: String(credential.partner_id), timestamp: String(timestamp), sign: signature }).toString();
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partner_id: credential.partner_id, shop_id: shopId, refresh_token: credential.refresh_token }), redirect: "error", signal: AbortSignal.timeout(30000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new HttpError(502, "A Shopee recusou a renovação da autorização.");
  const token = payload.response ?? payload;
  if (!token.access_token || !token.refresh_token || !Number(token.expire_in)) throw new HttpError(502, "Resposta de autorização incompleta.");
  const accessExpiry = new Date(Date.now() + Number(token.expire_in) * 1000).toISOString();
  const refreshExpiry = token.refresh_expire_in ? new Date(Date.now() + Number(token.refresh_expire_in) * 1000).toISOString() : credential.refresh_expires_at;
  const { error: rotateError } = await db.rpc("rotate_shopee_authorization_tokens_v3", {
    p_authorization_id: authorizationId, p_access_token: token.access_token, p_refresh_token: token.refresh_token,
    p_access_expires_at: accessExpiry, p_refresh_expires_at: refreshExpiry
  });
  if (rotateError) throw rotateError;
  return { access_expires_at: accessExpiry, refresh_expires_at: refreshExpiry };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const correlationId = crypto.randomUUID();
  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const user = await userFor(req);
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.account_id ?? "");
    const connectionId = String(body.connection_id ?? "");
    const action = String(body.action ?? "status");
    if (!accountId || !connectionId) throw new HttpError(400, "Conta e conexão são obrigatórias.");
    const { data: connection, error } = await db.from("shopee_connections")
      .select("id,account_id,authorization_id,external_shop_id,shop_name,status,last_sync_at,last_error")
      .eq("id", connectionId).eq("account_id", accountId).maybeSingle();
    if (error) throw error;
    if (!connection) throw new HttpError(404, "Conexão não encontrada.");
    if (action === "status") return json(req, { ok: true, connection: { id: connection.id, shop_id: connection.external_shop_id, name: connection.shop_name, status: connection.status, last_sync_at: connection.last_sync_at, last_error: connection.last_error }, enabled: ENABLED });
    await manager(user.id, accountId);
    if (!ENABLED) throw new HttpError(503, "Sincronização Shopee v3 ainda não está habilitada.");
    if (!connection.authorization_id || connection.status !== "active") throw new HttpError(409, "A conexão precisa ser reautorizada.");
    if (action === "refresh-token") return json(req, { ok: true, action, result: await refresh(connection.authorization_id, Number(connection.external_shop_id)) });
    throw new HttpError(400, "Ação não suportada nesta versão.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error("shopee-sync-v3", correlationId, error instanceof Error ? error.message : "unknown");
    return json(req, { ok: false, error: status === 500 ? "Falha na sincronização." : (error as Error).message, correlation_id: correlationId }, status);
  }
});
