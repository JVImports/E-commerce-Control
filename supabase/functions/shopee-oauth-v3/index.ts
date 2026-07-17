import { createClient } from "npm:@supabase/supabase-js@2.106.2";
import { resolveShopeeV3Environment } from "../_shared/shopee-v3-environment.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PARTNER_ID = Number(Deno.env.get("SHOPEE_THIRD_PARTY_PARTNER_ID") ?? "0");
const PARTNER_KEY = Deno.env.get("SHOPEE_THIRD_PARTY_PARTNER_KEY") ?? "";
const V3_ENABLED = Deno.env.get("MAVIS_SHOPEE_V3_ENABLED") === "true";
const SHOPEE_ENVIRONMENT = resolveShopeeV3Environment(Deno.env.get("SHOPEE_THIRD_PARTY_ENVIRONMENT"));
const PARTNER_ORIGIN = SHOPEE_ENVIRONMENT.partnerOrigin;
const AUTH_PATH = "/api/v2/shop/auth_partner";
const CALLBACK_URL = Deno.env.get("SHOPEE_THIRD_PARTY_REDIRECT_URI") ??
  `${SUPABASE_URL}/functions/v1/shopee-oauth-callback-v3`;
const DEFAULT_RETURN_URL = Deno.env.get("APP_RETURN_URL") ??
  "https://ecommerce-control-jv.netlify.app/";
const ALLOWED_RETURN_ORIGINS = new Set(
  (Deno.env.get("APP_ALLOWED_RETURN_ORIGINS") ??
    "https://ecommerce-control-jv.netlify.app,http://localhost:8888,http://127.0.0.1:8888")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables");
}

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

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const preview = /^https:\/\/[a-z0-9-]+--ecommerce-control-jv\.netlify\.app$/i.test(origin);
  return {
    "Access-Control-Allow-Origin": ALLOWED_RETURN_ORIGINS.has(origin) || preview ? origin : new URL(DEFAULT_RETURN_URL).origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) }
  });
}

function isConfigured() {
  return V3_ENABLED && Number.isFinite(PARTNER_ID) && PARTNER_ID > 0 && PARTNER_KEY.length >= 8;
}

function randomState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeReturnPath(value: unknown) {
  const path = String(value || "/").trim();
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\r\n]/.test(path)) {
    throw new HttpError(400, "Caminho de retorno inválido.");
  }
  return path.split("#")[0];
}

async function getUser(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new HttpError(401, "Sessão Supabase ausente.");
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Sessão Supabase inválida ou expirada.");
  return data.user;
}

async function getMemberships(userId: string) {
  const { data, error } = await supabase
    .from("account_members")
    .select("account_id,role")
    .eq("user_id", userId);
  if (error) throw error;
  return data ?? [];
}

async function resolveMembership(userId: string, accountId: unknown, requireManager: boolean) {
  const memberships = await getMemberships(userId);
  const requested = String(accountId || "").trim();
  const membership = requested
    ? memberships.find((row) => String(row.account_id) === requested)
    : memberships.length === 1 ? memberships[0] : null;
  if (!membership) {
    throw new HttpError(
      400,
      requested ? "Conta não encontrada para este usuário." : "Selecione uma conta antes de conectar a Shopee."
    );
  }
  if (requireManager && !["owner", "admin"].includes(String(membership.role))) {
    throw new HttpError(403, "Apenas proprietários e administradores podem conectar lojas.");
  }
  return membership;
}

async function bootstrap(userId: string) {
  const memberships = await getMemberships(userId);
  const accountIds = memberships.map((row) => row.account_id);
  if (!accountIds.length) return { accounts: [], connections: [], configured: isConfigured(), environment: SHOPEE_ENVIRONMENT.environment };

  const [{ data: accounts, error: accountError }, { data: connections, error: connectionError }] =
    await Promise.all([
      supabase.from("accounts").select("id,name,status").in("id", accountIds),
      supabase.from("shopee_connections")
        .select("id,account_id,environment,external_shop_id,shop_name,region,status,authorized_at,last_sync_at,last_error,updated_at")
        .in("account_id", accountIds)
        .eq("environment", SHOPEE_ENVIRONMENT.environment)
        .order("updated_at", { ascending: false })
    ]);
  if (accountError) throw accountError;
  if (connectionError) throw connectionError;

  const roleByAccount = new Map(memberships.map((row) => [String(row.account_id), row.role]));
  return {
    configured: isConfigured(),
    environment: SHOPEE_ENVIRONMENT.environment,
    callback_url: CALLBACK_URL,
    accounts: (accounts ?? []).map((account) => ({
      ...account,
      role: roleByAccount.get(String(account.id))
    })),
    connections: connections ?? []
  };
}

async function startAuthorization(userId: string, body: Record<string, unknown>) {
  if (!isConfigured()) {
    throw new HttpError(503, "A conexão Shopee está temporariamente indisponível.");
  }
  const membership = await resolveMembership(userId, body.account_id, true);
  const returnPath = normalizeReturnPath(body.return_path);
  const state = randomState();
  const stateHash = await sha256(state);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error: stateError } = await supabase.rpc("create_shopee_oauth_state_v3", {
    p_state_hash: stateHash,
    p_user_id: userId,
    p_account_id: membership.account_id,
    p_return_path: returnPath,
    p_expires_at: expiresAt
  });
  if (stateError) throw stateError;

  const callback = new URL(CALLBACK_URL);
  callback.searchParams.set("state", state);
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await hmacSha256(PARTNER_KEY, `${PARTNER_ID}${AUTH_PATH}${timestamp}`);
  const authorization = new URL(`${PARTNER_ORIGIN}${AUTH_PATH}`);
  authorization.searchParams.set("partner_id", String(PARTNER_ID));
  authorization.searchParams.set("timestamp", String(timestamp));
  authorization.searchParams.set("sign", sign);
  authorization.searchParams.set("redirect", callback.toString());

  return {
    ok: true,
    account_id: membership.account_id,
    environment: SHOPEE_ENVIRONMENT.environment,
    authorization_url: authorization.toString(),
    expires_at: expiresAt
  };
}

async function disconnect(userId: string, body: Record<string, unknown>) {
  const membership = await resolveMembership(userId, body.account_id, true);
  const connectionId = String(body.connection_id || "");
  const { data: connection, error } = await supabase
    .from("shopee_connections")
    .select("id,account_id")
    .eq("id", connectionId)
    .eq("account_id", membership.account_id)
    .eq("environment", SHOPEE_ENVIRONMENT.environment)
    .maybeSingle();
  if (error) throw error;
  if (!connection) throw new HttpError(404, "Conexão Shopee não encontrada.");

  const { error: revokeError } = await supabase.rpc("revoke_shopee_connection_v3", {
    p_connection_id: connection.id
  });
  if (revokeError) throw revokeError;
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const user = await getUser(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "bootstrap");

    if (action === "bootstrap") return json(req, { ok: true, ...(await bootstrap(user.id)) });
    if (action === "start") return json(req, await startAuthorization(user.id, body));
    if (action === "disconnect") return json(req, await disconnect(user.id, body));
    throw new HttpError(400, "Ação não suportada.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof HttpError ? error.status : 500;
    return json(req, { ok: false, error: message }, status);
  }
});
