export type ShopeeV3Environment = "live" | "sandbox";

export const SHOPEE_LIVE_PARTNER_ORIGIN = "https://partner.shopeemobile.com";
export const SHOPEE_SANDBOX_PARTNER_ORIGIN = "https://openplatform.sandbox.test-stable.shopee.sg";
export const SHOPEE_LIVE_ADS_ORIGIN = "https://openplatform.shopee.com.br";

export function resolveShopeeV3Environment(value: string | undefined) {
  const environment = String(value || "").trim().toLowerCase();
  if (environment !== "live" && environment !== "sandbox") {
    throw new Error("SHOPEE_THIRD_PARTY_ENVIRONMENT must be live or sandbox");
  }
  return {
    environment: environment as ShopeeV3Environment,
    partnerOrigin: environment === "sandbox"
      ? SHOPEE_SANDBOX_PARTNER_ORIGIN
      : SHOPEE_LIVE_PARTNER_ORIGIN,
    adsOrigin: environment === "sandbox"
      ? SHOPEE_SANDBOX_PARTNER_ORIGIN
      : SHOPEE_LIVE_ADS_ORIGIN
  };
}
