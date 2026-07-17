import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const privacy = await readFile(new URL('../privacidade.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const auth = await readFile(new URL('../supabase-auth-sync-v2.js', import.meta.url), 'utf8');
const integrations = await readFile(new URL('../shopee-third-party-app.js', import.meta.url), 'utf8');
const integrationsFunction = await readFile(new URL('../supabase/functions/mavis-integrations-v1/index.ts', import.meta.url), 'utf8');

assert.ok(index.indexOf('runtime-config.js') < index.indexOf('@supabase/supabase-js'));
assert.match(index, /Logo-Mavix-Hub\.png/);
assert.doesNotMatch(index, /mavis-logo-v2\.png/);
assert.match(index, /switchView\('shopee-sync'/);
assert.match(index, /<title>Mavix Hub/);
assert.match(index, /href="\/privacidade\.html"/);
assert.match(privacy, /Política de Privacidade (?:—|do) Mavix Hub/);
assert.doesNotMatch(privacy, /\bMavis\b/);
assert.doesNotMatch(app.slice(0, 250), /localStorage\.getItem\('supabase_(url|key)'/);
assert.match(app, /fatal-config/);
assert.match(auth, /mavis:auth-restored|mavis:auth-changed/);
assert.match(auth, /appRole !== 'CLIENT'\) ensureSyncPanel\(\)/);
assert.match(integrations, /mavis-integrations-v1/);
assert.match(integrations, /action: 'bootstrap'/);
assert.match(integrations, /Fluxo de integração Shopee/);
assert.doesNotMatch(integrations, /Partner Key|Access Token Manual|Refresh Token Manual/i);
assert.match(integrationsFunction, /ecommerce-control-jv\.netlify\.app/);
assert.match(integrationsFunction, /latest\("upseller_stock_imports", "imported_at"/);

console.log('Frontend contract checks passed.');
