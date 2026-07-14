import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const auth = await readFile(new URL('../supabase-auth-sync-v2.js', import.meta.url), 'utf8');
const integrations = await readFile(new URL('../shopee-third-party-app.js', import.meta.url), 'utf8');

assert.ok(index.indexOf('runtime-config.js') < index.indexOf('@supabase/supabase-js'));
assert.match(index, /assets\/mavis-logo\.png/);
assert.match(index, /switchView\('shopee-sync'/);
assert.doesNotMatch(app.slice(0, 250), /localStorage\.getItem\('supabase_(url|key)'/);
assert.match(app, /fatal-config/);
assert.match(auth, /mavis:auth-restored|mavis:auth-changed/);
assert.match(integrations, /mavis-integrations-v1/);
assert.match(integrations, /action: 'bootstrap'/);
assert.doesNotMatch(integrations, /Partner Key|Access Token Manual|Refresh Token Manual/i);

console.log('Frontend contract checks passed.');
