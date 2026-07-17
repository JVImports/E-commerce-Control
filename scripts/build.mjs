import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { generatedPublicFiles, publicFiles } from "./public-files.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all(publicFiles.map((file) => cp(join(root, file), join(dist, file))));

const supabaseUrl = process.env.MAVIS_SUPABASE_URL?.trim();
const publishableKey = process.env.MAVIS_SUPABASE_PUBLISHABLE_KEY?.trim();
if (!supabaseUrl || !publishableKey) {
  throw new Error("MAVIS_SUPABASE_URL and MAVIS_SUPABASE_PUBLISHABLE_KEY are required");
}
let parsedUrl;
try {
  parsedUrl = new URL(supabaseUrl);
} catch {
  throw new Error("MAVIS_SUPABASE_URL must be a valid HTTPS URL");
}
if (parsedUrl.protocol !== "https:") throw new Error("MAVIS_SUPABASE_URL must use HTTPS");

const environment = process.env.CONTEXT === "production" ? "production" : "deploy-preview";
const runtimeConfig = { supabaseUrl, publishableKey, environment, reviewPath: "/?review=shopee" };
const serialized = JSON.stringify(runtimeConfig).replaceAll("<", "\\u003c");
await writeFile(join(dist, generatedPublicFiles[0]), `window.MAVIS_RUNTIME_CONFIG = Object.freeze(${serialized});\n`, "utf8");
console.log(`Built dist with ${publicFiles.length + generatedPublicFiles.length} allowlisted public files.`);
