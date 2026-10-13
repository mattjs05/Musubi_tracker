// Builds data.json for the family page from the Iron & Rice family export.
// Usage:
//   MOM_KEY=<base64url key> node tools/sync.mjs <export dir> <site dir> [--desc <new descriptions.json>]
//   MOM_KEY=<base64url key> node tools/sync.mjs <export dir> <site dir> --missing
// <export dir> holds family/*.json and shared/character.json as saved by the ArtifactData tool (out_dir).
// data.json is AES-256-GCM encrypted; only the key in the family link (after #) can read it.
// Food descriptions (Indonesian, keyed by exact food name) live inside the encrypted file and carry over between runs.
// --missing prints a JSON array of food names that still have no description, writes nothing, and exits 5 (or 3 if none).
// Exit code 0 = data.json changed, 3 = nothing new, 4 = nothing shared yet, anything else = error.
import {readFileSync, writeFileSync, existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {webcrypto as crypto} from 'node:crypto';

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const [exportDir, siteDir] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--desc'));
const keyB64 = process.env.MOM_KEY || '';
if (!exportDir || !siteDir || !keyB64) { console.error('usage: MOM_KEY=... node tools/sync.mjs <export dir> <site dir> [--desc file | --missing]'); process.exit(2); }
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

// previous payload: for change detection and to keep earlier descriptions
const out = join(siteDir, 'data.json');
let old = null;
if (existsSync(out)) {
  try {
    const box = JSON.parse(readFileSync(out, 'utf8'));
    old = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64d(box.iv)}, key, b64d(box.ct))));
  } catch (e) { old = null; /* new key or unreadable: rewrite */ }
}

const names = [...new Set(Object.values(days).flatMap(d => d.meals.map(m => m.n)).filter(n => typeof n === 'string' && n.trim()))];
const desc = {};
const oldDesc = (old && old.desc && typeof old.desc === 'object') ? old.desc : {};
const newDescPath = typeof flag('--desc') === 'string' ? flag('--desc') : null;
const newDesc = newDescPath && existsSync(newDescPath) ? JSON.parse(readFileSync(newDescPath, 'utf8')) : {};
for (const n of names) {
  const v = typeof newDesc[n] === 'string' && newDesc[n].trim() ? newDesc[n] : oldDesc[n];
  if (typeof v === 'string' && v.trim()) desc[n] = v.trim().slice(0, 400);
}

if (flag('--missing')) {
  const missing = names.filter(n => !desc[n]);
  console.log(JSON.stringify(missing));
  process.exit(missing.length ? 5 : 3);
}

const content = JSON.stringify({sum, days, char, desc});
if (old && JSON.stringify({sum: old.sum, days: old.days, char: old.char, desc: old.desc || {}}) === content) { console.log('no change'); process.exit(3); }
const iv = crypto.getRandomValues(new Uint8Array(12));
const plain = new TextEncoder().encode(JSON.stringify({v: 1, synced: Date.now(), sum, days, char, desc}));
const ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, plain));
writeFileSync(out, JSON.stringify({v: 1, iv: b64e(iv), ct: b64e(ct)}));
console.log(`data.json updated: ${Object.keys(days).length} days, ${Object.keys(desc).length} food descriptions, ${sum.off ? 'sharing off' : 'sharing on'}`);
