import { access, readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { generatedPublicFiles, publicFiles } from "./public-files.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [relative(dist, path).replaceAll("\\", "/")];
  }));
  return nested.flat().sort();
}

const actual = await listFiles(dist);
const expected = [...publicFiles, ...generatedPublicFiles].sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected publish contents. Expected ${expected.join(", ")}; received ${actual.join(", ")}`);
}

const forbidden = [
  /JV(?:Adm|Cliente)@20\d{2}/i,
  /SUPABASE_SERVICE_ROLE_KEY\s*=/i,
  /SHOPEE_PARTNER_KEY\s*=/i,
  /demo-users\.json/i,
  /service_role(?:_key)?["'\s:=]+eyJ/i,
  /(?:partner|refresh|access)[_-]?(?:key|token)["'\s:=]+[A-Za-z0-9_-]{24,}/i
];

const bannedProductCopy = [
  "Conecte seu Supabase",
  "Edge Function URL",
  "Auth Code",
  "Access Token Manual",
  "Aguardando aprovação",
  "development scaffold"
];

for (const file of actual) {
  const content = await readFile(join(dist, file), "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(content)) throw new Error(`Forbidden release content in ${file}: ${pattern}`);
  }
  if ([".html", ".js"].includes(extname(file))) {
    for (const text of bannedProductCopy) {
      if (content.toLocaleLowerCase("pt-BR").includes(text.toLocaleLowerCase("pt-BR"))) {
        throw new Error(`Banned reviewer-facing copy in ${file}: ${text}`);
      }
    }
  }
}

const html = await readFile(join(dist, "index.html"), "utf8");
const runtimeIndex = html.search(/<script[^>]+src=["'][^"']*runtime-config\.js[^"']*["']/i);
const supabaseIndex = html.search(/<script[^>]+src=["'][^"']*supabase[^"']*["']/i);
if (runtimeIndex < 0 || supabaseIndex < 0 || runtimeIndex > supabaseIndex) {
  throw new Error("index.html must load runtime-config.js before the Supabase SDK");
}

const assetPattern = /(?:src|href)=["']([^"'#?]+)(?:[?#][^"']*)?["']/gi;
for (const match of html.matchAll(assetPattern)) {
  const asset = match[1];
  if (/^(?:https?:|data:|\/\/)/i.test(asset)) continue;
  const normalized = asset.replace(/^\.\//, "");
  await access(join(dist, normalized)).catch(() => {
    throw new Error(`Missing local asset referenced by index.html: ${asset}`);
  });
}

console.log("Release validation passed: allowlist, assets, script order, copy and secret scan are clean.");
