import {
  resolveShopeeV3Environment,
  SHOPEE_LIVE_PARTNER_ORIGIN,
  SHOPEE_SANDBOX_PARTNER_ORIGIN
} from "./shopee-v3-environment.ts";

Deno.test("modern shpk Sandbox environment resolves to the modern Shopee gateway", () => {
  const config = resolveShopeeV3Environment("sandbox");
  if (config.environment !== "sandbox") throw new Error("Expected sandbox environment");
  if (config.partnerOrigin !== "https://openplatform.sandbox.test-stable.shopee.sg") {
    throw new Error("Sandbox credentials would be sent to the legacy Shopee gateway");
  }
  if (config.adsOrigin !== "https://openplatform.sandbox.test-stable.shopee.sg") {
    throw new Error("Sandbox Ads calls would be sent to the legacy Shopee gateway");
  }
  if (config.partnerOrigin !== SHOPEE_SANDBOX_PARTNER_ORIGIN) {
    throw new Error("Sandbox origin constant and resolved configuration must match");
  }
});

Deno.test("Live environment resolves to the Live endpoint", () => {
  const config = resolveShopeeV3Environment("live");
  if (config.environment !== "live") throw new Error("Expected live environment");
  if (config.partnerOrigin !== SHOPEE_LIVE_PARTNER_ORIGIN) {
    throw new Error("Live Partner ID would be sent to the Sandbox endpoint");
  }
});

Deno.test("missing or unknown environments fail closed", () => {
  for (const value of [undefined, "", "production", "test"]) {
    let failed = false;
    try {
      resolveShopeeV3Environment(value);
    } catch {
      failed = true;
    }
    if (!failed) throw new Error(`Environment ${String(value)} must fail closed`);
  }
});
