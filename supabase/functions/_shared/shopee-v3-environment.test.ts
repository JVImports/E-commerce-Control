import {
  resolveShopeeV3Environment,
  SHOPEE_LIVE_PARTNER_ORIGIN,
  SHOPEE_SANDBOX_PARTNER_ORIGIN
} from "./shopee-v3-environment.ts";

Deno.test("Test Partner environment resolves to the Sandbox endpoint", () => {
  const config = resolveShopeeV3Environment("sandbox");
  if (config.environment !== "sandbox") throw new Error("Expected sandbox environment");
  if (config.partnerOrigin !== SHOPEE_SANDBOX_PARTNER_ORIGIN) {
    throw new Error("Sandbox Partner ID would be sent to the Live endpoint");
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
