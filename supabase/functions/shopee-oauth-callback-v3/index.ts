import { createClient } from "npm:@supabase/supabase-js@2.106.2";
import { resolveShopeeV3Environment } from "../_shared/shopee-v3-environment.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PARTNER_ID = Number(Deno.env.get("SHOPEE_THIRD_PARTY_PARTNER_ID") ?? "0");
const PARTNER_KEY = Deno.env.get("SHOPEE_THIRD_PARTY_PARTNER_KEY") ?? "";
const V3_ENABLED = Deno.env.get("MAVIS_SHOPEE_V3_ENABLED") === "true";
const SHOPEE_ENVIRONMENT = resolveShopeeV3Environment(Deno.env.get("SHOPEE_THIRD_PARTY_ENVIRONMENT"));
const PARTNER_ORIGIN = SHOPEE_ENVIRONMENT.partnerOrigin;
const TOKEN_PATH = "/api/v2/auth/token/get";
const APP_RETURN_URL = Deno.env.get("APP_RETURN_URL") ??
  "https://ecommerce-control-jv.netlify.app/";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

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

function returnTarget(path = "/") {
  const base = new URL(APP_RETURN_URL);
  const safePath = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return new URL(safePath, base.origin);
}

function redirect(path: string, status: "success" | "error", code: string, shopId?: number) {
  const target = returnTarget(path);
  target.searchParams.set("shopee_connection", status);
  target.searchParams.set("shopee_code", code);
  if (shopId) target.searchParams.set("shop_id", String(shopId));
  return new Response(null, {
    status: 303,
    headers: {
      "Location": target.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer"
    }
  });
}

async function exchangeCode(code: string, shopId: number) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await hmacSha256(PARTNER_KEY, `${PARTNER_ID}${TOKEN_PATH}${timestamp}`);
  const url = new URL(`${PARTNER_ORIGIN}${TOKEN_PATH}`);
  url.searchParams.set("partner_id", String(PARTNER_ID));
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, shop_id: shopId, partner_id: PARTNER_ID }),
    redirect: "error",
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`token_http_${response.status}`);
  if (payload.error) throw new Error(`token_${String(payload.error)}`);
  const token = payload.response ?? payload;
  if (!token.access_token || !token.refresh_token || !token.expire_in) {
    throw new Error("token_response_incomplete");
  }
  return token;
}

function extractShopIds(token: any, callbackShopId: number) {
  const values = [
    callbackShopId,
    Number(token.shop_id || 0),
    ...(Array.isArray(token.shop_id_list) ? token.shop_id_list.map(Number) : [])
  ];
  return [...new Set(values.filter((value) => Number.isFinite(value) && value > 0))];
}

Deno.serve(async (req) => {
  let stateHash = "";
  let returnPath = "/";
  let claimed = false;
  try {
    if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
    if (!V3_ENABLED || !PARTNER_ID || PARTNER_KEY.length < 8) return redirect(returnPath, "error", "connection_unavailable");

    const url = new URL(req.url);
    const state = String(url.searchParams.get("state") || "");
    const code = String(url.searchParams.get("code") || "");
    const callbackShopId = Number(url.searchParams.get("shop_id") || "0");
    if (!state || !code || !Number.isFinite(callbackShopId) || callbackShopId <= 0) {
      return redirect(returnPath, "error", "callback_invalid");
    }

    stateHash = await sha256(state);
    const { data: states, error: claimError } = await supabase.rpc("claim_shopee_oauth_state_v3", {
      p_state_hash: stateHash
    });
    if (claimError) throw claimError;
    const oauthState = (states ?? [])[0];
    if (!oauthState) return redirect(returnPath, "error", "state_invalid");
    claimed = true;
    returnPath = oauthState.return_path || "/";

    const token = await exchangeCode(code, callbackShopId);
    const shopIds = extractShopIds(token, callbackShopId);
    const now = new Date();
    const accessExpiresAt = new Date(now.getTime() + Number(token.expire_in) * 1000).toISOString();
    const refreshExpiresAt = token.refresh_expire_in
      ? new Date(now.getTime() + Number(token.refresh_expire_in) * 1000).toISOString()
      : null;

    const { data: result, error: finalizeError } = await supabase.rpc("finalize_shopee_oauth_v3", {
      p_state_hash: stateHash,
      p_partner_id: PARTNER_ID,
      p_environment: SHOPEE_ENVIRONMENT.environment,
      p_access_token: String(token.access_token),
      p_refresh_token: String(token.refresh_token),
      p_access_expires_at: accessExpiresAt,
      p_refresh_expires_at: refreshExpiresAt,
      p_shop_ids: shopIds
    });
    if (finalizeError) throw finalizeError;
    const finalized = (result ?? [])[0];
    if (!finalized) throw new Error("oauth_finalize_empty");

    return redirect(returnPath, "success", "connected", shopIds[0]);
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    console.error("Shopee OAuth v3 callback failed", raw);
    if (claimed && stateHash) {
      try {
        await supabase.rpc("fail_shopee_oauth_state_v3", {
          p_state_hash: stateHash,
          p_error_code: raw.includes("SHOP_ALREADY_CONNECTED") ? "shop_already_connected" : "callback_failed"
        });
      } catch (_) {}
    }
    return redirect(
      returnPath,
      "error",
      raw.includes("SHOP_ALREADY_CONNECTED") ? "shop_already_connected" : "callback_failed"
    );
  }
});
