import { createClient } from "npm:@supabase/supabase-js@2.106.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ENV_PARTNER_ID = Number(Deno.env.get("SHOPEE_PARTNER_ID") ?? "0");
const ENV_PARTNER_KEY = Deno.env.get("SHOPEE_PARTNER_KEY") ?? "";
const ENV_BASE_URL = Deno.env.get("SHOPEE_BASE_URL") ?? "https://partner.shopeemobile.com";
const ENV_ADS_BASE_URL = Deno.env.get("SHOPEE_ADS_BASE_URL") ?? "https://openplatform.shopee.com.br";
const SHOPEE_REQUEST_DELAY_MS = Number(Deno.env.get("SHOPEE_REQUEST_DELAY_MS") ?? "300");
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

type ShopRow = {
  id: string;
  user_id: string;
  account_id?: string | null;
  app_id?: string | null;
  shop_id: number;
  shop_name: string;
  connection_status?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  token_expire_in?: string | null;
  auth_expires_at?: string | null;
};

type ShopeeCredential = {
  appId?: string | null;
  partnerId: number;
  partnerKey: string;
  baseUrl: string;
  adsBaseUrl: string;
  source: "app" | "env";
};

type OrderMonth = { label: string; timeFrom: number; timeTo: number };

let lastRequestAt = 0;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

function nowIso() {
  return new Date().toISOString();
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function toDateOnlyIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function unixToIso(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? new Date(num * 1000).toISOString() : null;
}

function unixToDate(value: unknown) {
  const iso = unixToIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function asNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function cleanBaseUrl(value: unknown, fallback: string, allowedOrigins: Set<string>) {
  let url: URL;
  try {
    url = new URL(String(value || fallback).trim());
  } catch {
    throw new HttpError(400, "Shopee base URL inválida.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new HttpError(400, "Shopee base URL deve ser uma origem HTTPS sem caminho, credenciais, porta, query ou fragmento.");
  }
  if (!allowedOrigins.has(url.origin)) throw new HttpError(400, "Shopee base URL não permitida.");
  return url.origin;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function normalizeArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function uniqueNumbers(values: unknown[]) {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))];
}

function formatShopeeDate(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
}

function parseShopeeDate(value: unknown) {
  const [day, month, year] = String(value ?? "").split("-");
  if (!day || !month || !year) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function dateRanges(startDate: Date, endDate: Date) {
  const ranges: Array<{ startDate: string; endDate: string; label: string }> = [];
  let current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const boundedEnd = new Date(endDate);
  boundedEnd.setHours(0, 0, 0, 0);
  while (current <= boundedEnd) {
    const rangeEnd = new Date(current);
    rangeEnd.setDate(rangeEnd.getDate() + 29);
    if (rangeEnd > boundedEnd) rangeEnd.setTime(boundedEnd.getTime());
    ranges.push({
      startDate: formatShopeeDate(current),
      endDate: formatShopeeDate(rangeEnd),
      label: `${toDateOnlyIso(current)}..${toDateOnlyIso(rangeEnd)}`
    });
    current = new Date(rangeEnd);
    current.setDate(current.getDate() + 1);
  }
  return ranges;
}

function slidingWindows(timeFrom: number, timeTo: number, days: number) {
  const windows: Array<{ from: number; to: number }> = [];
  const seconds = days * 24 * 60 * 60;
  for (let start = timeFrom; start < timeTo; start = Math.min(start + seconds, timeTo)) {
    windows.push({ from: start, to: Math.min(start + seconds, timeTo) });
  }
  return windows;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function respectRateLimit(ms = SHOPEE_REQUEST_DELAY_MS) {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < ms) await sleep(ms - elapsed);
  lastRequestAt = Date.now();
}

async function hmacSha256Hex(secret: string, message: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function cryptoSign(credential: ShopeeCredential, path: string, timestamp: number, accessToken = "", shopId = "") {
  return hmacSha256Hex(credential.partnerKey, `${credential.partnerId}${path}${timestamp}${accessToken}${shopId}`);
}

async function shopeeRequest<T>({ method, path, params, payload, accessToken, shopId, requiresAuth = true, credential, baseUrl, delayMs }: {
  method: "GET" | "POST";
  path: string;
  params?: Record<string, string | number>;
  payload?: Record<string, unknown>;
  accessToken?: string;
  shopId?: string;
  requiresAuth?: boolean;
  credential: ShopeeCredential;
  baseUrl?: string;
  delayMs?: number;
}): Promise<T> {
  if (!credential.partnerId || !credential.partnerKey) throw new Error("Missing Shopee Partner ID/Key for this shop");
  if (requiresAuth && (!accessToken || !shopId)) throw new Error("Shopee authenticated request requires access token and shop id");

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = await cryptoSign(credential, path, timestamp, requiresAuth ? accessToken ?? "" : "", requiresAuth ? shopId ?? "" : "");
    const query = new URLSearchParams({ partner_id: String(credential.partnerId), timestamp: String(timestamp), sign });
    for (const [key, value] of Object.entries(params ?? {})) query.set(key, String(value));
    if (requiresAuth) {
      query.set("access_token", accessToken ?? "");
      query.set("shop_id", shopId ?? "");
    }

    await respectRateLimit(delayMs);
    const response = await fetch(`${baseUrl ?? credential.baseUrl}${path}?${query.toString()}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(30000)
    });

    if (response.status === 429 && attempt < 3) {
      await sleep(10000);
      continue;
    }
    if (response.status >= 500 && attempt < 3) {
      await sleep(1000 * attempt);
      continue;
    }
    if (!response.ok) throw new Error(`Shopee HTTP error ${response.status}: ${await response.text()}`);

    const data = await response.json();
    if (data.error) throw new Error(`Shopee error code=${String(data.error)} message=${String(data.message ?? "")}`);
    return data as T;
  }
  throw new Error(`Unexpected Shopee failure on ${path}`);
}

async function getUserFromRequest(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  const jwt = header.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new HttpError(401, "Missing Authorization bearer token");
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Invalid or expired Supabase user token");
  return data.user;
}

function safeShop(shop: any) {
  return {
    shopId: Number(shop.shop_id),
    shop_id: Number(shop.shop_id),
    shopName: shop.shop_name,
    shop_name: shop.shop_name,
    connectionStatus: shop.connection_status,
    connection_status: shop.connection_status,
    credentialSource: shop.app_id ? "app" : "env",
    appIdPresent: Boolean(shop.app_id),
    tokenExpireIn: shop.token_expire_in,
    token_expire_in: shop.token_expire_in,
    authExpiresAt: shop.auth_expires_at,
    auth_expires_at: shop.auth_expires_at,
    updatedAt: shop.updated_at,
    updated_at: shop.updated_at,
    tokenExpired: shop.token_expire_in ? new Date(shop.token_expire_in).getTime() <= Date.now() : true,
    token_expired: shop.token_expire_in ? new Date(shop.token_expire_in).getTime() <= Date.now() : true,
    syncReady: Boolean(shop.access_token && shop.refresh_token),
    sync_ready: Boolean(shop.access_token && shop.refresh_token)
  };
}

async function listShops(userId: string) {
  const { data, error } = await supabase
    .from("shopee_shops")
    .select("shop_id,shop_name,connection_status,app_id,token_expire_in,auth_expires_at,updated_at,access_token,refresh_token")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(safeShop);
}

async function loadShop(userId: string, shopId: number): Promise<ShopRow> {
  const { data, error } = await supabase
    .from("shopee_shops")
    .select("*")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(403, `Shop ${shopId} is not linked to this user`);
  return data as ShopRow;
}

async function assertSyncPermission(userId: string, accountId?: string | null) {
  if (!accountId) throw new HttpError(403, "Shop is not associated with an account.");
  const { data, error } = await supabase
    .from("account_members")
    .select("role")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || !["owner", "admin"].includes(String(data.role))) {
    throw new HttpError(403, "Only account owners and administrators can run Shopee synchronization.");
  }
}

async function loadCredential(shop: ShopRow): Promise<ShopeeCredential> {
  if (!shop.app_id) {
    return {
      appId: null,
      partnerId: ENV_PARTNER_ID,
      partnerKey: ENV_PARTNER_KEY,
      baseUrl: cleanBaseUrl(ENV_BASE_URL, "https://partner.shopeemobile.com", PARTNER_ORIGINS),
      adsBaseUrl: cleanBaseUrl(ENV_ADS_BASE_URL, "https://openplatform.shopee.com.br", ADS_ORIGINS),
      source: "env"
    };
  }

  const { data: app, error: appError } = await supabase
    .from("shopee_apps")
    .select("id,partner_id,base_url,ads_base_url,status")
    .eq("id", shop.app_id)
    .eq("user_id", shop.user_id)
    .maybeSingle();
  if (appError) throw appError;
  if (!app) throw new Error("Shopee app linked to this shop was not found");
  if (app.status !== "active") throw new Error("Shopee app linked to this shop is inactive");

  const { data: secret, error: secretError } = await supabase
    .from("shopee_app_secrets")
    .select("partner_key")
    .eq("app_id", shop.app_id)
    .maybeSingle();
  if (secretError) throw secretError;
  if (!secret?.partner_key) throw new Error("Partner Key is missing for this Shopee app");

  return {
    appId: app.id,
    partnerId: Number(app.partner_id),
    partnerKey: String(secret.partner_key),
    baseUrl: cleanBaseUrl(app.base_url, ENV_BASE_URL, PARTNER_ORIGINS),
    adsBaseUrl: cleanBaseUrl(app.ads_base_url, ENV_ADS_BASE_URL, ADS_ORIGINS),
    source: "app"
  };
}

async function refreshAccessToken(shop: ShopRow, credential: ShopeeCredential): Promise<string> {
  const expireDate = shop.token_expire_in ? new Date(shop.token_expire_in) : new Date(0);
  const notExpired = shop.access_token && Date.now() < expireDate.getTime() - 5 * 60 * 1000;
  if (notExpired) return String(shop.access_token);
  if (!shop.refresh_token) throw new Error("Missing Shopee refresh token for shop");

  const data = await shopeeRequest<any>({
    method: "POST",
    path: "/api/v2/auth/access_token/get",
    baseUrl: credential.baseUrl,
    requiresAuth: false,
    credential,
    payload: { refresh_token: shop.refresh_token, shop_id: Number(shop.shop_id), partner_id: credential.partnerId }
  });
  const response = data.response ?? data;
  const accessToken = response.access_token ?? "";
  const refreshToken = response.refresh_token ?? "";
  const expireIn = Number(response.expire_in ?? 0);
  if (!accessToken || !refreshToken || !expireIn) throw new Error("Invalid Shopee refresh response");

  const expireIso = new Date(Date.now() + expireIn * 1000).toISOString();
  const { error } = await supabase
    .from("shopee_shops")
    .update({ access_token: accessToken, refresh_token: refreshToken, token_expire_in: expireIso, auth_expires_at: expireIso, updated_at: nowIso() })
    .eq("id", shop.id)
    .eq("user_id", shop.user_id);
  if (error) throw error;

  shop.access_token = accessToken;
  shop.refresh_token = refreshToken;
  shop.token_expire_in = expireIso;
  shop.auth_expires_at = expireIso;
  return accessToken;
}

async function logSync(shop: ShopRow | null, module: string, status: string, message: string) {
  try {
    await supabase.from("sync_log").insert({
      user_id: shop?.user_id ?? null,
      account_id: shop?.account_id ?? null,
      module,
      status,
      message,
      created_at: nowIso()
    });
  } catch (_) {}
}

function stateKey(shop: ShopRow, key: string) {
  return `${Number(shop.shop_id)}:${key}`;
}

async function getSyncState(shop: ShopRow, key: string) {
  const { data, error } = await supabase
    .from("sync_state")
    .select("value")
    .eq("key", stateKey(shop, key))
    .maybeSingle();
  if (error) throw error;
  return data?.value ? String(data.value) : null;
}

async function setSyncState(shop: ShopRow, key: string, value: string | number) {
  const { error } = await supabase
    .from("sync_state")
    .upsert({ key: stateKey(shop, key), value: String(value), updated_at: nowIso(), user_id: shop.user_id, account_id: shop.account_id ?? null }, { onConflict: "key" });
  if (error) throw error;
}

async function upsertBatches(table: string, rows: Record<string, unknown>[], onConflict: string) {
  let total = 0;
  for (const batch of chunk(rows, 500)) {
    if (!batch.length) continue;
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw error;
    total += batch.length;
  }
  return total;
}

async function getAllItemIds(shop: ShopRow, accessToken: string, credential: ShopeeCredential, statuses: string[]) {
  const ids: number[] = [];
  for (const status of statuses) {
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      try {
        const data = await shopeeRequest<any>({
          method: "GET",
          path: "/api/v2/product/get_item_list",
          accessToken,
          shopId: String(shop.shop_id),
          credential,
          params: { offset, page_size: 100, item_status: status }
        });
        const response = data.response ?? {};
        ids.push(...normalizeArray(response.item).map((item: any) => Number(item.item_id)).filter(Boolean));
        hasMore = Boolean(response.has_next_page);
        offset = Number(response.next ?? offset + 100);
      } catch (error) {
        if (status === "NORMAL") throw error;
        await logSync(shop, "products", "WARNING", `item_status=${status} ignored: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
    }
  }
  return [...new Set(ids)].sort((a, b) => a - b);
}

async function getItemsBaseInfo(shop: ShopRow, accessToken: string, credential: ShopeeCredential, itemIds: number[]) {
  const rows: Record<string, unknown>[] = [];
  for (const batch of chunk(itemIds, 50)) {
    const data = await shopeeRequest<any>({
      method: "GET",
      path: "/api/v2/product/get_item_base_info",
      accessToken,
      shopId: String(shop.shop_id),
      credential,
      params: { item_id_list: batch.join(",") }
    });
    rows.push(...normalizeArray(data.response?.item_list));
  }
  return rows;
}

async function getItemsExtraInfo(shop: ShopRow, accessToken: string, credential: ShopeeCredential, itemIds: number[]) {
  const map = new Map<number, Record<string, unknown>>();
  for (const batch of chunk(itemIds, 50)) {
    const data = await shopeeRequest<any>({
      method: "GET",
      path: "/api/v2/product/get_item_extra_info",
      accessToken,
      shopId: String(shop.shop_id),
      credential,
      params: { item_id_list: batch.join(",") }
    });
    for (const item of normalizeArray(data.response?.item_list)) {
      const id = Number(item.item_id ?? 0);
      if (id) map.set(id, item);
    }
  }
  return map;
}

function buildProductRecords(shop: ShopRow, baseItems: Record<string, unknown>[], extraInfo: Map<number, Record<string, unknown>>) {
  return baseItems.flatMap((item) => {
    const itemId = Number(item.item_id ?? 0);
    if (!itemId) return [];
    const extra = extraInfo.get(itemId) ?? {};
    const dimension = (item.dimension as Record<string, unknown> | undefined) ?? {};
    const image = (item.image as Record<string, unknown> | undefined) ?? {};
    const imageUrlList = Array.isArray(image.image_url_list) ? image.image_url_list as unknown[] : [];
    const priceInfo = Array.isArray(item.price_info) ? item.price_info[0] : item.price_info;
    const price = (priceInfo as Record<string, unknown> | undefined) ?? {};
    const originalPrice = asNumber(price.original_price ?? item.original_price ?? item.price_before_discount, 0);
    const currentPrice = asNumber(price.current_price ?? item.current_price ?? item.price, originalPrice);
    const normalizedOriginalPrice = originalPrice || currentPrice;
    const normalizedCurrentPrice = currentPrice || originalPrice;
    const discountAmount = Math.max(normalizedOriginalPrice - normalizedCurrentPrice, 0);

    return [{
      shop_id: Number(shop.shop_id),
      item_id: itemId,
      item_name: item.item_name ?? null,
      item_sku: item.item_sku ?? null,
      item_status: item.item_status ?? null,
      category_id: item.category_id ?? null,
      has_model: Boolean(item.has_model),
      weight_g: asNumber(item.weight, 0),
      width_cm: asNumber(dimension.package_width, 0),
      height_cm: asNumber(dimension.package_height, 0),
      length_cm: asNumber(dimension.package_length, 0),
      image_url: imageUrlList[0] ?? null,
      original_price: normalizedOriginalPrice || 0,
      current_price: normalizedCurrentPrice || 0,
      is_on_promotion: discountAmount > 0,
      discount_amount: discountAmount,
      discount_percent: normalizedOriginalPrice > 0 ? Number(((discountAmount / normalizedOriginalPrice) * 100).toFixed(2)) : 0,
      views: asNumber(extra.views, 0),
      sales: asNumber(extra.sales ?? extra.historical_sold ?? extra.sold, 0),
      likes: asNumber(extra.likes, 0),
      rating_star: asNumber(extra.rating_star, 0),
      rating_count: asNumber(extra.comment_count, 0),
      updated_at: unixToIso(item.update_time),
      synced_at: nowIso(),
      images_json: imageUrlList,
      video_info_json: item.video_info ?? [],
      attributes_json: item.attribute_list ?? []
    }];
  });
}

async function syncProducts(shop: ShopRow, credential: ShopeeCredential, statuses: string[]) {
  await logSync(shop, "products", "STARTED", `Product sync started shop=${shop.shop_id} source=${credential.source}`);
  const accessToken = await refreshAccessToken(shop, credential);
  const itemIds = await getAllItemIds(shop, accessToken, credential, statuses);
  const rows = buildProductRecords(shop, await getItemsBaseInfo(shop, accessToken, credential, itemIds), await getItemsExtraInfo(shop, accessToken, credential, itemIds));
  const upserted = await upsertBatches("shopee_products", rows, "shop_id,item_id");
  await logSync(shop, "products", "SUCCESS", `${upserted} products upserted shop=${shop.shop_id}`);
  return { itemIds: itemIds.length, productsUpserted: upserted, statuses };
}

async function syncVariations(shop: ShopRow, credential: ShopeeCredential) {
  await logSync(shop, "variations", "STARTED", `Variation sync started shop=${shop.shop_id} source=${credential.source}`);
  const { data, error } = await supabase
    .from("shopee_products")
    .select("item_id")
    .eq("has_model", true)
    .eq("shop_id", Number(shop.shop_id));
  if (error) throw error;

  const accessToken = await refreshAccessToken(shop, credential);
  const rows: Record<string, unknown>[] = [];
  for (const itemId of (data ?? []).map((row: any) => Number(row.item_id)).filter(Boolean)) {
    const models = await shopeeRequest<any>({
      method: "GET",
      path: "/api/v2/product/get_model_list",
      accessToken,
      shopId: String(shop.shop_id),
      credential,
      params: { item_id: itemId }
    });
    for (const model of normalizeArray(models.response?.model)) {
      const modelId = Number(model.model_id ?? 0);
      if (!modelId) continue;
      const price = (Array.isArray(model.price_info) ? model.price_info[0] : {}) ?? {};
      const stock = (Array.isArray(model.stock_info) ? model.stock_info[0] : {}) ?? {};
      const originalPrice = asNumber(price.original_price, 0);
      const currentPrice = asNumber(price.current_price, 0);
      const normalizedOriginalPrice = originalPrice || currentPrice;
      const normalizedCurrentPrice = currentPrice || originalPrice;
      const discountAmount = Math.max(normalizedOriginalPrice - normalizedCurrentPrice, 0);
      rows.push({
        shop_id: Number(shop.shop_id),
        model_id: modelId,
        item_id: itemId,
        model_name: model.model_name ?? null,
        model_sku: model.model_sku ?? null,
        original_price: normalizedOriginalPrice || 0,
        current_price: normalizedCurrentPrice || 0,
        is_on_promotion: discountAmount > 0,
        discount_amount: discountAmount,
        discount_percent: normalizedOriginalPrice > 0 ? Number(((discountAmount / normalizedOriginalPrice) * 100).toFixed(2)) : 0,
        stock_available: asNumber(stock.current_stock, 0),
        stock_reserved: asNumber(stock.reserved_stock, 0),
        synced_at: nowIso()
      });
    }
  }

  const upserted = await upsertBatches("shopee_variations", rows, "shop_id,model_id");
  await logSync(shop, "variations", "SUCCESS", `${upserted} variations upserted shop=${shop.shop_id}`);
  return { variationsUpserted: upserted };
}

function getOrderMonths() {
  const months: OrderMonth[] = [];
  const names = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  let current = new Date("2024-11-01T00:00:00-03:00");
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  while (current < end) {
    const next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    months.push({
      label: `${names[current.getMonth()]}/${current.getFullYear()}`,
      timeFrom: Math.floor(addHours(current, -4).getTime() / 1000),
      timeTo: Math.floor(addHours(next, 4).getTime() / 1000)
    });
    current = next;
  }
  return months;
}

async function getAllOrderSns(shop: ShopRow, accessToken: string, credential: ShopeeCredential, timeFrom: number, timeTo: number) {
  const sns: string[] = [];
  let cursor = "";
  let hasMore = true;
  while (hasMore) {
    const params: Record<string, string | number> = {
      time_range_field: "create_time",
      time_from: timeFrom,
      time_to: timeTo,
      page_size: 100,
      response_optional_fields: "order_status"
    };
    if (cursor) params.cursor = cursor;
    const data = await shopeeRequest<any>({
      method: "GET",
      path: "/api/v2/order/get_order_list",
      accessToken,
      shopId: String(shop.shop_id),
      credential,
      params
    });
    const response = data.response ?? {};
    sns.push(...normalizeArray(response.order_list).map((o: any) => String(o.order_sn ?? "")).filter(Boolean));
    hasMore = Boolean(response.has_more || response.more);
    cursor = String(response.next_cursor ?? "");
    if (hasMore && !cursor) break;
  }
  return [...new Set(sns)];
}

async function getOrderDetails(shop: ShopRow, accessToken: string, credential: ShopeeCredential, orderSns: string[]) {
  const rows: Record<string, unknown>[] = [];
  for (const batch of chunk(orderSns, 50)) {
    const data = await shopeeRequest<any>({
      method: "GET",
      path: "/api/v2/order/get_order_detail",
      accessToken,
      shopId: String(shop.shop_id),
      credential,
      params: {
        order_sn_list: batch.join(","),
        response_optional_fields: "item_list,buyer_username,recipient_address,payment_method,total_amount,buyer_total_amount,escrow_amount"
      }
    });
    rows.push(...normalizeArray(data.response?.order_list));
  }
  return rows;
}

function buildOrderRecords(shop: ShopRow, orderDetails: Record<string, unknown>[]) {
  const orderRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];
  for (const order of orderDetails) {
    const orderSn = String(order.order_sn ?? "");
    if (!orderSn) continue;
    const items = Array.isArray(order.item_list) ? order.item_list : [];
    const recipient = (order.recipient_address as Record<string, unknown> | undefined) ?? {};
    orderRows.push({
      shop_id: Number(shop.shop_id),
      order_sn: orderSn,
      status: order.order_status ?? null,
      buyer_username: order.buyer_username ?? null,
      total_amount: asNumber(order.total_amount ?? order.buyer_total_amount ?? order.escrow_amount, 0),
      payment_method: order.payment_method ?? null,
      items_summary: items.map((item: any) => `${String(item.item_name ?? "")} (x${asNumber(item.model_quantity_purchased, 0)})`).join(" | "),
      shipping_address: recipient.name ? `${String(recipient.name ?? "")} - ${String(recipient.city ?? "")}, ${String(recipient.state ?? "")}`.replace(/^[\s,-]+|[\s,-]+$/g, "") : "",
      created_at: unixToIso(order.create_time),
      updated_at: unixToIso(order.update_time),
      synced_at: nowIso()
    });
    items.forEach((item: any, index: number) => {
      const itemId = asNumber(item.item_id, 0);
      const modelId = asNumber(item.model_id, 0);
      itemRows.push({
        shop_id: Number(shop.shop_id),
        line_key: `${orderSn}:${itemId}:${modelId}:${index}`,
        order_sn: orderSn,
        item_id: itemId,
        model_id: modelId,
        item_name: item.item_name ?? null,
        model_name: item.model_name ?? null,
        quantity: asNumber(item.model_quantity_purchased, 0),
        unit_price: asNumber(item.model_discounted_price ?? item.original_price ?? item.item_price, 0)
      });
    });
  }
  return { orderRows, itemRows };
}

async function syncOrderMonth(shop: ShopRow, credential: ShopeeCredential, month: OrderMonth) {
  const accessToken = await refreshAccessToken(shop, credential);
  let ordersUpserted = 0;
  let itemsUpserted = 0;
  let orderSnsFound = 0;
  for (const win of slidingWindows(month.timeFrom, month.timeTo, 15)) {
    const sns = await getAllOrderSns(shop, accessToken, credential, win.from, win.to);
    orderSnsFound += sns.length;
    if (!sns.length) continue;
    const { orderRows, itemRows } = buildOrderRecords(shop, await getOrderDetails(shop, accessToken, credential, sns));
    ordersUpserted += await upsertBatches("shopee_orders", orderRows, "shop_id,order_sn");
    itemsUpserted += await upsertBatches("shopee_order_items", itemRows, "shop_id,line_key");
  }
  return { month: month.label, orderSnsFound, ordersUpserted, itemsUpserted };
}

async function syncOrdersBatch(shop: ShopRow, credential: ShopeeCredential, maxMonths = 1) {
  await logSync(shop, "orders", "STARTED", `Order sync started shop=${shop.shop_id}`);
  const months = getOrderMonths();
  const startIndex = Math.min(Math.max(0, Number(await getSyncState(shop, "order_month_index") ?? "0")), Math.max(months.length - 1, 0));
  const results = [];
  let index = startIndex;
  for (let processed = 0; processed < Math.max(1, maxMonths) && index < months.length; processed += 1, index += 1) {
    results.push(await syncOrderMonth(shop, credential, months[index]));
  }
  const reachedEnd = index >= months.length;
  await setSyncState(shop, "order_month_index", reachedEnd ? Math.max(months.length - 1, 0) : index);
  const totals = results.reduce((acc, row) => {
    acc.orderSnsFound += Number(row.orderSnsFound || 0);
    acc.ordersUpserted += Number(row.ordersUpserted || 0);
    acc.itemsUpserted += Number(row.itemsUpserted || 0);
    return acc;
  }, { orderSnsFound: 0, ordersUpserted: 0, itemsUpserted: 0 });
  await logSync(shop, "orders", "SUCCESS", `shop=${shop.shop_id} months=${results.map((row) => row.month).join(",")} orders=${totals.ordersUpserted} items=${totals.itemsUpserted}`);
  return { startIndex, nextIndex: reachedEnd ? Math.max(months.length - 1, 0) : index, completedHistoricalBackfill: reachedEnd, months: results, ...totals };
}

async function getOrdersMissingEscrow(shop: ShopRow, statuses: string[]) {
  const { data: orders, error } = await supabase
    .from("shopee_orders")
    .select("order_sn,status,created_at")
    .eq("shop_id", Number(shop.shop_id))
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;

  const orderSns = (orders ?? []).map((row: any) => String(row.order_sn)).filter(Boolean);
  if (!orderSns.length) return [];

  const escrowSet = new Set<string>();
  for (const batch of chunk(orderSns, 500)) {
    const { data: escrowRows, error: escrowError } = await supabase
      .from("shopee_escrow")
      .select("order_sn")
      .eq("shop_id", Number(shop.shop_id))
      .in("order_sn", batch);
    if (escrowError) throw escrowError;
    (escrowRows ?? []).forEach((row: any) => escrowSet.add(String(row.order_sn)));
  }
  return orderSns.filter((orderSn) => !escrowSet.has(orderSn));
}

async function getEscrowDetail(shop: ShopRow, credential: ShopeeCredential, accessToken: string, orderSn: string) {
  const data = await shopeeRequest<any>({
    method: "GET",
    path: "/api/v2/payment/get_escrow_detail",
    accessToken,
    shopId: String(shop.shop_id),
    credential,
    params: { order_sn: orderSn },
    delayMs: 500
  });
  return data.response?.order_income ?? null;
}

async function syncEscrowStep(shop: ShopRow, credential: ShopeeCredential, batchSize = 50) {
  await logSync(shop, "escrow", "STARTED", `Escrow step started shop=${shop.shop_id}`);
  const accessToken = await refreshAccessToken(shop, credential);
  const missing = await getOrdersMissingEscrow(shop, ["COMPLETED", "SHIPPED", "TO_CONFIRM_RECEIVE"]);
  const rows: Record<string, unknown>[] = [];
  for (const orderSn of missing.slice(0, Math.max(1, batchSize))) {
    const income = await getEscrowDetail(shop, credential, accessToken, orderSn);
    if (!income) continue;
    rows.push({
      shop_id: Number(shop.shop_id),
      order_sn: orderSn,
      buyer_total_amount: asNumber(income.buyer_total_amount, 0),
      escrow_amount: asNumber(income.escrow_amount, 0),
      final_shipping_fee: asNumber(income.final_shipping_fee, 0),
      commission_fee: asNumber(income.commission_fee, 0),
      shopee_discount: asNumber(income.shopee_discount, 0),
      voucher_from_seller: asNumber(income.voucher_from_seller, 0),
      ship_rebate_from_shopee: asNumber(income.ship_rebate_from_shopee, 0),
      coin: asNumber(income.coin, 0),
      service_fee: asNumber(income.service_fee, 0),
      seller_return_refund: asNumber(income.seller_return_refund, 0),
      synced_at: nowIso()
    });
  }
  const upserted = await upsertBatches("shopee_escrow", rows, "shop_id,order_sn");
  const remaining = Math.max(missing.length - rows.length, 0);
  await logSync(shop, "escrow", "SUCCESS", `shop=${shop.shop_id} processed=${rows.length} upserted=${upserted} remaining=${remaining}`);
  return { missingBeforeStep: missing.length, processed: rows.length, upserted, remaining, completed: remaining === 0 };
}

async function syncIncomeOverview(shop: ShopRow, credential: ShopeeCredential) {
  await logSync(shop, "income_overview", "STARTED", `Income overview sync started shop=${shop.shop_id}`);
  const accessToken = await refreshAccessToken(shop, credential);
  const data = await shopeeRequest<any>({
    method: "GET",
    path: "/api/v2/payment/get_income_overview",
    accessToken,
    shopId: String(shop.shop_id),
    credential,
    delayMs: 500
  });
  const response = data.response ?? data;
  const total = response.total_income ?? {};
  const row = {
    shop_id: Number(shop.shop_id),
    snapshot_at: nowIso(),
    latest_payout_date: response.latest_payout_date ?? null,
    pending_amount: asNumber(total.pending_amount, 0),
    to_release_amount: asNumber(total.to_release_amount, 0),
    released_amount: asNumber(total.released_amount, 0),
    synced_at: nowIso()
  };
  const upserted = await upsertBatches("shopee_income_overview_snapshots", [row], "shop_id,snapshot_at");
  await logSync(shop, "income_overview", "SUCCESS", `shop=${shop.shop_id} released=${row.released_amount}`);
  return { upserted, releasedAmount: row.released_amount, toReleaseAmount: row.to_release_amount };
}

async function getCampaignIds(shop: ShopRow, accessToken: string, credential: ShopeeCredential) {
  const ids: number[] = [];
  let offset = 0;
  let hasNext = true;
  while (hasNext) {
    const data = await shopeeRequest<any>({
      method: "GET",
      path: "/api/v2/ads/get_product_level_campaign_id_list",
      baseUrl: credential.adsBaseUrl,
      accessToken,
      shopId: String(shop.shop_id),
      credential,
      params: { ad_type: "all", offset, limit: 5000 }
    });
    const response = data.response ?? {};
    const campaigns = normalizeArray(response.campaign_list);
    ids.push(...campaigns.map((row: any) => Number(row.campaign_id)).filter(Boolean));
    hasNext = Boolean(response.has_next_page);
    offset += campaigns.length || 5000;
    if (!campaigns.length) break;
  }
  return [...new Set(ids)];
}

function extractCampaignSettingRows(shop: ShopRow, campaigns: any[]) {
  return campaigns.map((campaign: any) => {
    const common = campaign.common_info ?? {};
    const autoProducts = normalizeArray(campaign.auto_product_ads_info);
    const itemIds = uniqueNumbers([
      ...normalizeArray(common.item_id_list),
      ...autoProducts.map((product: any) => product.item_id)
    ]);
    const singleItemId = itemIds.length === 1 ? itemIds[0] : null;
    const firstProduct = autoProducts.find((product: any) => Number(product.item_id) === singleItemId) ?? autoProducts[0] ?? {};
    return {
      user_id: shop.user_id,
      account_id: shop.account_id ?? null,
      shop_id: Number(shop.shop_id),
      campaign_id: Number(campaign.campaign_id),
      item_id: singleItemId,
      item_id_list: itemIds,
      ad_type: common.ad_type ?? null,
      ad_name: common.ad_name ?? null,
      campaign_placement: common.campaign_placement ?? null,
      state: common.campaign_status ?? firstProduct.status ?? null,
      product_status: firstProduct.status ?? null,
      daily_budget: asNumber(common.campaign_budget, 0),
      total_budget: asNumber(common.campaign_budget, 0),
      start_date: unixToDate(common.campaign_duration?.start_time),
      end_date: unixToDate(common.campaign_duration?.end_time),
      raw_json: campaign,
      synced_at: nowIso(),
      updated_at: nowIso()
    };
  }).filter((row) => row.campaign_id);
}

async function syncCampaignSettings(shop: ShopRow, accessToken: string, credential: ShopeeCredential, campaignIds: number[]) {
  const rows: Record<string, unknown>[] = [];
  for (const batch of chunk(campaignIds, 100)) {
    const data = await shopeeRequest<any>({
      method: "GET",
      path: "/api/v2/ads/get_product_level_campaign_setting_info",
      baseUrl: credential.adsBaseUrl,
      accessToken,
      shopId: String(shop.shop_id),
      credential,
      params: { info_type_list: "1,2,3,4", campaign_id_list: batch.join(",") }
    });
    rows.push(...extractCampaignSettingRows(shop, normalizeArray(data.response?.campaign_list)));
  }
  const upserted = await upsertBatches("shopee_ads_product_campaigns", rows, "shop_id,campaign_id");
  const campaignMap = new Map<number, Record<string, unknown>>();
  rows.forEach((row) => campaignMap.set(Number(row.campaign_id), row));
  return { upserted, campaignMap };
}

function buildPerformanceRows(shop: ShopRow, campaignMap: Map<number, Record<string, unknown>>, responseRows: any[]) {
  const rows: Record<string, unknown>[] = [];
  for (const shopRow of responseRows) {
    for (const campaign of normalizeArray(shopRow.campaign_list)) {
      const campaignId = Number(campaign.campaign_id);
      const setting = campaignMap.get(campaignId) ?? {};
      for (const metric of normalizeArray(campaign.metrics_list)) {
        const performanceDate = parseShopeeDate(metric.date);
        if (!performanceDate) continue;
        rows.push({
          user_id: shop.user_id,
          account_id: shop.account_id ?? null,
          shop_id: Number(shop.shop_id),
          campaign_id: campaignId,
          item_id: setting.item_id ?? null,
          item_id_list: setting.item_id_list ?? null,
          performance_date: performanceDate,
          ad_type: campaign.ad_type ?? setting.ad_type ?? null,
          ad_name: campaign.ad_name ?? setting.ad_name ?? null,
          campaign_placement: campaign.campaign_placement ?? setting.campaign_placement ?? null,
          impression: asNumber(metric.impression, 0),
          clicks: asNumber(metric.clicks, 0),
          ctr: asNumber(metric.ctr, 0),
          expense: asNumber(metric.expense, 0),
          broad_gmv: asNumber(metric.broad_gmv, 0),
          broad_order: asNumber(metric.broad_order, 0),
          broad_order_amount: asNumber(metric.broad_order_amount, 0),
          broad_roi: asNumber(metric.broad_roi ?? metric.broad_roas, 0),
          broad_cir: asNumber(metric.broad_cir, 0),
          cr: asNumber(metric.cr, 0),
          cpc: asNumber(metric.cpc, 0),
          direct_order: asNumber(metric.direct_order, 0),
          direct_order_amount: asNumber(metric.direct_order_amount, 0),
          direct_gmv: asNumber(metric.direct_gmv, 0),
          direct_roi: asNumber(metric.direct_roi ?? metric.direct_roas, 0),
          direct_cir: asNumber(metric.direct_cir, 0),
          direct_cr: asNumber(metric.direct_cr, 0),
          cpdc: asNumber(metric.cpdc, 0),
          raw_json: metric,
          synced_at: nowIso(),
          updated_at: nowIso()
        });
      }
    }
  }
  return rows;
}

async function syncProductAds(shop: ShopRow, credential: ShopeeCredential, options: { days?: number; start_date?: string; end_date?: string }) {
  await logSync(shop, "ads_product", "STARTED", `Product Ads sync started shop=${shop.shop_id} source=${credential.source}`);
  const accessToken = await refreshAccessToken(shop, credential);
  const campaignIds = await getCampaignIds(shop, accessToken, credential);
  if (!campaignIds.length) {
    await logSync(shop, "ads_product", "SUCCESS", "No product campaigns returned by Shopee Ads API");
    return { campaigns: 0, campaignRows: 0, dailyRows: 0, ranges: 0, credentialSource: credential.source };
  }

  const settings = await syncCampaignSettings(shop, accessToken, credential, campaignIds);
  const endDate = options.end_date ? new Date(`${options.end_date}T00:00:00`) : new Date();
  const days = Math.min(Math.max(Number(options.days ?? 30), 1), 180);
  const startDate = options.start_date ? new Date(`${options.start_date}T00:00:00`) : new Date(endDate);
  if (!options.start_date) startDate.setDate(endDate.getDate() - (days - 1));

  let dailyRows = 0;
  let rangesProcessed = 0;
  for (const range of dateRanges(startDate, endDate)) {
    rangesProcessed += 1;
    for (const batch of chunk(campaignIds, 100)) {
      const data = await shopeeRequest<any>({
        method: "GET",
        path: "/api/v2/ads/get_product_campaign_daily_performance",
        baseUrl: credential.adsBaseUrl,
        accessToken,
        shopId: String(shop.shop_id),
        credential,
        params: { start_date: range.startDate, end_date: range.endDate, campaign_id_list: batch.join(",") }
      });
      dailyRows += await upsertBatches("shopee_ads_product_campaign_daily", buildPerformanceRows(shop, settings.campaignMap, normalizeArray(data.response)), "shop_id,campaign_id,performance_date");
    }
  }

  await logSync(shop, "ads_product", "SUCCESS", `campaigns=${campaignIds.length} campaign_rows=${settings.upserted} daily_rows=${dailyRows} ranges=${rangesProcessed}`);
  return { campaigns: campaignIds.length, campaignRows: settings.upserted, dailyRows, ranges: rangesProcessed, credentialSource: credential.source };
}

async function handleAction(userId: string, body: Record<string, any>, req: Request) {
  const url = new URL(req.url);
  const action = String(body.action ?? url.searchParams.get("action") ?? "status");
  const shopId = body.shop_id ?? url.searchParams.get("shop_id");
  if (req.method === "GET" && action !== "status") {
    throw new HttpError(405, "GET is read-only and only supports the status action.");
  }

  if (action === "status" && !shopId) {
    return {
      ok: true,
      action,
      version: "2026-07-06.multi-shop-orders-financial-v2",
      shops: await listShops(userId),
      supportedActions: ["refresh-token", "sync-products", "sync-variations", "sync-catalog", "sync-product-ads", "sync-orders-step", "sync-orders-batch", "sync-escrow-step", "sync-income-overview", "sync-financial"],
      unsupportedUntilLegacyCronMigration: ["sync-ads-daily-step", "sync-ads-balance", "sync-wallet-step", "sync-returns-step"]
    };
  }

  if (!shopId) throw new Error("shop_id is required");
  const shop = await loadShop(userId, Number(shopId));
  const credential = await loadCredential(shop);

  if (action === "status") {
    return {
      ok: true,
      action,
      version: "2026-07-06.multi-shop-orders-financial-v2",
      activeShopId: Number(shop.shop_id),
      connectionStatus: shop.connection_status,
      credentialSource: credential.source,
      partnerId: credential.partnerId,
      appIdPresent: Boolean(shop.app_id),
      accessTokenPresent: Boolean(shop.access_token),
      refreshTokenPresent: Boolean(shop.refresh_token),
      tokenExpireIn: shop.token_expire_in ?? null,
      authExpiresAt: shop.auth_expires_at ?? null
    };
  }

  await assertSyncPermission(userId, shop.account_id);

  if (action === "refresh-token") {
    const accessToken = await refreshAccessToken(shop, credential);
    return { ok: true, action, activeShopId: Number(shop.shop_id), credentialSource: credential.source, accessTokenLength: accessToken.length, tokenExpireIn: shop.token_expire_in };
  }

  if (action === "sync-products") {
    const statuses = Array.isArray(body.statuses) && body.statuses.length ? body.statuses.map(String) : ["NORMAL", "UNLIST"];
    return { ok: true, action, activeShopId: Number(shop.shop_id), result: await syncProducts(shop, credential, statuses) };
  }

  if (action === "sync-variations") {
    return { ok: true, action, activeShopId: Number(shop.shop_id), result: await syncVariations(shop, credential) };
  }

  if (action === "sync-catalog") {
    const statuses = Array.isArray(body.statuses) && body.statuses.length ? body.statuses.map(String) : ["NORMAL", "UNLIST"];
    return {
      ok: true,
      action,
      activeShopId: Number(shop.shop_id),
      result: {
        products: await syncProducts(shop, credential, statuses),
        variations: await syncVariations(shop, credential)
      }
    };
  }

  if (action === "sync-product-ads") {
    return { ok: true, action, activeShopId: Number(shop.shop_id), result: await syncProductAds(shop, credential, { days: body.days, start_date: body.start_date, end_date: body.end_date }) };
  }

  if (action === "sync-orders-step") {
    return { ok: true, action, activeShopId: Number(shop.shop_id), result: await syncOrdersBatch(shop, credential, 1) };
  }

  if (action === "sync-orders-batch") {
    const months = Math.min(Math.max(Number(body.months ?? 3), 1), 6);
    return { ok: true, action, activeShopId: Number(shop.shop_id), result: await syncOrdersBatch(shop, credential, months) };
  }

  if (action === "sync-escrow-step") {
    return { ok: true, action, activeShopId: Number(shop.shop_id), result: await syncEscrowStep(shop, credential, Number(body.batch_size ?? 50)) };
  }

  if (action === "sync-income-overview") {
    return { ok: true, action, activeShopId: Number(shop.shop_id), result: await syncIncomeOverview(shop, credential) };
  }

  if (action === "sync-financial") {
    const months = Math.min(Math.max(Number(body.months ?? 1), 1), 4);
    return {
      ok: true,
      action,
      activeShopId: Number(shop.shop_id),
      result: {
        orders: await syncOrdersBatch(shop, credential, months),
        escrow: await syncEscrowStep(shop, credential, Number(body.batch_size ?? 50)),
        incomeOverview: await syncIncomeOverview(shop, credential).catch((error) => ({ skipped: true, message: error instanceof Error ? error.message : String(error) }))
      }
    };
  }

  if (["sync-ads-daily-step", "sync-ads-balance", "sync-wallet-step", "sync-returns-step"].includes(action)) {
    return {
      ok: false,
      action,
      activeShopId: Number(shop.shop_id),
      blocked: "legacy_cron_migration_required",
      message: "This action still depends on legacy aggregate tables/cron and remains blocked until the legacy shopee-sync function is migrated too."
    };
  }

  throw new Error(`Unsupported action: ${action}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let body: Record<string, any> = {};
  try {
    if (req.method !== "GET" && req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const user = await getUserFromRequest(req);
    if (req.method === "POST") body = await req.json().catch(() => ({}));
    return jsonResponse(await handleAction(user.id, body, req));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof HttpError ? error.status : 500;
    return jsonResponse({ ok: false, error: message }, status);
  }
});
