import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { publicFiles } from "./build.mjs";

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
const expected = [...publicFiles].sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected publish contents. Expected ${expected.join(", ")}; received ${actual.join(", ")}`);
}

const forbidden = [
  /JV(?:Adm|Cliente)@20\d{2}/i,
  /SUPABASE_SERVICE_ROLE_KEY\s*=/i,
  /SHOPEE_PARTNER_KEY\s*=/i,
  /demo-users\.json/i
];

for (const file of actual) {
  const content = await readFile(join(dist, file), "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(content)) throw new Error(`Forbidden release content in ${file}: ${pattern}`);
  }
}

console.log("Release validation passed: allowlist and secret scan are clean.");

