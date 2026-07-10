import { createClient } from "npm:@supabase/supabase-js@2.106.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AUTH_PARTNER_PATH = "/api/v2/shop/auth_partner";
const TOKEN_GET_PATH = "/api/v2/auth/token/get";
const PARTNER_ORIGINS = new Set(["https://partner.shopeemobile.com"]);
const ADS_ORIGINS = new Set(["https://openplatform.shopee.com.br"]);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase env vars");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

function nowIso() {
  return new Date().toISOString();
}

function cleanBaseUrl(value: unknown, fallback: string, allowedOrigins: Set<string>) {
  let url: URL;
  try {
    url = new URL(String(value || fallback).trim());
  } catch {
    throw new HttpError(400, "URL base da Shopee inválida.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new HttpError(400, "A URL base da Shopee deve ser uma origem HTTPS sem caminho, credenciais, porta, query ou fragmento.");
  }
  if (!allowedOrigins.has(url.origin)) throw new HttpError(400, "URL base da Shopee não permitida.");
  return url.origin;
}

function normalizeRedirectUri(value: unknown) {
  let url: URL;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new HttpError(400, "Redirect URL inválida.");
  }
  const production = url.protocol === "https:" && (
    url.hostname === "ecommerce-control-jv.netlify.app" ||
    /^[a-z0-9-]+--ecommerce-control-jv\.netlify\.app$/i.test(url.hostname)
  );
  const localDevelopment = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!production && !localDevelopment) || url.username || url.password) {
    throw new HttpError(400, "Redirect URL não permitida para este aplicativo.");
  }
  return url.toString();
}

function asPositiveInt(value: unknown, fieldName: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) throw new Error(`${fieldName} inválido.`);
  return Math.trunc(numberValue);
}

function randomState() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function addStateToRedirect(redirectUri: string, state: string) {
  const url = new URL(redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

function safeApp(app: any) {
  if (!app) return null;
  return {
    id: app.id,
    user_id: app.user_id,
    account_id: app.account_id,
    app_name: app.app_name,
    partner_id: app.partner_id,
    app_type: app.app_type,
    environment: app.environment,
    base_url: app.base_url,
    ads_base_url: app.ads_base_url,
    auth_base_url: app.auth_base_url,
    redirect_uri: app.redirect_uri,
    status: app.status,
    created_at: app.created_at,
    updated_at: app.updated_at
  };
}

function safeShop(shop: any) {
  return {
    id: shop.id,
    account_id: shop.account_id,
    app_id: shop.app_id,
    shop_id: shop.shop_id,
    shop_name: shop.shop_name,
    connection_status: shop.connection_status ?? "manual",
    region: shop.region ?? "BR",
    token_expire_in: shop.token_expire_in,
    auth_expires_at: shop.auth_expires_at,
    updated_at: shop.updated_at,
    sync_ready: Boolean(shop.access_token && shop.refresh_token),
    token_expired: shop.token_expire_in ? new Date(shop.token_expire_in).getTime() <= Date.now() : true
  };
}

async function hmacSha256Hex(secret: string, message: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function shopeeSign(partnerId: number, partnerKey: string, path: string, timestamp: number, accessToken = "", shopId = "") {
  return hmacSha256Hex(partnerKey, `${partnerId}${path}${timestamp}${accessToken}${shopId}`);
}

async function getUserFromRequest(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  const jwt = header.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new HttpError(401, "Sessão Supabase ausente. Faça login novamente.");
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Sessão Supabase inválida ou expirada.");
  return data.user;
}

async function getManagementMembership(userId: string, accountId?: string | null) {
  let query = supabase
    .from("account_members")
    .select("account_id,role")
    .eq("user_id", userId)
    .in("role", ["owner", "admin"]);
  if (accountId) query = query.eq("account_id", accountId);
  const { data, error } = await query.limit(1);
  if (error) throw error;
  const membership = (data ?? [])[0];
  if (!membership) throw new HttpError(403, "Apenas proprietários e administradores podem gerenciar a integração Shopee.");
  return membership;
}

async function getApp(userId: string, appId: string) {
  const { data, error } = await supabase
    .from("shopee_apps")
    .select("*")
    .eq("id", appId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("App Shopee não encontrado para este usuário.");
  return data;
}

async function getSecret(appId: string) {
  const { data, error } = await supabase
    .from("shopee_app_secrets")
    .select("partner_key")
    .eq("app_id", appId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.partner_key) throw new Error("Partner Key não cadastrada para este app Shopee.");
  return String(data.partner_key);
}

async function listResources(userId: string) {
  const [{ data: apps, error: appsError }, { data: shops, error: shopsError }] = await Promise.all([
    supabase
      .from("shopee_apps")
      .select("id,user_id,account_id,app_name,partner_id,app_type,environment,base_url,ads_base_url,auth_base_url,redirect_uri,status,created_at,updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("shopee_shops")
      .select("id,account_id,app_id,shop_id,shop_name,connection_status,region,token_expire_in,auth_expires_at,updated_at,access_token,refresh_token")
      .eq("user_id", userId)
      .order("shop_name", { ascending: true })
  ]);
  if (appsError) throw appsError;
  if (shopsError) throw shopsError;
  return {
    ok: true,
    version: "shopee-auth-2026-07-10.release-hardening-v2",
    apps: (apps ?? []).map(safeApp),
    shops: (shops ?? []).map(safeShop),
    oauthUrl: null
  };
}

async function registerApp(userId: string, body: any) {
  const membership = await getManagementMembership(userId, body.account_id || null);
  const partnerId = asPositiveInt(body.partner_id, "Partner ID");
  const partnerKey = String(body.partner_key ?? "").trim();
  if (partnerKey.length < 8) throw new Error("Partner Key inválida ou muito curta.");
  const environment = String(body.environment || "live").toLowerCase() === "sandbox" ? "sandbox" : "live";
  const appName = String(body.app_name || `Shopee App ${partnerId}`).trim();
  const baseUrl = cleanBaseUrl(body.base_url, "https://partner.shopeemobile.com", PARTNER_ORIGINS);
  const adsBaseUrl = cleanBaseUrl(body.ads_base_url, "https://openplatform.shopee.com.br", ADS_ORIGINS);
  const authBaseUrl = cleanBaseUrl(body.auth_base_url, baseUrl, PARTNER_ORIGINS);
  const redirectUri = body.redirect_uri ? normalizeRedirectUri(body.redirect_uri) : null;
  const appRow = {
    user_id: userId,
    account_id: membership.account_id,
    app_name: appName,
    partner_id: partnerId,
    app_type: String(body.app_type || "seller_in_house"),
    environment,
    base_url: baseUrl,
    ads_base_url: adsBaseUrl,
    auth_base_url: authBaseUrl,
    redirect_uri: redirectUri,
    status: "active",
    updated_at: nowIso()
  };
  const { data: app, error: appError } = await supabase
    .from("shopee_apps")
    .upsert(appRow, { onConflict: "user_id,partner_id,environment" })
    .select("*")
    .single();
  if (appError) throw appError;
  const { error: secretError } = await supabase
    .from("shopee_app_secrets")
    .upsert({ app_id: app.id, partner_key: partnerKey, updated_at: nowIso() }, { onConflict: "app_id" });
  if (secretError) throw secretError;
  return { ok: true, app: safeApp(app), message: "App Shopee salvo com segurança no Supabase." };
}

async function generateOAuthUrl(userId: string, body: any, req: Request) {
  const appId = String(body.app_id || "").trim();
  if (!appId) throw new Error("Selecione um app Shopee antes de gerar o link de autorização.");
  const app = await getApp(userId, appId);
  await getManagementMembership(userId, app.account_id);
  if (app.status !== "active") throw new Error("Este app Shopee não está ativo.");
  const partnerKey = await getSecret(app.id);
  const origin = req.headers.get("origin") || "";
  const redirectCandidate = String(body.redirect_uri || app.redirect_uri || (origin ? `${origin}/` : "")).trim();
  if (!redirectCandidate) throw new Error("Informe uma Redirect URL para a Shopee devolver o código de autorização.");
  const redirectUri = normalizeRedirectUri(redirectCandidate);
  const state = randomState();
  const redirectWithState = addStateToRedirect(redirectUri, state);
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await shopeeSign(Number(app.partner_id), partnerKey, AUTH_PARTNER_PATH, timestamp);
  const authUrl = new URL(`${cleanBaseUrl(app.auth_base_url || app.base_url, "https://partner.shopeemobile.com", PARTNER_ORIGINS)}${AUTH_PARTNER_PATH}`);
  authUrl.searchParams.set("partner_id", String(app.partner_id));
  authUrl.searchParams.set("timestamp", String(timestamp));
  authUrl.searchParams.set("sign", sign);
  authUrl.searchParams.set("redirect", redirectWithState);
  const { error: stateError } = await supabase
    .from("shopee_oauth_states")
    .insert({ state, user_id: userId, app_id: app.id, shop_name: body.shop_name ? String(body.shop_name).trim() : null, redirect_uri: redirectUri });
  if (stateError) throw stateError;
  return { ok: true, app: safeApp(app), oauthUrl: authUrl.toString(), redirect_uri: redirectUri, state, expires_in_minutes: 20 };
}

async function loadState(userId: string, state: string) {
  const { data, error } = await supabase
    .from("shopee_oauth_states")
    .select("*")
    .eq("state", state)
    .eq("user_id", userId)
    .is("consumed_at", null)
    .gt("expires_at", nowIso())
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function exchangeAuthCode(app: any, partnerKey: string, code: string, shopId?: number) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await shopeeSign(Number(app.partner_id), partnerKey, TOKEN_GET_PATH, timestamp);
  const url = new URL(`${cleanBaseUrl(app.base_url, "https://partner.shopeemobile.com", PARTNER_ORIGINS)}${TOKEN_GET_PATH}`);
  url.searchParams.set("partner_id", String(app.partner_id));
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);
  const payload: Record<string, unknown> = { code, partner_id: Number(app.partner_id) };
  if (shopId) payload.shop_id = shopId;
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "error",
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Shopee token/get HTTP ${response.status}: ${text}`);
  const parsed = text ? JSON.parse(text) : {};
  if (parsed.error) throw new Error(`Shopee token/get error=${String(parsed.error)} message=${String(parsed.message ?? "")}`);
  return parsed.response ?? parsed;
}

async function authShop(userId: string, body: any) {
  const code = String(body.code || "").trim();
  if (!code) throw new Error("Código de autorização ausente.");
  let appId = String(body.app_id || "").trim();
  let shopName = body.shop_name ? String(body.shop_name).trim() : "";
  const stateValue = String(body.state || "").trim();
  let stateRow: any = null;
  if (stateValue) {
    stateRow = await loadState(userId, stateValue);
    if (!stateRow) throw new Error("Estado OAuth inválido, expirado ou já utilizado. Gere um novo link de autorização.");
    appId = stateRow.app_id;
    if (!shopName && stateRow.shop_name) shopName = stateRow.shop_name;
  }
  if (!appId) throw new Error("App Shopee ausente. Informe app_id ou use um link OAuth gerado pelo sistema.");
  const app = await getApp(userId, appId);
  const membership = await getManagementMembership(userId, app.account_id);
  const partnerKey = await getSecret(app.id);
  const requestShopId = body.shop_id ? asPositiveInt(body.shop_id, "Shop ID") : undefined;
  const tokenResponse = await exchangeAuthCode(app, partnerKey, code, requestShopId);
  const accessToken = String(tokenResponse.access_token || "");
  const refreshToken = String(tokenResponse.refresh_token || "");
  const expireIn = Number(tokenResponse.expire_in || 0);
  const responseShopId = Number(tokenResponse.shop_id || requestShopId || 0);
  const shopIds = Array.isArray(tokenResponse.shop_id_list) ? tokenResponse.shop_id_list.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0) : [];
  const finalShopIds = responseShopId ? [responseShopId] : shopIds;
  if (!accessToken || !refreshToken || !expireIn) throw new Error("A Shopee não retornou access_token, refresh_token ou expire_in válidos.");
  if (!finalShopIds.length) throw new Error("A Shopee não retornou shop_id. Cole a URL de retorno completa ou informe o Shop ID manualmente.");
  const expireIso = new Date(Date.now() + expireIn * 1000).toISOString();
  const rows = finalShopIds.map((shopId: number) => ({
    user_id: userId,
    account_id: app.account_id || membership.account_id,
    app_id: app.id,
    shop_id: shopId,
    shop_name: shopName || (finalShopIds.length > 1 ? `Shopee ${shopId}` : "Loja Shopee"),
    access_token: accessToken,
    refresh_token: refreshToken,
    token_expire_in: expireIso,
    auth_expires_at: expireIso,
    connection_status: "oauth_connected",
    region: "BR",
    updated_at: nowIso()
  }));
  const { data: shops, error: upsertError } = await supabase
    .from("shopee_shops")
    .upsert(rows, { onConflict: "user_id,shop_id" })
    .select("id,account_id,app_id,shop_id,shop_name,connection_status,region,token_expire_in,auth_expires_at,updated_at,access_token,refresh_token");
  if (upsertError) throw upsertError;
  if (stateRow) {
    await supabase.from("shopee_oauth_states").update({ consumed_at: nowIso() }).eq("state", stateRow.state).eq("user_id", userId);
  }
  return { ok: true, app: safeApp(app), shops: (shops ?? []).map(safeShop), message: "Loja Shopee vinculada com sucesso." };
}

async function linkManualShop(userId: string, body: any) {
  const appId = String(body.app_id || "").trim() || null;
  let app: any = null;
  if (appId) app = await getApp(userId, appId);
  const membership = await getManagementMembership(userId, app?.account_id || body.account_id || null);
  const shopId = asPositiveInt(body.shop_id, "Shop ID");
  const shopName = String(body.shop_name || `Shopee ${shopId}`).trim();
  const accessToken = String(body.access_token || "").trim();
  const refreshToken = String(body.refresh_token || "").trim();
  if (!accessToken || !refreshToken) throw new Error("Access Token e Refresh Token são obrigatórios para vinculação manual.");
  const expireIso = body.token_expire_in ? new Date(body.token_expire_in).toISOString() : new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("shopee_shops")
    .upsert({
      user_id: userId,
      account_id: app?.account_id || membership.account_id,
      app_id: app?.id || null,
      shop_id: shopId,
      shop_name: shopName,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expire_in: expireIso,
      auth_expires_at: expireIso,
      connection_status: app ? "manual_with_app" : "manual",
      region: "BR",
      updated_at: nowIso()
    }, { onConflict: "user_id,shop_id" })
    .select("id,account_id,app_id,shop_id,shop_name,connection_status,region,token_expire_in,auth_expires_at,updated_at,access_token,refresh_token")
    .single();
  if (error) throw error;
  return { ok: true, shop: safeShop(data), message: "Loja Shopee vinculada manualmente." };
}

async function unlinkShop(userId: string, body: any) {
  const shopId = asPositiveInt(body.shop_id, "Shop ID");
  const { data: shop, error: shopError } = await supabase
    .from("shopee_shops")
    .select("account_id")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (shopError) throw shopError;
  if (!shop) throw new HttpError(404, "Loja Shopee não encontrada.");
  await getManagementMembership(userId, shop.account_id);
  const { error } = await supabase.from("shopee_shops").delete().eq("user_id", userId).eq("shop_id", shopId);
  if (error) throw error;
  return { ok: true, message: "Loja Shopee desvinculada." };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await getUserFromRequest(req);
    if (req.method === "GET") return jsonResponse(await listResources(user.id));
    if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (action === "register-app") return jsonResponse(await registerApp(user.id, body));
    if (action === "generate-oauth-url") return jsonResponse(await generateOAuthUrl(user.id, body, req));
    if (action === "auth-shop") return jsonResponse(await authShop(user.id, body));
    if (action === "link-manual-shop") return jsonResponse(await linkManualShop(user.id, body));
    if (action === "unlink-shop") return jsonResponse(await unlinkShop(user.id, body));
    if (action === "list") return jsonResponse(await listResources(user.id));
    throw new Error(`Ação Shopee Auth não suportada: ${action || "vazia"}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof HttpError ? error.status : 400;
    return jsonResponse({ ok: false, error: message }, status);
  }
});
