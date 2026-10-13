// Writes the Indonesian update email for Mom and Dad from the Iron & Rice family export.
// Usage: node tools/digest.mjs <export dir> <page link>
// Prints JSON: {subject, body}. Uses only what the family view already shares (hidden foods are never in the export).
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const [exportDir, link] = process.argv.slice(2);
if (!exportDir || !link) { console.error('usage: node tools/digest.mjs <export dir> <page link>'); process.exit(2); }
const unwrap = o => (o && typeof o === 'object' && o.data && typeof o.data === 'object' && ('id' in o || 'version' in o)) ? o.data : o;
const read = p => existsSync(p) ? unwrap(JSON.parse(readFileSync(p, 'utf8'))) : null;

const sum = read(join(exportDir, 'family', 'summary.json'));
if (!sum || sum.off) { console.error('nothing shared'); process.exit(4); }
let today = sum.today;
try { if (sum.tz) today = new Date().toLocaleDateString('en-CA', {timeZone: sum.tz}); } catch (e) {}
const d = read(join(exportDir, 'family', `d${today}.json`));

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const [y, m, dd] = today.split('-').map(Number), dt = new Date(y, m - 1, dd);
const tgl = `${HARI[dt.getDay()]}, ${dd} ${BULAN[m - 1]}`;
const fmt = n => Math.round(n).toLocaleString('id-ID');
const g1 = n => { const v = Math.round(n * 10) / 10; return (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace('.', ','); };
const nm = sum.name || 'Anak Ibu';

const lines = [];
let subject;
if (!d || !(d.kcal > 0)) {
  subject = `Musubi: ${nm} belum mencatat makanan hari ini`;
  lines.push(`- Belum ada makanan yang dicatat hari ini.`);
} else {
  const over = d.kcal - d.target;
  subject = over > d.target * 0.05
    ? `Musubi: ${nm} lebih ${fmt(over)} kkal hari ini`
    : `Musubi: ${nm} ${fmt(d.kcal)}/${fmt(d.target)} kkal hari ini`;
  lines.push(`- Kalori: ${fmt(d.kcal)} dari target ${fmt(d.target)} kkal (${over > 0 ? 'lebih ' + fmt(over) : 'sisa ' + fmt(-over)})`);
  lines.push(`- Protein: ${fmt(d.p)} dari ${fmt(d.pT)} g`);
  const night = (d.meals || []).filter(x => x.nt);
  if (night.length) lines.push(`- Camilan malam: ${night.map(x => `${x.n} (${fmt(x.kcal)} kkal)`).join(', ')}`);
  if (d.resisted) lines.push(`- Godaan ngemil malam berhasil ditahan ${d.resisted}×`);
}
if (d && d.weight != null) lines.push(`- Berat pagi ini: ${g1(d.weight)} kg (turun ${g1(Math.max(0, sum.startKg - d.weight))} kg sejak mulai, target ${g1(sum.goalKg)} kg)`);

const body = `Halo Bu, Pak!

Update dari Musubi untuk ${tgl}:
${lines.join('\n')}

Lihat lengkap di sini:
${link}

Salam,
Musubi 🍙

(Email ini dikirim otomatis setiap malam sekitar pukul 21.00 WIB.)`;
console.log(JSON.stringify({subject, body}));
