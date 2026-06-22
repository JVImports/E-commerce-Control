import { createClient } from "npm:@supabase/supabase-js@2";

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type SyncAction =
  | "status"
  | "refresh-token"
  | "sync-products"
  | "sync-variations"
  | "sync-catalog"
  | "sync-orders"
  | "sync-orders-step"
  | "sync-financial"
  | "sync-income-overview"
  | "sync-escrow-step"
  | "sync-wallet-step"
  | "sync-returns-step"
  | "sync-ads-balance"
  | "sync-ads-daily-step";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SHOPEE_PARTNER_ID = Number(Deno.env.get("SHOPEE_PARTNER_ID") ?? "0");
const SHOPEE_PARTNER_KEY = Deno.env.get("SHOPEE_PARTNER_KEY") ?? "";
const SHOPEE_BASE_URL =
  Deno.env.get("SHOPEE_BASE_URL") ?? "https://partner.shopeemobile.com";
const SHOPEE_ADS_BASE_URL =
  Deno.env.get("SHOPEE_ADS_BASE_URL") ?? "https://openplatform.shopee.com.br";
const SHOPEE_SHOP_ID = Deno.env.get("SHOPEE_SHOP_ID") ?? "";
const SHOPEE_ACCESS_TOKEN = Deno.env.get("SHOPEE_ACCESS_TOKEN") ?? "";
const SHOPEE_REFRESH_TOKEN = Deno.env.get("SHOPEE_REFRESH_TOKEN") ?? "";
const SHOPEE_TOKEN_EXPIRE_IN = Deno.env.get("SHOPEE_TOKEN_EXPIRE_IN") ?? "0";
const SHOPEE_REQUEST_DELAY_MS = Number(
  Deno.env.get("SHOPEE_REQUEST_DELAY_MS") ?? "300",
);

let lastRequestAt = 0;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Json, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function toDateOnlyIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function unixToIso(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return new Date(Number(value) * 1000).toISOString();
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function asNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function hashStringToNumber(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 2147483647;
  }
  return hash || 1;
}

function pickReturnTimestamp(row: Record<string, unknown>): number {
  return asNumber(
    row.create_time ??
      row.return_create_time ??
      row.cdate ??
      row.update_time ??
      row.due_date,
    0,
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function respectRateLimit(overrideMs?: number) {
  const delayMs = overrideMs ?? SHOPEE_REQUEST_DELAY_MS;
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < delayMs) {
    await sleep(delayMs - elapsed);
  }
  lastRequestAt = Date.now();
}

async function logSync(module: string, status: string, message: string) {
  await supabase.from("sync_log").insert({
    module,
    status,
    message,
    created_at: nowIso(),
  });
}

async function getSyncState(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("sync_state")
    .select("value")
    .eq("key", key)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.value ?? null;
}

async function setSyncState(key: string, value: string | number) {
  const row = {
    key,
    value: String(value),
    updated_at: nowIso(),
  };

  const { error } = await supabase
    .from("sync_state")
    .upsert(row, { onConflict: "key" });

  if (error) throw error;
}

async function deleteSyncState(key: string) {
  const { error } = await supabase.from("sync_state").delete().eq("key", key);
  if (error) throw error;
}

async function getLatestAdsPerformanceDate(): Promise<string | null> {
  const { data, error } = await supabase
    .from("shopee_ads_daily_performance")
    .select("performance_date")
    .order("performance_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return String(data?.performance_date ?? "") || null;
}

async function getTokenState() {
  const [shopIdState, accessTokenState, refreshTokenState, expireState] =
    await Promise.all([
      getSyncState("shop_id"),
      getSyncState("access_token"),
      getSyncState("refresh_token"),
      getSyncState("token_expire_in"),
    ]);

  return {
    shopId: shopIdState || SHOPEE_SHOP_ID,
    accessToken: accessTokenState || SHOPEE_ACCESS_TOKEN,
    refreshToken: refreshTokenState || SHOPEE_REFRESH_TOKEN,
    expireIn: expireState || SHOPEE_TOKEN_EXPIRE_IN,
  };
}

async function persistTokens(params: {
  shopId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpireIn: string;
}) {
  await Promise.all([
    setSyncState("shop_id", params.shopId),
    setSyncState("access_token", params.accessToken),
    setSyncState("refresh_token", params.refreshToken),
    setSyncState("token_expire_in", params.tokenExpireIn),
  ]);
}

async function cryptoSign(
  path: string,
  timestamp: number,
  accessToken = "",
  shopId = "",
) {
  const baseString = `${SHOPEE_PARTNER_ID}${path}${timestamp}${accessToken}${shopId}`;
  const keyData = new TextEncoder().encode(SHOPEE_PARTNER_KEY);
  const baseData = new TextEncoder().encode(baseString);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, baseData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function shopeeRequest<T>({
  method,
  path,
  params,
  payload,
  accessToken = "",
  shopId = "",
  requiresAuth = true,
  delayMs,
  baseUrl,
}: {
  method: "GET" | "POST";
  path: string;
  params?: Record<string, string | number>;
  payload?: Record<string, unknown>;
  accessToken?: string;
  shopId?: string;
  requiresAuth?: boolean;
  delayMs?: number;
  baseUrl?: string;
}): Promise<T> {
  if (!SHOPEE_PARTNER_ID || !SHOPEE_PARTNER_KEY) {
    throw new Error("Missing SHOPEE_PARTNER_ID or SHOPEE_PARTNER_KEY");
  }
  if (requiresAuth && (!accessToken || !shopId)) {
    throw new Error("Shopee authenticated request requires access token and shop id");
  }

  const maxRetries = 3;
  const baseParams = { ...(params ?? {}) };

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = await cryptoSign(
      path,
      timestamp,
      requiresAuth ? accessToken : "",
      requiresAuth ? shopId : "",
    );

    const query = new URLSearchParams({
      partner_id: String(SHOPEE_PARTNER_ID),
      timestamp: String(timestamp),
      sign,
    });

    for (const [key, value] of Object.entries(baseParams)) {
      query.set(key, String(value));
    }
    if (requiresAuth) {
      query.set("access_token", accessToken);
      query.set("shop_id", shopId);
    }

    await respectRateLimit(delayMs);

    try {
      const effectiveBaseUrl = baseUrl ?? SHOPEE_BASE_URL;
      const httpResponse = await fetch(`${effectiveBaseUrl}${path}?${query.toString()}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: payload ? JSON.stringify(payload) : undefined,
      });

      if (httpResponse.status === 429) {
        await sleep(10_000);
        continue;
      }
      if (httpResponse.status >= 500) {
        if (attempt < maxRetries) {
          await sleep(1000 * attempt);
          continue;
        }
        throw new Error(`Shopee server error ${httpResponse.status}`);
      }
      if (!httpResponse.ok) {
        throw new Error(`Shopee HTTP error ${httpResponse.status}: ${await httpResponse.text()}`);
      }

      const data = (await httpResponse.json()) as Record<string, unknown>;
      if (data.error) {
        throw new Error(
          `Shopee error code=${String(data.error)} message=${String(data.message ?? "")}`,
        );
      }
      return data as T;
    } catch (error) {
      if (attempt >= maxRetries) throw error;
      await sleep(1000 * attempt);
    }
  }

  throw new Error(`Unexpected Shopee failure on ${path}`);
}

async function refreshAccessToken(): Promise<string> {
  const state = await getTokenState();
  if (!state.refreshToken || !state.shopId) {
    throw new Error("Missing SHOPEE_REFRESH_TOKEN or SHOPEE_SHOP_ID");
  }

  const now = Math.floor(Date.now() / 1000);
  const expireEpoch = Number(state.expireIn || "0");
  if (state.accessToken && now < expireEpoch - 300) {
    return state.accessToken;
  }

  const data = await shopeeRequest<{
    response?: {
      access_token?: string;
      refresh_token?: string;
      expire_in?: number;
    };
    access_token?: string;
    refresh_token?: string;
    expire_in?: number;
  }>({
    method: "POST",
    path: "/api/v2/auth/access_token/get",
    requiresAuth: false,
    payload: {
      refresh_token: state.refreshToken,
      shop_id: Number(state.shopId),
      partner_id: SHOPEE_PARTNER_ID,
    },
  });

  const response = data.response ?? data;
  const accessToken = response.access_token ?? "";
  const refreshToken = response.refresh_token ?? "";
  const expireIn = Number(response.expire_in ?? 0);

  if (!accessToken || !refreshToken || !expireIn) {
    throw new Error(`Invalid Shopee refresh response: ${JSON.stringify(data)}`);
  }

  const tokenExpireIn = String(Math.floor(Date.now() / 1000) + expireIn);
  await persistTokens({
    shopId: state.shopId,
    accessToken,
    refreshToken,
    tokenExpireIn,
  });

  return accessToken;
}

async function getShopId(): Promise<string> {
  const { shopId } = await getTokenState();
  if (!shopId) throw new Error("Missing SHOPEE_SHOP_ID");
  return shopId;
}

async function upsertBatches(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  if (!rows.length) return 0;

  let total = 0;
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw error;
    total += batch.length;
  }
  return total;
}

async function getOrdersForEscrow(statuses: string[]) {
  const { data, error } = await supabase
    .from("shopee_orders")
    .select("order_sn,status")
    .in("status", statuses);

  if (error) throw error;

  const { data: escrowRows, error: escrowError } = await supabase
    .from("shopee_escrow")
    .select("order_sn");

  if (escrowError) throw escrowError;

  const escrowSet = new Set((escrowRows ?? []).map((row) => String(row.order_sn)));
  return (data ?? [])
    .map((row) => String(row.order_sn))
    .filter((orderSn) => orderSn && !escrowSet.has(orderSn));
}

async function getAllItemIds(): Promise<number[]> {
  const accessToken = await refreshAccessToken();
  const shopId = await getShopId();
  const ids: number[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await shopeeRequest<{
      response?: {
        item?: Array<{ item_id?: number }>;
        has_next_page?: boolean;
        next?: number;
      };
    }>({
      method: "GET",
      path: "/api/v2/product/get_item_list",
      accessToken,
      shopId,
      params: {
        offset,
        page_size: 100,
        item_status: "NORMAL",
      },
    });

    const response = data.response ?? {};
    ids.push(...(response.item ?? []).map((item) => Number(item.item_id)).filter(Boolean));
    hasMore = Boolean(response.has_next_page);
    offset = Number(response.next ?? offset + 100);
  }

  return [...new Set(ids)].sort((a, b) => a - b);
}

async function getItemsBaseInfo(itemIds: number[]) {
  const accessToken = await refreshAccessToken();
  const shopId = await getShopId();
  const rows: Record<string, unknown>[] = [];

  for (const batch of chunk(itemIds, 50)) {
    const data = await shopeeRequest<{
      response?: { item_list?: Record<string, unknown>[] };
    }>({
      method: "GET",
      path: "/api/v2/product/get_item_base_info",
      accessToken,
      shopId,
      params: { item_id_list: batch.join(",") },
    });
    rows.push(...(data.response?.item_list ?? []));
  }

  return rows;
}

async function getItemsExtraInfo(itemIds: number[]) {
  const accessToken = await refreshAccessToken();
  const shopId = await getShopId();
  const map = new Map<number, Record<string, unknown>>();

  for (const batch of chunk(itemIds, 50)) {
    const data = await shopeeRequest<{
      response?: { item_list?: Record<string, unknown>[] };
    }>({
      method: "GET",
      path: "/api/v2/product/get_item_extra_info",
      accessToken,
      shopId,
      params: { item_id_list: batch.join(",") },
    });
    for (const item of data.response?.item_list ?? []) {
      const itemId = Number(item.item_id ?? 0);
      if (itemId) map.set(itemId, item);
    }
  }

  return map;
}

function buildProductRecords(
  baseItems: Record<string, unknown>[],
  extraInfo: Map<number, Record<string, unknown>>,
) {
  return baseItems.flatMap((item) => {
    const itemId = Number(item.item_id ?? 0);
    if (!itemId) return [];

    const extra = extraInfo.get(itemId) ?? {};
    const dimension = (item.dimension as Record<string, unknown> | undefined) ?? {};
    const image = (item.image as Record<string, unknown> | undefined) ?? {};
    const imageUrlList = Array.isArray(image.image_url_list)
      ? (image.image_url_list as unknown[])
      : [];
    const priceInfo = Array.isArray(item.price_info) ? item.price_info[0] : item.price_info;
    const price = (priceInfo as Record<string, unknown> | undefined) ?? {};
    const originalPrice = asNumber(
      price.original_price ?? item.original_price ?? item.price_before_discount,
      0,
    );
    const currentPrice = asNumber(
      price.current_price ?? item.current_price ?? item.price,
      originalPrice,
    );
    const normalizedOriginalPrice = originalPrice || currentPrice;
    const normalizedCurrentPrice = currentPrice || originalPrice;
    const discountAmount = Math.max(normalizedOriginalPrice - normalizedCurrentPrice, 0);
    const discountPercent = normalizedOriginalPrice > 0
      ? Number(((discountAmount / normalizedOriginalPrice) * 100).toFixed(2))
      : 0;
    const isOnPromotion = discountAmount > 0;

    return [{
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
      is_on_promotion: isOnPromotion,
      discount_amount: discountAmount,
      discount_percent: discountPercent,
      views: asNumber(extra.views, 0),
      sales: asNumber(extra.sales ?? extra.historical_sold ?? extra.sold, 0),
      likes: asNumber(extra.likes, 0),
      rating_star: asNumber(extra.rating_star, 0),
      rating_count: asNumber(extra.comment_count, 0),
      updated_at: unixToIso(item.update_time as number | string | null | undefined),
      synced_at: nowIso(),
      images_json: imageUrlList,
      video_info_json: item.video_info ?? [],
      attributes_json: item.attribute_list ?? []
    }];
  });
}

async function syncProducts() {
  await logSync("products", "STARTED", "Edge function product sync started");
  const itemIds = await getAllItemIds();
  const baseItems = await getItemsBaseInfo(itemIds);
  const extraInfo = await getItemsExtraInfo(itemIds);
  const rows = buildProductRecords(baseItems, extraInfo);
  const upserted = await upsertBatches("shopee_products", rows, "item_id");
  await logSync("products", "SUCCESS", `${upserted} products upserted`);
  return { itemIds: itemIds.length, productsUpserted: upserted };
}

async function getProductIdsWithModel(): Promise<number[]> {
  const { data, error } = await supabase
    .from("shopee_products")
    .select("item_id")
    .eq("has_model", true);

  if (error) throw error;
  return (data ?? []).map((row) => Number(row.item_id)).filter(Boolean);
}

async function getModelList(itemId: number) {
  const accessToken = await refreshAccessToken();
  const shopId = await getShopId();
  const data = await shopeeRequest<{
    response?: { model?: Record<string, unknown>[] };
  }>({
    method: "GET",
    path: "/api/v2/product/get_model_list",
    accessToken,
    shopId,
    params: { item_id: itemId },
  });
  return data.response?.model ?? [];
}

function getOrderMonths() {
  const months: Array<{ label: string; timeFrom: number; timeTo: number }> = [];
  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Marco",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  let current = new Date("2024-11-01T00:00:00-03:00");
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  while (current < end) {
    const nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    months.push({
      label: `${monthNames[current.getMonth()]}/${current.getFullYear()}`,
      timeFrom: Math.floor(addHours(current, -4).getTime() / 1000),
      timeTo: Math.floor(addHours(nextMonth, 4).getTime() / 1000),
    });
    current = nextMonth;
  }

  return months;
}

function slidingWindows(timeFrom: number, timeTo: number, days: number) {
  const windows: Array<{ from: number; to: number }> = [];
  const windowSeconds = days * 24 * 60 * 60;
  let start = timeFrom;

  while (start < timeTo) {
    const end = Math.min(start + windowSeconds, timeTo);
    windows.push({ from: start, to: end });
    start = end;
  }

  return windows;
}

// Keep the code simple for other parts
function formatAdsDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function getAdsDateRanges() {
  const ranges: Array<{ startDate: string; endDate: string; label: string }> = [];
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - 180);

  let current = new Date(start);
  while (current < end) {
    const rangeEnd = new Date(current);
    rangeEnd.setDate(rangeEnd.getDate() + 29);
    const boundedEnd = rangeEnd < end ? rangeEnd : end;
    if (toDateOnlyIso(current) === toDateOnlyIso(boundedEnd)) {
      break;
    }
    ranges.push({
      startDate: formatAdsDate(current),
      endDate: formatAdsDate(boundedEnd),
      label: `${toDateOnlyIso(current)}..${toDateOnlyIso(boundedEnd)}`,
    });
    current = new Date(boundedEnd);
    current.setDate(current.getDate() + 1);
  }

  return ranges;
}

async function getAllOrderSns(timeFrom: number, timeTo: number) {
  const accessToken = await refreshAccessToken();
  const shopId = await getShopId();
  const sns: string[] = [];
  let cursor = "";
  let hasMore = true;

  while (hasMore) {
    const params: Record<string, string | number> = {
      time_range_field: "create_time",
      time_from: timeFrom,
      time_to: timeTo,
      page_size: 100,
      response_optional_fields: "order_status",
    };
    if (cursor) params.cursor = cursor;

    const data = await shopeeRequest<{
      response?: {
        order_list?: Array<{ order_sn?: string }>;
        has_more?: boolean;
        more?: boolean;
        next_cursor?: string;
      };
    }>({
      method: "GET",
      path: "/api/v2/order/get_order_list",
      accessToken,
      shopId,
      params,
    });

    const response = data.response ?? {};
    sns.push(
      ...(response.order_list ?? [])
        .map((order) => String(order.order_sn ?? ""))
        .filter(Boolean),
    );

    hasMore = Boolean(response.has_more || response.more);
    cursor = String(response.next_cursor ?? "");
    if (hasMore && !cursor) break;
  }

  return [...new Set(sns)];
}

async function getOrderDetails(orderSns: string[]) {
  const accessToken = await refreshAccessToken();
  const shopId = await getShopId();
  const rows: Record<string, unknown>[] = [];

  for (const batch of chunk(orderSns, 50)) {
    const data = await shopeeRequest<{
      response?: { order_list?: Record<string, unknown>[] };
    }>({
      method: "GET",
      path: "/api/v2/order/get_order_detail",
      accessToken,
      shopId,
      params: {
        order_sn_list: batch.join(","),
        response_optional_fields:
          "item_list,buyer_username,recipient_address,payment_method,total_amount",
      },
    });
    rows.push(...(data.response?.order_list ?? []));
  }

  return rows;
}

function buildOrderRecords(orderDetails: Record<string, unknown>[]) {
  const orderRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];

  for (const order of orderDetails) {
    const orderSn = String(order.order_sn ?? "");
    if (!orderSn) continue;

    const items = Array.isArray(order.item_list) ? order.item_list : [];
    const itemsSummary = items
      .map((item) => {
        const row = item as Record<string, unknown>;
        return `${String(row.item_name ?? "")} (x${asNumber(row.model_quantity_purchased, 0)})`;
      })
      .join(" | ");

    const recipient = (order.recipient_address as Record<string, unknown> | undefined) ?? {};
    const shippingAddress = recipient.name
      ? `${String(recipient.name ?? "")} - ${String(recipient.city ?? "")}, ${String(recipient.state ?? "")}`
      : "";

    orderRows.push({
      order_sn: orderSn,
      status: order.order_status ?? null,
      buyer_username: order.buyer_username ?? null,
      total_amount: asNumber(order.total_amount ?? order.buyer_total_amount ?? order.escrow_amount, 0),
      payment_method: order.payment_method ?? null,
      items_summary: itemsSummary,
      shipping_address: shippingAddress.replace(/^[\s,-]+|[\s,-]+$/g, ""),
      created_at: unixToIso(order.create_time as number | string | null | undefined),
      updated_at: unixToIso(order.update_time as number | string | null | undefined),
      synced_at: nowIso(),
    });

    items.forEach((item, index) => {
      const row = item as Record<string, unknown>;
      const itemId = asNumber(row.item_id, 0);
      const modelId = asNumber(row.model_id, 0);
      const quantity = asNumber(row.model_quantity_purchased, 0);
      const unitPrice = asNumber(
        row.model_discounted_price ?? row.original_price ?? row.item_price,
        0,
      );
      itemRows.push({
        line_key: `${orderSn}:${itemId}:${modelId}:${index}`,
        order_sn: orderSn,
        item_id: itemId,
        model_id: modelId,
        item_name: row.item_name ?? null,
        model_name: row.model_name ?? null,
        quantity,
        unit_price: unitPrice,
      });
    });
  }

  return { orderRows, itemRows };
}

async function syncOrderMonth(month: { label: string; timeFrom: number; timeTo: number }) {
  let ordersUpserted = 0;
  let itemsUpserted = 0;

  for (const window of slidingWindows(month.timeFrom, month.timeTo, 15)) {
    const sns = await getAllOrderSns(window.from, window.to);
    if (!sns.length) continue;
    const details = await getOrderDetails(sns);
    const { orderRows, itemRows } = buildOrderRecords(details);
    ordersUpserted += await upsertBatches("shopee_orders", orderRows, "order_sn");
    itemsUpserted += await upsertBatches("shopee_order_items", itemRows, "line_key");
  }

  return { ordersUpserted, itemsUpserted };
}

async function syncOrders(monthLabel?: string, oneMonthOnly = false) {
  await logSync("orders", "STARTED", "Edge function order sync started");
  const months = getOrderMonths();

  if (monthLabel) {
    const target = months.find((month) => month.label === monthLabel);
    if (!target) throw new Error(`Month '${monthLabel}' not found`);
    const result = await syncOrderMonth(target);
    await logSync(
      "orders",
      "SUCCESS",
      `months=1 orders=${result.ordersUpserted} items=${result.itemsUpserted}`,
    );
    return {
      monthsProcessed: 1,
      ordersUpserted: result.ordersUpserted,
      itemsUpserted: result.itemsUpserted,
    };
  }

  const startIndex = Number(await getSyncState("order_month_index") ?? "0");
  let monthsProcessed = 0;
  let ordersUpserted = 0;
  let itemsUpserted = 0;

  for (let index = startIndex; index < months.length; index += 1) {
    const result = await syncOrderMonth(months[index]);
    monthsProcessed += 1;
    ordersUpserted += result.ordersUpserted;
    itemsUpserted += result.itemsUpserted;
    await setSyncState("order_month_index", index + 1);
    if (oneMonthOnly) {
      await logSync(
        "orders",
        "SUCCESS",
        `step month=${months[index].label} orders=${ordersUpserted} items=${itemsUpserted}`,
      );
      return {
        monthsProcessed,
        ordersUpserted,
        itemsUpserted,
        nextMonthIndex: index + 1,
        nextMonthLabel: months[index + 1]?.label ?? null,
        completed: index + 1 >= months.length,
      };
    }
  }

  await deleteSyncState("order_month_index");
  await logSync(
    "orders",
    "SUCCESS",
    `months=${monthsProcessed} orders=${ordersUpserted} items=${itemsUpserted}`,
  );

  return {
    monthsProcessed,
    ordersUpserted,
    itemsUpserted,
    completed: true,
    nextMonthIndex: null,
    nextMonthLabel: null,
  };
}

async function getEscrowDetail(orderSn: string) {
  const accessToken = await refreshAccessToken();
  const shopId = await getShopId();
  const data = await shopeeRequest<{
    response?: { order_income?: Record<string, unknown> };
  }>({
    method: "GET",
    path: "/api/v2/payment/get_escrow_detail",
    accessToken,
    shopId,
    params: { order_sn: orderSn },
    delayMs: 500,
  });
  return data.response?.order_income ?? null;
}

async function getIncomeOverview() {
  const accessToken = await refreshAccessToken();
  const shopId = await getShopId();
  const data = await shopeeRequest<{
    response?: {
      latest_payout_date?: string;
      total_income?: Record<string, unknown>;
    };
    latest_payout_date?: string;
    total_income?: Record<string, unknown>;
  }>({
    method: "GET",
    path: "/api/v2/payment/get_income_overview",
    accessToken,
    shopId,
    delayMs: 500,
  });

  const response = data.response ?? data;
  const totalIncome = response.total_income ?? {};
  return {
    snapshot_at: nowIso(),
    latest_payout_date: response.latest_payout_date ?? null,
    pending_amount: asNumber(totalIncome.pending_amount, 0),
    to_release_amount: asNumber(totalIncome.to_release_amount, 0),
    released_amount: asNumber(totalIncome.released_amount, 0),
    synced_at: nowIso(),
  };
}

async function syncIncomeOverview() {
  await logSync("income_overview", "STARTED", "Edge function income overview sync started");
  const row = await getIncomeOverview();
  const upserted = await upsertBatches(
    "shopee_income_overview_snapshots",
    [row],
    "snapshot_at",
  );
  await logSync(
    "income_overview",
    "SUCCESS",
    `upserted=${upserted} pending=${row.pending_amount} released=${row.released_amount} wallet_ready=${row.to_release_amount}`,
  );
  return row;
}

async function syncEscrow() {
  await logSync("escrow", "STARTED", "Edge function escrow sync started");
  const orderSns = await getOrdersForEscrow([
    "COMPLETED",
    "SHIPPED",
    "TO_CONFIRM_RECEIVE",
  ]);

  const rows: Record<string, unknown>[] = [];
  for (const orderSn of orderSns) {
    const income = await getEscrowDetail(orderSn);
    if (!income) continue;
    rows.push({
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
      synced_at: nowIso(),
    });
  }

  const upserted = await upsertBatches("shopee_escrow", rows, "order_sn");
  await logSync("escrow", "SUCCESS", `${upserted} escrow records upserted`);
  return upserted;
}

async function syncEscrowStep(batchSize = 50) {
  await logSync("escrow", "STARTED", "Edge function escrow step started");
  const allOrderSns = await getOrdersForEscrow([
    "COMPLETED",
    "SHIPPED",
    "TO_CONFIRM_RECEIVE",
  ]);
  const currentIndex = Number(await getSyncState("escrow_index") ?? "0");
  const targetOrderSns = allOrderSns.slice(currentIndex, currentIndex + batchSize);

  const rows: Record<string, unknown>[] = [];
  for (const orderSn of targetOrderSns) {
    const income = await getEscrowDetail(orderSn);
    if (!income) continue;
    rows.push({
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
      synced_at: nowIso(),
    });
  }

  const upserted = await upsertBatches("shopee_escrow", rows, "order_sn");
  const nextIndex = currentIndex + targetOrderSns.length;
  const completed = nextIndex >= allOrderSns.length;

  if (completed) {
    await deleteSyncState("escrow_index");
  } else {
    await setSyncState("escrow_index", nextIndex);
  }

  await logSync(
    "escrow",
    "SUCCESS",
    `step processed=${targetOrderSns.length} upserted=${upserted} completed=${completed}`,
  );

  return {
    processed: targetOrderSns.length,
    upserted,
    nextIndex: completed ? null : nextIndex,
    remaining: Math.max(allOrderSns.length - nextIndex, 0),
    completed,
  };
}

async function getWalletTransactions(timeFrom: number, timeTo: number) {
  const accessToken = await refreshAccessToken();
  const shopId = await getShopId();
  const rows: Record<string, unknown>[] = [];
  const pageSize = 100;
  let pageNo = 0;
  let hasMore = true;

  const tryUnfilteredFallback = async () => {
    try {
      const fallback = await shopeeRequest<{
        response?: {
          transaction_list?: Record<string, unknown>[];
          has_more?: boolean;
          more?: boolean;
        };
      }>({
        method: "GET",
        path: "/api/v2/payment/get_wallet_transaction_list",
        accessToken,
        shopId,
        params: {
          page_size: pageSize,
          page_no: 0,
        },
      });
      return fallback.response?.transaction_list ?? [];
    } catch (error) {
      return [];
    }
  };

  while (hasMore) {
    let data;
    try {
      data = await shopeeRequest<{
        response?: {
          transaction_list?: Record<string, unknown>[];
          has_more?: boolean;
          more?: boolean;
        };
      }>({
        method: "GET",
        path: "/api/v2/payment/get_wallet_transaction_list",
        accessToken,
        shopId,
        params: {
          page_size: pageSize,
          page_no: pageNo,
          create_time_from: timeFrom,
          create_time_to: timeTo,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("error_not_found")) {
        return pageNo === 0 ? await tryUnfilteredFallback() : rows;
      }
      throw error;
    }

    const response = data.response ?? {};
    const pageRows = response.transaction_list ?? [];
    rows.push(...pageRows);
    if (!pageRows.length && pageNo === 0) {
      return await tryUnfilteredFallback();
    }
    hasMore = Boolean(response.has_more || response.more);
    pageNo += pageSize;
  }

  return rows;
}

async function syncWallet() {
  await logSync("wallet", "STARTED", "Edge function wallet sync started");
  let total = 0;

  for (const month of getOrderMonths()) {
    for (const window of slidingWindows(month.timeFrom, month.timeTo, 7)) {
      const transactions = await getWalletTransactions(window.from, window.to);
      const rows = transactions
        .map((tx) => {
          const transactionId = asNumber(tx.transaction_id, 0);
          if (!transactionId) return null;
          return {
            transaction_id: transactionId,
            transaction_type: tx.transaction_type ?? null,
            amount: asNumber(tx.amount, 0),
            status: tx.status ?? null,
            order_sn: tx.order_sn ?? null,
            description: tx.description ?? null,
            current_balance: asNumber(tx.current_balance, 0),
            money_flow: tx.money_flow ?? null,
            withdrawal_type: tx.withdrawal_type ?? null,
            withdrawal_id: asNumber(tx.withdrawal_id, 0) || null,
            root_withdrawal_id: asNumber(tx.root_withdrawal_id, 0) || null,
            transaction_tab_type: tx.transaction_tab_type ?? null,
            created_at: unixToIso(tx.create_time as number | string | null | undefined),
            synced_at: nowIso(),
          };
        })
        .filter(Boolean) as Record<string, unknown>[];

      total += await upsertBatches(
        "shopee_wallet_transactions",
        rows,
        "transaction_id",
      );
    }
  }

  await logSync("wallet", "SUCCESS", `${total} wallet transactions upserted`);
  return total;
}

async function syncWalletStep() {
  await logSync("wallet", "STARTED", "Edge function wallet step started");
  const months = getOrderMonths();
  const currentIndex = Number(await getSyncState("wallet_month_index") ?? "0");
  const month = months[currentIndex];

  if (!month) {
    await deleteSyncState("wallet_month_index").catch(() => undefined);
    await logSync("wallet", "SUCCESS", "wallet step already complete");
    return {
      monthsProcessed: 0,
      upserted: 0,
      nextMonthLabel: null,
      completed: true,
    };
  }

  let upserted = 0;
  for (const window of slidingWindows(month.timeFrom, month.timeTo, 7)) {
    const transactions = await getWalletTransactions(window.from, window.to);
    const rows = transactions
      .map((tx) => {
        const transactionId = asNumber(tx.transaction_id, 0);
        if (!transactionId) return null;
        return {
          transaction_id: transactionId,
          transaction_type: tx.transaction_type ?? null,
          amount: asNumber(tx.amount, 0),
          status: tx.status ?? null,
          order_sn: tx.order_sn ?? null,
          description: tx.description ?? null,
          current_balance: asNumber(tx.current_balance, 0),
          money_flow: tx.money_flow ?? null,
          withdrawal_type: tx.withdrawal_type ?? null,
          withdrawal_id: asNumber(tx.withdrawal_id, 0) || null,
          root_withdrawal_id: asNumber(tx.root_withdrawal_id, 0) || null,
          transaction_tab_type: tx.transaction_tab_type ?? null,
          created_at: unixToIso(tx.create_time as number | string | null | undefined),
          synced_at: nowIso(),
        };
      })
      .filter(Boolean) as Record<string, unknown>[];

    upserted += await upsertBatches(
      "shopee_wallet_transactions",
      rows,
      "transaction_id",
    );
  }

  const nextIndex = currentIndex + 1;
  const completed = nextIndex >= months.length;
  if (completed) {
    await deleteSyncState("wallet_month_index");
  } else {
    await setSyncState("wallet_month_index", nextIndex);
  }

  await logSync(
    "wallet",
    "SUCCESS",
    `step month=${month.label} upserted=${upserted} completed=${completed}`,
  );

  return {
    monthsProcessed: 1,
    upserted,
    nextMonthLabel: completed ? null : months[nextIndex].label,
    completed,
  };
}

type ReturnRef = {
  returnId: number;
  returnSn: string;
  payload: Record<string, unknown>;
};

async function getReturnList(_timeFrom?: number, _timeTo?: number) {
  const accessToken = await refreshAccessToken();
  const shopId = await getShopId();
  const returns: ReturnRef[] = [];
  let pageNo = 1;
  let hasMore = true;

  while (hasMore) {
    let data;
    try {
      data = await shopeeRequest<{
        response?: {
          return?: Array<{ return_id?: number; return_sn?: string; create_time?: number }>;
          returns?: Array<{ return_id?: number; return_sn?: string; create_time?: number }>;
          return_list?: Array<{ return_id?: number; return_sn?: string; create_time?: number }>;
          has_more?: boolean;
          more?: boolean;
        };
        return?: Array<{ return_id?: number; return_sn?: string; create_time?: number }>;
        returns?: Array<{ return_id?: number; return_sn?: string; create_time?: number }>;
      }>({
        method: "GET",
        path: "/api/v2/returns/get_return_list",
        accessToken,
        shopId,
        params: {
          page_size: 100,
          page_no: pageNo,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("error_not_found")) {
        return returns;
      }
      throw error;
    }

    const response = data.response ?? {};
    const rawReturns = [
      ...(response.return ?? []),
      ...(response.returns ?? []),
      ...(response.return_list ?? []),
      ...(data.return ?? []),
      ...(data.returns ?? []),
    ] as Record<string, unknown>[];

    const pageRefs = rawReturns
      .map((row) => ({
        returnId: Number(row.return_id ?? 0),
        returnSn: String(row.return_sn ?? ""),
        payload: row,
      }))
      .filter((row) => row.returnId || row.returnSn);
    returns.push(...pageRefs);
    await logSync(
      "returns",
      "DEBUG",
      `list page=${pageNo} raw=${rawReturns.length} refs=${pageRefs.length}`,
    );
    hasMore = Boolean(response.has_more || response.more);
    pageNo += 1;
  }

  const dedup = new Map<string, ReturnRef>();
  for (const row of returns) {
    dedup.set(row.returnSn || String(row.returnId), row);
  }
  return [...dedup.values()];
}

function buildReturnRows(details: Record<string, unknown>[]) {
  return details
    .map((detail) => {
      const returnSn = String(detail.return_sn ?? "");
      const returnId = asNumber(detail.return_id, returnSn ? hashStringToNumber(returnSn) : 0);
      if (!returnId) return null;
      return {
        return_id: returnId,
        order_sn: detail.order_sn ?? null,
        status: detail.status ?? null,
        reason: detail.reason ?? null,
        refund_amount: asNumber(detail.refund_amount, 0),
        return_type: detail.return_type ?? null,
        buyer_username: detail.buyer_user_name ?? detail.user ?? null,
        created_at: unixToIso(
          detail.create_time as number | string | null | undefined,
        ),
        updated_at: unixToIso(
          detail.update_time as number | string | null | undefined,
        ),
        synced_at: nowIso(),
      };
    })
    .filter(Boolean) as Record<string, unknown>[];
}

async function getReturnDetails(returnRefs: ReturnRef[]) {
  if (!returnRefs.length) return [];
  const accessToken = await refreshAccessToken();
  const shopId = await getShopId();
  const details: Record<string, unknown>[] = [];

  for (const ref of returnRefs) {
    if (!ref.returnSn) continue;

    try {
      const data = await shopeeRequest<{
        response?: {
          return?: Record<string, unknown>;
          returns?: Record<string, unknown>[];
          return_info?: Record<string, unknown>;
          return_list?: Record<string, unknown>[];
        };
        return?: Record<string, unknown>;
        returns?: Record<string, unknown>[];
      }>({
        method: "GET",
        path: "/api/v2/returns/get_return_detail",
        accessToken,
        shopId,
        params: { return_sn: ref.returnSn },
      });
      const candidates = [
        data.response?.return,
        data.response?.return_info,
        ...(data.response?.returns ?? []),
        ...(data.response?.return_list ?? []),
        data.return,
        ...(data.returns ?? []),
      ].filter(Boolean) as Record<string, unknown>[];

      const detail = candidates.find((item) => String(item.return_sn ?? "") === ref.returnSn) ??
        candidates[0];

      if (detail) {
        if (!detail.return_sn) detail.return_sn = ref.returnSn;
        if (!detail.return_id && ref.returnId) detail.return_id = ref.returnId;
        details.push(detail);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("error_not_found")) {
        continue;
      }
      throw error;
    }
  }

  return details;
}

async function syncReturns() {
  await logSync("returns", "STARTED", "Edge function returns sync started");
  const returnRefs = await getReturnList();
  await logSync("returns", "DEBUG", `full sync refs=${returnRefs.length}`);

  let total = 0;
  for (const batch of chunk(returnRefs, 50)) {
    const details = await getReturnDetails(batch);
    const sourceRows = details.length
      ? details
      : batch.map((item) => item.payload);
    const rows = buildReturnRows(sourceRows);
    await logSync(
      "returns",
      "DEBUG",
      `full sync batch=${batch.length} details=${details.length} source=${sourceRows.length} rows=${rows.length}`,
    );
    total += await upsertBatches("shopee_returns", rows, "return_id");
  }

  await logSync("returns", "SUCCESS", `${total} return records upserted`);
  return total;
}

async function syncReturnsStep() {
  await logSync("returns", "STARTED", "Edge function returns step started");
  await deleteSyncState("returns_month_index").catch(() => undefined);
  const returnRefs = await getReturnList();
  await logSync("returns", "DEBUG", `step refs=${returnRefs.length}`);
  let upserted = 0;
  for (const batch of chunk(returnRefs, 50)) {
    const details = await getReturnDetails(batch);
    const sourceRows = details.length
      ? details
      : batch.map((item) => item.payload);
    const rows = buildReturnRows(sourceRows);
    await logSync(
      "returns",
      "DEBUG",
      `step batch=${batch.length} details=${details.length} source=${sourceRows.length} rows=${rows.length}`,
    );
    upserted += await upsertBatches("shopee_returns", rows, "return_id");
  }

  await logSync(
    "returns",
    "SUCCESS",
    `step refs=${returnRefs.length} upserted=${upserted} completed=true`,
  );

  return {
    monthsProcessed: 1,
    upserted,
    nextMonthLabel: null,
    completed: true,
  };
}

async function syncFinancial() {
  const incomeOverview = await syncIncomeOverview();
  const escrow = await syncEscrow();
  const wallet = await syncWallet();
  const returns = await syncReturns();
  return { incomeOverview, escrow, wallet, returns };
}

async function getAdsTotalBalance() {
  const accessToken = await refreshAccessToken();
  const shopId = await getShopId();
  const data = await shopeeRequest<{
    response?: {
      data_timestamp?: number;
      total_balance?: number;
    };
  }>({
    method: "GET",
    path: "/api/v2/ads/get_total_balance",
    accessToken,
    shopId,
    baseUrl: SHOPEE_ADS_BASE_URL,
  });

  const response = data.response ?? {};
  const dataTimestamp = asNumber(response.data_timestamp, 0);
  return {
    data_timestamp: dataTimestamp,
    total_balance: asNumber(response.total_balance, 0),
    snapshot_at: unixToIso(dataTimestamp),
    synced_at: nowIso(),
  };
}

async function syncAdsBalance() {
  await logSync("ads_balance", "STARTED", "Edge function ads balance sync started");
  const row = await getAdsTotalBalance();
  const upserted = await upsertBatches("shopee_ads_balance", [row], "data_timestamp");
  await logSync(
    "ads_balance",
    "SUCCESS",
    `upserted=${upserted} balance=${row.total_balance}`,
  );
  return {
    upserted,
    totalBalance: row.total_balance,
    dataTimestamp: row.data_timestamp,
  };
}

async function getAdsDailyPerformance(startDate: string, endDate: string) {
  const accessToken = await refreshAccessToken();
  const shopId = await getShopId();
  const data = await shopeeRequest<{
    response?: Array<Record<string, unknown>>;
  }>({
    method: "GET",
    path: "/api/v2/ads/get_all_cpc_ads_daily_performance",
    accessToken,
    shopId,
    baseUrl: SHOPEE_ADS_BASE_URL,
    params: {
      start_date: startDate,
      end_date: endDate,
    },
  });
  return Array.isArray(data.response) ? data.response : [];
}

function parseAdsDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const [day, month, year] = value.split("-");
  if (!day || !month || !year) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function buildAdsDailyRows(records: Record<string, unknown>[]) {
  return records
    .map((record) => {
      const performanceDate = parseAdsDate(String(record.date ?? ""));
      if (!performanceDate) return null;
      return {
        performance_date: performanceDate,
        impression: asNumber(record.impression, 0),
        clicks: asNumber(record.clicks, 0),
        ctr: asNumber(record.ctr, 0),
        direct_order: asNumber(record.direct_order, 0),
        broad_order: asNumber(record.broad_order, 0),
        direct_conversions: asNumber(record.direct_conversions, 0),
        broad_conversions: asNumber(record.broad_conversions, 0),
        direct_item_sold: asNumber(record.direct_item_sold, 0),
        broad_item_sold: asNumber(record.broad_item_sold, 0),
        direct_gmv: asNumber(record.direct_gmv, 0),
        broad_gmv: asNumber(record.broad_gmv, 0),
        expense: asNumber(record.expense, 0),
        cost_per_conversion: asNumber(record.cost_per_conversion, 0),
        direct_roas: asNumber(record.direct_roas, 0),
        broad_roas: asNumber(record.broad_roas, 0),
        synced_at: nowIso(),
      };
    })
    .filter(Boolean) as Record<string, unknown>[];
}

async function syncAdsDailyStep() {
  await logSync("ads_daily", "STARTED", "Edge function ads daily step started");
  const ranges = getAdsDateRanges();
  const rawState = await getSyncState("ads_daily_range_index");
  const latestIndex = Math.max(ranges.length - 1, 0);
  const latestStoredDate = await getLatestAdsPerformanceDate();
  let currentIndex = 0;

  if (rawState === "latest") {
    currentIndex = latestIndex;
  } else if (rawState !== null && rawState !== "") {
    const parsed = Number(rawState);
    currentIndex = Number.isFinite(parsed) && parsed >= 0 ? parsed : latestIndex;
  } else if (latestStoredDate) {
    currentIndex = latestIndex;
  }

  const range = ranges[currentIndex];

  if (!range) {
    await setSyncState("ads_daily_range_index", "latest");
    await logSync("ads_daily", "SUCCESS", "ads daily step already complete");
    return {
      rangesProcessed: 0,
      upserted: 0,
      nextRange: null,
      completed: true,
    };
  }

  const records = await getAdsDailyPerformance(range.startDate, range.endDate);
  const rows = buildAdsDailyRows(records);
  const upserted = await upsertBatches(
    "shopee_ads_daily_performance",
    rows,
    "performance_date",
  );

  const nextIndex = currentIndex + 1;
  const completed = nextIndex >= ranges.length;
  if (completed) {
    await setSyncState("ads_daily_range_index", "latest");
  } else {
    await setSyncState("ads_daily_range_index", nextIndex);
  }

  await logSync(
    "ads_daily",
    "SUCCESS",
    `range=${range.label} records=${records.length} upserted=${upserted} completed=${completed}`,
  );

  return {
    rangesProcessed: 1,
    upserted,
    nextRange: completed ? null : ranges[nextIndex].label,
    completed,
  };
}

function buildVariationRecords(models: Record<string, unknown>[], itemId: number) {
  return models.flatMap((model) => {
    const modelId = Number(model.model_id ?? 0);
    if (!modelId) return [];

    const priceInfo = Array.isArray(model.price_info) ? model.price_info[0] : {};
    const stockInfo = Array.isArray(model.stock_info) ? model.stock_info[0] : {};
    const price = (priceInfo as Record<string, unknown>) ?? {};
    const stock = (stockInfo as Record<string, unknown>) ?? {};
    const originalPrice = asNumber(price.original_price, 0);
    const currentPrice = asNumber(price.current_price, 0);
    const normalizedOriginalPrice = originalPrice || currentPrice;
    const normalizedCurrentPrice = currentPrice || originalPrice;
    const discountAmount = Math.max(normalizedOriginalPrice - normalizedCurrentPrice, 0);
    const discountPercent = normalizedOriginalPrice > 0
      ? Number(((discountAmount / normalizedOriginalPrice) * 100).toFixed(2))
      : 0;
    const isOnPromotion = discountAmount > 0;

    return [{
      model_id: modelId,
      item_id: itemId,
      model_name: model.model_name ?? null,
      model_sku: model.model_sku ?? null,
      original_price: normalizedOriginalPrice || 0,
      current_price: normalizedCurrentPrice || 0,
      is_on_promotion: isOnPromotion,
      discount_amount: discountAmount,
      discount_percent: discountPercent,
      stock_available: asNumber(stock.current_stock, 0),
      stock_reserved: asNumber(stock.reserved_stock, 0),
      synced_at: nowIso(),
    }];
  });
}

async function syncVariations() {
  await logSync("variations", "STARTED", "Edge function variation sync started");
  let itemIds = await getProductIdsWithModel();

  if (!itemIds.length) {
    const productSync = await syncProducts();
    itemIds = await getProductIdsWithModel();
    if (!itemIds.length) {
      await logSync("variations", "SUCCESS", "0 variations upserted");
      return {
        productsSeeded: productSync.productsUpserted,
        variationItems: 0,
        variationsUpserted: 0,
      };
    }
  }

  const allRows: Record<string, unknown>[] = [];
  for (const itemId of itemIds) {
    const models = await getModelList(itemId);
    allRows.push(...buildVariationRecords(models, itemId));
  }

  const upserted = await upsertBatches("shopee_variations", allRows, "model_id");
  await logSync("variations", "SUCCESS", `${upserted} variations upserted`);
  return { variationItems: itemIds.length, variationsUpserted: upserted };
}

async function handleAction(action: SyncAction) {
  if (action === "status") {
    const tokenState = await getTokenState();
    return {
      ok: true,
      action,
      shopeeBaseUrl: SHOPEE_BASE_URL,
      shopIdPresent: Boolean(tokenState.shopId),
      accessTokenPresent: Boolean(tokenState.accessToken),
      refreshTokenPresent: Boolean(tokenState.refreshToken),
      tokenExpireIn: tokenState.expireIn || null,
    };
  }

  if (action === "refresh-token") {
    const accessToken = await refreshAccessToken();
    return {
      ok: true,
      action,
      accessTokenLength: accessToken.length,
    };
  }

  if (action === "sync-products") {
    return {
      ok: true,
      action,
      result: await syncProducts(),
    };
  }

  if (action === "sync-variations") {
    return {
      ok: true,
      action,
      result: await syncVariations(),
    };
  }

  if (action === "sync-catalog") {
    const products = await syncProducts();
    const variations = await syncVariations();
    return {
      ok: true,
      action,
      result: { products, variations },
    };
  }

  if (action === "sync-orders") {
    return {
      ok: true,
      action,
      result: await syncOrders(),
    };
  }

  if (action === "sync-orders-step") {
    return {
      ok: true,
      action,
      result: await syncOrders(undefined, true),
    };
  }

  if (action === "sync-financial") {
    return {
      ok: true,
      action,
      result: await syncFinancial(),
    };
  }

  if (action === "sync-income-overview") {
    return {
      ok: true,
      action,
      result: await syncIncomeOverview(),
    };
  }

  if (action === "sync-escrow-step") {
    return {
      ok: true,
      action,
      result: await syncEscrowStep(),
    };
  }

  if (action === "sync-wallet-step") {
    return {
      ok: true,
      action,
      result: await syncWalletStep(),
    };
  }

  if (action === "sync-returns-step") {
    return {
      ok: true,
      action,
      result: await syncReturnsStep(),
    };
  }

  if (action === "sync-ads-balance") {
    return {
      ok: true,
      action,
      result: await syncAdsBalance(),
    };
  }

  if (action === "sync-ads-daily-step") {
    return {
      ok: true,
      action,
      result: await syncAdsDailyStep(),
    };
  }

  throw new Error(`Unsupported action: ${String(action)}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      return jsonResponse(await handleAction("status"));
    }

    if (req.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
    }

    const body = (await req.json().catch(() => ({}))) as { action?: SyncAction };
    const action = body.action ?? "status";

    return jsonResponse(await handleAction(action));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logSync("edge_function", "ERROR", message).catch(() => undefined);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
