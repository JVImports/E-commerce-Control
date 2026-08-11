import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("runtime configuration is generated and frozen", async () => {
  const source = await readFile("dist/runtime-config.js", "utf8");
  const environment = process.env.CONTEXT === "production" ? "production" : "deploy-preview";
  assert.match(source, /^window\.MAVIS_RUNTIME_CONFIG = Object\.freeze\(/);
  assert.match(source, new RegExp(`"environment":"${environment}"`));
  assert.match(source, /"reviewPath":"\/\?review=shopee"/);
  assert.doesNotMatch(source, /service_role/i);
});

test("review entry point loads runtime config before Supabase", async () => {
  const html = await readFile("dist/index.html", "utf8");
  const runtime = html.indexOf("runtime-config.js");
  const supabase = html.search(/supabase-js/i);
  assert.ok(runtime >= 0, "runtime-config.js is referenced");
  assert.ok(supabase >= 0, "Supabase SDK is referenced");
  assert.ok(runtime < supabase, "runtime config precedes Supabase SDK");
});
