import { createClient } from "npm:@supabase/supabase-js@2.106.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEFAULT_ORIGIN = Deno.env.get("APP_RETURN_URL") ?? "https://ecommerce-control-jv.netlify.app";
const ALLOWED_ORIGINS = new Set((Deno.env.get("APP_ALLOWED_RETURN_ORIGINS") ?? DEFAULT_ORIGIN)
  .split(",").map((value) => value.trim()).filter(Boolean));
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing Supabase environment variables");

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin)
    || /^https:\/\/[a-z0-9-]+--ecommerce-control-jv\.netlify\.app$/i.test(origin)
    || origin === "https://ecommerce-control-jv.netlify.app";
  return {
    "Access-Control-Allow-Origin": allowed ? origin : new URL(DEFAULT_ORIGIN).origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin"
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", ...cors(req) }
  });
}

async function userFor(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "Sessão ausente.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Sessão inválida ou expirada.");
  return data.user;
}

async function membership(userId: string, requested: unknown) {
  let query = admin.from("account_members").select("account_id,role,accounts!inner(id,name,status)").eq("user_id", userId);
  if (requested) query = query.eq("account_id", String(requested));
  const { data, error } = await query.limit(2);
  if (error) throw error;
  if (!data?.length) throw new HttpError(403, "Conta não autorizada.");
  if (!requested && data.length !== 1) throw new HttpError(400, "Selecione uma conta.");
  return data[0] as any;
}

async function countRows(table: string, accountId: string, shopId?: number) {
  let query = admin.from(table).select("*", { count: "exact", head: true });
  if (shopId) query = query.eq("shop_id", shopId);
  else query = query.eq("account_id", accountId);
  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

async function latest(table: string, column: string, accountId: string, shopId?: number) {
  let query = admin.from(table).select(column).order(column, { ascending: false }).limit(1);
  if (shopId) query = query.eq("shop_id", shopId);
  else query = query.eq("account_id", accountId);
  const { data, error } = await query.maybeSingle();
  return error ? null : (data as any)?.[column] ?? null;
}

async function bootstrap(userId: string, accountId: unknown) {
  const member = await membership(userId, accountId);
  const account = member.accounts;
  const { data: connections, error } = await admin.from("shopee_connections")
    .select("id,external_shop_id,shop_name,status,last_sync_at,last_error,updated_at")
    .eq("account_id", member.account_id).order("updated_at", { ascending: false });
  if (error) throw error;
  const canManage = ["owner", "admin"].includes(String(member.role));
  const capabilities = { connect: canManage, sync: canManage, disconnect: canManage, import: false };
  const shops = await Promise.all((connections ?? []).map(async (connection: any) => {
    const shopId = Number(connection.external_shop_id);
    const modules = await Promise.all([
      ["products", "Produtos", "shopee_products", "synced_at"],
      ["orders", "Pedidos", "shopee_orders", "synced_at"],
      ["finance", "Financeiro", "shopee_escrow", "synced_at"],
      ["ads", "Anúncios", "shopee_ads_product_campaign_daily", "synced_at"]
    ].map(async ([key, label, table, time]) => {
      const [records, lastSync] = await Promise.all([countRows(table, member.account_id, shopId), latest(table, time, member.account_id, shopId)]);
      return { key, label, status: records > 0 ? "healthy" : "empty", last_sync_at: lastSync, records };
    }));
    return { id: connection.id, shop_id: shopId, name: connection.shop_name, status: connection.status, last_sync_at: connection.last_sync_at, modules };
  }));
  const shopeeLastSync = shops.map((shop) => shop.last_sync_at).filter(Boolean).sort().at(-1) ?? null;

  const [stockRecords, productRecords, kitRecords, lastStock, lastCatalog] = await Promise.all([
    countRows("upseller_stock_snapshot", member.account_id), countRows("upseller_product_snapshot", member.account_id),
    countRows("upseller_kit_snapshot", member.account_id), latest("upseller_stock_imports", "imported_at", member.account_id),
    latest("upseller_catalog_imports", "imported_at", member.account_id)
  ]);
  const upsellerLastSync = [lastStock, lastCatalog].filter(Boolean).sort().at(-1) ?? null;

  return {
    account: { id: account.id, name: account.name, role: member.role },
    integrations: [
      { provider: "shopee", display_name: "Shopee", status: shops.some((s) => s.status === "active") ? "active" : "inactive", last_sync_at: shopeeLastSync, shops, capabilities },
      { provider: "upseller", display_name: "UPSeller ETL", description: "Integração ETL controlada por arquivos XLSX/CSV.", status: stockRecords + productRecords + kitRecords > 0 ? "active" : "inactive", last_sync_at: upsellerLastSync,
        modules: [
          { key: "stock", label: "Estoque", status: stockRecords ? "healthy" : "empty", last_sync_at: lastStock, records: stockRecords },
          { key: "catalog", label: "Catálogo", status: productRecords ? "healthy" : "empty", last_sync_at: lastCatalog, records: productRecords },
          { key: "kits", label: "Kits", status: kitRecords ? "healthy" : "empty", last_sync_at: lastCatalog, records: kitRecords }
        ], capabilities }
    ]
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const correlationId = crypto.randomUUID();
  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const user = await userFor(req);
    const body = await req.json().catch(() => ({}));
    if (String(body.action ?? "bootstrap") !== "bootstrap") throw new HttpError(400, "Ação não suportada.");
    return json(req, { ok: true, ...(await bootstrap(user.id, body.account_id)) });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error("mavis-integrations-v1", correlationId, error instanceof Error ? error.message : "unknown");
    return json(req, { ok: false, error: status === 500 ? "Não foi possível carregar as integrações." : (error as Error).message, correlation_id: correlationId }, status);
  }
});
