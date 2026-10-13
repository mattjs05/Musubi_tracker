// Builds data.json for Mom's page from the Iron & Rice family export.
// Usage: MOM_KEY=<base64url key> node tools/sync.mjs <export dir> <site dir>
// <export dir> holds family/*.json and shared/character.json as saved by the ArtifactData tool (out_dir).
// data.json is AES-256-GCM encrypted; only the key in Mom's link (after #) can read it.
// Exit code 0 = data.json changed, 3 = nothing new, anything else = error.
import {readFileSync, writeFileSync, existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {webcrypto as crypto} from 'node:crypto';

const [exportDir, siteDir] = process.argv.slice(2);
const keyB64 = process.env.MOM_KEY || '';
if (!exportDir || !siteDir || !keyB64) { console.error('usage: MOM_KEY=... node tools/sync.mjs <export dir> <site dir>'); process.exit(2); }
const b64d = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const b64e = b => Buffer.from(b).toString('base64');
const keyBytes = b64d(keyB64);
if (keyBytes.length !== 32) { console.error('MOM_KEY must be 32 bytes'); process.exit(2); }
const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);

// ArtifactData may save either the bare document or {id, data, version}
const unwrap = o => (o && typeof o === 'object' && o.data && typeof o.data === 'object' && ('id' in o || 'version' in o)) ? o.data : o;
const readJSON = p => unwrap(JSON.parse(readFileSync(p, 'utf8')));

const famDir = join(exportDir, 'family');
const files = existsSync(famDir) ? readdirSync(famDir).filter(f => f.endsWith('.json')) : [];
let sum = null; const days = {};
for (const f of files) {
  const id = f.slice(0, -5), body = readJSON(join(famDir, f));
  if (id === 'summary') sum = body;
  else if (/^d\d{4}-\d\d-\d\d$/.test(id) && body && Array.isArray(body.meals)) days[id.slice(1)] = body;
}
if (!sum) { console.error('no family/summary in export: open Iron & Rice once with Family view on'); process.exit(4); }
if (sum.off) for (const k of Object.keys(days)) delete days[k];

let char = null;
const cp = join(exportDir, 'shared', 'character.json');
if (existsSync(cp)) {
  const c = readJSON(cp) || {};
  char = {name: String(c.name || 'Musubi').slice(0, 24), color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#E0463C', pixel: c.pixel !== false,
    art: typeof c.art === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(c.art) ? c.art : null};
}

const content = JSON.stringify({sum, days, char});
const out = join(siteDir, 'data.json');
if (existsSync(out)) {
  try {
    const box = JSON.parse(readFileSync(out, 'utf8'));
    const old = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64d(box.iv)}, key, b64d(box.ct))));
    if (JSON.stringify({sum: old.sum, days: old.days, char: old.char}) === content) { console.log('no change'); process.exit(3); }
  } catch (e) { /* new key or unreadable: rewrite */ }
}
const iv = crypto.getRandomValues(new Uint8Array(12));
const plain = new TextEncoder().encode(JSON.stringify({v: 1, synced: Date.now(), sum, days, char}));
const ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, plain));
writeFileSync(out, JSON.stringify({v: 1, iv: b64e(iv), ct: b64e(ct)}));
console.log(`data.json updated: ${Object.keys(days).length} days, ${sum.off ? 'sharing off' : 'sharing on'}`);
