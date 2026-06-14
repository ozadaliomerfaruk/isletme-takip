/**
 * islem-photos bucket'ının TAM yedeği.
 * Kullanım:  node scripts/backup-storage.mjs [hedef-klasör]
 * Kimlik: .env'deki SUPABASE_SERVICE_ROLE_KEY + EXPO_PUBLIC_SUPABASE_URL.
 * Çıktı: backups/<tarih>/storage/islem-photos/<isletmeId>/<dosya> + manifest.json
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const BUCKET = 'islem-photos';

// .env'i elle parse et (dotenv bağımlılığı eklememek için)
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error('HATA: .env içinde EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY yok');
  process.exit(1);
}
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const today = new Date().toISOString().slice(0, 10);
const targetRoot = process.argv[2] || join('backups', today, 'storage', BUCKET);

async function listFolder(prefix) {
  const res = await fetch(`${URL_BASE}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 10000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  });
  if (!res.ok) throw new Error(`list ${prefix}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

// Klasörleri (id=null) özyinelemeli gez, dosyaları topla
async function walk(prefix) {
  const entries = await listFolder(prefix);
  const files = [];
  for (const e of entries) {
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.id === null) {
      files.push(...(await walk(path)));
    } else {
      files.push({ path, size: e.metadata?.size ?? null, updated_at: e.updated_at ?? null });
    }
  }
  return files;
}

const files = await walk('');
console.log(`${files.length} dosya bulundu, indiriliyor -> ${targetRoot}`);

let bytes = 0;
let failed = [];
for (const f of files) {
  const res = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${encodeURI(f.path)}`, { headers: HEADERS });
  if (!res.ok) {
    failed.push({ path: f.path, status: res.status });
    console.error(`  HATA ${res.status}: ${f.path}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = join(targetRoot, ...f.path.split('/'));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  bytes += buf.length;
}

const manifest = {
  bucket: BUCKET,
  backed_up_at: new Date().toISOString(),
  file_count: files.length,
  failed_count: failed.length,
  total_bytes: bytes,
  failed,
  files,
};
mkdirSync(targetRoot, { recursive: true });
writeFileSync(join(targetRoot, '..', 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`BİTTİ: ${files.length - failed.length}/${files.length} dosya, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
if (failed.length > 0) {
  console.error(`UYARI: ${failed.length} dosya indirilemedi — manifest.json'a bak`);
  process.exit(2);
}
