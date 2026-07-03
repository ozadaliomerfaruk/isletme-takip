const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key && val && !process.env[key]) {
      process.env[key] = val;
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY env degiskenleri gerekli.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES = [
  'isletmeler', 'profiles', 'hesaplar', 'kategoriler', 'cariler',
  'personel', 'islemler', 'ileri_tarihli_islemler', 'nakit_avanslar',
  'nakit_avans_taksitler', 'cekler', 'pending_islemler', 'exchange_rates',
  'urunler', 'urun_hareketler', 'cari_share_codes', 'cari_links',
  'urun_aliases', 'cari_aliases', 'irsaliye_records', 'isletme_invites',
  'isletme_users', 'role_templates', 'islem_audit_log', 'app_sessions',
  'api_usage', 'notlar', 'push_tokens',
];

const STORAGE_BUCKETS = ['islem-photos'];

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS || '30', 10);

async function fetchAllRows(table) {
  const PAGE_SIZE = 1000;
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
}

async function fetchAuthUsers() {
  const allUsers = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth.users: ${error.message}`);
    if (!data || !data.users || data.users.length === 0) break;
    allUsers.push(...data.users);
    if (data.users.length < 1000) break;
    page++;
  }
  return allUsers;
}

async function downloadFile(bucket, filePath) {
  const { data, error } = await supabase.storage.from(bucket).download(filePath);
  if (error) throw error;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

async function backupStorage(backupDir) {
  const storageData = {};

  for (const bucket of STORAGE_BUCKETS) {
    console.log(`\n  Storage: ${bucket}`);
    storageData[bucket] = { metadata: [], failed: [] };

    const storageDir = path.join(backupDir, 'storage', bucket);
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    let allFiles = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list('', {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) {
        console.error(`    HATA listing ${bucket}: ${error.message}`);
        break;
      }
      if (!data || data.length === 0) break;

      const files = data.filter(f => f.id);
      allFiles.push(...files);

      if (data.length < limit) break;
      offset += limit;
    }

    const folders = await listAllFolders(bucket, '');
    for (const folder of folders) {
      let fOffset = 0;
      while (true) {
        const { data, error } = await supabase.storage.from(bucket).list(folder, {
          limit,
          offset: fOffset,
          sortBy: { column: 'name', order: 'asc' },
        });
        if (error) break;
        if (!data || data.length === 0) break;
        const files = data.filter(f => f.id).map(f => ({ ...f, _folder: folder }));
        allFiles.push(...files);
        if (data.length < limit) break;
        fOffset += limit;
      }
    }

    let downloaded = 0;
    for (const file of allFiles) {
      const filePath = file._folder ? `${file._folder}/${file.name}` : file.name;
      try {
        const base64 = await downloadFile(bucket, filePath);
        const fileDir = path.join(storageDir, file._folder || '');
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }
        fs.writeFileSync(path.join(fileDir, file.name), Buffer.from(base64, 'base64'));
        storageData[bucket].metadata.push({
          path: filePath,
          size: file.metadata?.size,
          mimetype: file.metadata?.mimetype,
          created_at: file.created_at,
        });
        downloaded++;
      } catch (err) {
        console.error(`    HATA download ${filePath}: ${err.message}`);
        storageData[bucket].failed.push({ path: filePath, error: err.message });
      }
    }
    console.log(`    ${downloaded}/${allFiles.length} dosya indirildi`);
  }

  return storageData;
}

async function listAllFolders(bucket, prefix) {
  const folders = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error || !data) return folders;

  for (const item of data) {
    if (!item.id && item.name) {
      const folderPath = prefix ? `${prefix}/${item.name}` : item.name;
      folders.push(folderPath);
      const subFolders = await listAllFolders(bucket, folderPath);
      folders.push(...subFolders);
    }
  }
  return folders;
}

function cleanOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const dirs = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup_') && fs.statSync(path.join(BACKUP_DIR, f)).isDirectory())
    .sort()
    .reverse();

  for (let i = MAX_BACKUPS; i < dirs.length; i++) {
    const dirPath = path.join(BACKUP_DIR, dirs[i]);
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`Eski backup silindi: ${dirs[i]}`);
  }
}

async function main() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupSubDir = path.join(BACKUP_DIR, `backup_${timestamp}`);

  if (!fs.existsSync(backupSubDir)) {
    fs.mkdirSync(backupSubDir, { recursive: true });
  }

  console.log(`\n=== Defter App Full Backup - ${now.toLocaleString('tr-TR')} ===`);

  const errors = [];

  // 1. Table data
  console.log('\n--- TABLO VERILERI ---');
  const tableData = {};
  let totalRows = 0;

  for (const table of TABLES) {
    try {
      const rows = await fetchAllRows(table);
      tableData[table] = rows;
      totalRows += rows.length;
      console.log(`  ${table}: ${rows.length} satir`);
    } catch (err) {
      errors.push({ type: 'table', name: table, error: err.message });
      console.error(`  ${table}: HATA - ${err.message}`);
    }
  }

  // 2. Auth users
  console.log('\n--- AUTH KULLANICILARI ---');
  let authUsers = [];
  try {
    authUsers = await fetchAuthUsers();
    console.log(`  auth.users: ${authUsers.length} kullanici`);
  } catch (err) {
    errors.push({ type: 'auth', name: 'users', error: err.message });
    console.error(`  auth.users: HATA - ${err.message}`);
  }

  // 3. Storage files
  console.log('\n--- STORAGE DOSYALARI ---');
  let storageData = {};
  try {
    storageData = await backupStorage(backupSubDir);
    // Indirilemeyen dosyalari ana hata listesine ekle ki exit code 1 olsun
    for (const [bucket, info] of Object.entries(storageData)) {
      for (const f of info.failed || []) {
        errors.push({ type: 'storage', name: `${bucket}/${f.path}`, error: f.error });
      }
    }
  } catch (err) {
    errors.push({ type: 'storage', name: 'all', error: err.message });
    console.error(`  Storage: HATA - ${err.message}`);
  }

  // 4. Schema (static schema.sql file)
  console.log('\n--- SCHEMA ---');
  const schemaSource = path.join(BACKUP_DIR, 'schema.sql');
  if (fs.existsSync(schemaSource)) {
    fs.copyFileSync(schemaSource, path.join(backupSubDir, 'schema.sql'));
    const schemaSize = (fs.statSync(schemaSource).size / 1024).toFixed(1);
    console.log(`  schema.sql kopyalandi (${schemaSize} KB)`);
  } else {
    console.log('  schema.sql bulunamadi - MCP uzerinden yeniden export edin');
  }

  // Save main backup JSON
  const backup = {
    meta: {
      timestamp: now.toISOString(),
      version: '2.0',
      totalTables: TABLES.length,
      totalRows,
      authUsers: authUsers.length,
      storageBuckets: STORAGE_BUCKETS,
      errors,
    },
    data: tableData,
    auth: { users: authUsers },
    schemaFile: fs.existsSync(schemaSource) ? 'schema.sql' : null,
    storage: {
      metadata: storageData,
    },
  };

  const dataFile = path.join(backupSubDir, 'data.json.gz');
  const json = JSON.stringify(backup, null, 2);
  const compressed = zlib.gzipSync(Buffer.from(json, 'utf-8'));
  fs.writeFileSync(dataFile, compressed);

  const sizeMB = (compressed.length / 1024 / 1024).toFixed(2);

  // Calculate total backup size
  let totalSize = compressed.length;
  const storageDir = path.join(backupSubDir, 'storage');
  if (fs.existsSync(storageDir)) {
    const countSize = (dir) => {
      let size = 0;
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        const stat = fs.statSync(p);
        size += stat.isDirectory() ? countSize(p) : stat.size;
      }
      return size;
    };
    totalSize += countSize(storageDir);
  }

  console.log(`\n=== OZET ===`);
  console.log(`  Tablolar: ${totalRows} satir`);
  console.log(`  Auth: ${authUsers.length} kullanici`);
  console.log(`  Data dosyasi: ${sizeMB} MB`);
  console.log(`  Toplam backup: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Konum: ${backupSubDir}`);

  if (errors.length > 0) {
    console.error(`\n  ${errors.length} hata olustu!`);
    errors.forEach(e => console.error(`    - ${e.type}/${e.name}: ${e.error}`));
  }

  cleanOldBackups();

  console.log(`\nBackup tamamlandi.\n`);
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Backup basarisiz:', err);
  process.exit(1);
});
