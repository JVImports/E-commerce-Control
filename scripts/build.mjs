import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const publicFiles = [
  "index.html",
  "styles.css",
  "theme.css",
  "theme-toggle.js",
  "app.js",
  "hotfix.js",
  "ads-analyzer.css",
  "ads-analyzer.js",
  "ads-analyzer-product-ads.css",
  "ads-analyzer-product-ads.js",
  "layout-fixes.css",
  "shopee-multi-app.css",
  "shopee-multi-app.js",
  "shopee-oauth-callback.js",
  "supabase-auth-sync-v2.js"
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all(publicFiles.map((file) => cp(join(root, file), join(dist, file))));
console.log(`Built dist with ${publicFiles.length} allowlisted public files.`);
