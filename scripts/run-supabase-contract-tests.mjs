import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = process.cwd();
const configPath = resolve(rootDir, 'supabase', 'config.toml');
const testsDir = resolve(rootDir, 'supabase', 'tests');
const config = readFileSync(configPath, 'utf8');
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];

if (!projectId) {
  throw new Error(`Supabase project_id bulunamadi: ${configPath}`);
}

const containerName = process.env.SUPABASE_DB_CONTAINER
  ?? `supabase_db_${projectId}`;
const inspect = spawnSync(
  'docker',
  ['inspect', '--type', 'container', containerName],
  { encoding: 'utf8' },
);

if (inspect.status !== 0) {
  throw new Error(
    `Yerel Supabase DB container bulunamadi (${containerName}). `
    + 'Once `supabase db start` calistirin.',
  );
}

const testFiles = readdirSync(testsDir)
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort();

if (testFiles.length === 0) {
  throw new Error(`SQL contract testi bulunamadi: ${testsDir}`);
}

for (const fileName of testFiles) {
  const filePath = resolve(testsDir, fileName);
  process.stdout.write(`\n[db-contract] ${fileName}\n`);

  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      containerName,
      'psql',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      'local_confirmation=LOCAL_ONLY_54322',
      '-U',
      'postgres',
      '-d',
      'postgres',
    ],
    {
      input: readFileSync(filePath),
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${fileName} basarisiz oldu (exit ${result.status}).`);
  }
}

process.stdout.write(`\n${testFiles.length} SQL contract testi basarili.\n`);
