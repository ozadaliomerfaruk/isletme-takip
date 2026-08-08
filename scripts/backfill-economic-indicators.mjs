const DAY_MS = 86_400_000;
const BATCH_DAYS = 40;

function addDays(day, amount) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function isIsoDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function argument(name) {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function fiveYearsAgo() {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 5);
  return date.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const startDay = argument('--start') ?? fiveYearsAgo();
const endDay = argument('--end') ?? today();
const execute = process.argv.includes('--execute');

if (!isIsoDay(startDay) || !isIsoDay(endDay) || startDay > endDay) {
  throw new Error('--start/--end must be an ascending YYYY-MM-DD range');
}

const batches = [];
for (let batchStart = startDay; batchStart <= endDay; batchStart = addDays(batchStart, BATCH_DAYS)) {
  const candidateEnd = addDays(batchStart, BATCH_DAYS - 1);
  batches.push({
    startDate: batchStart,
    endDate: candidateEnd < endDay ? candidateEnd : endDay,
  });
}

console.log(JSON.stringify({
  mode: execute ? 'execute' : 'dry-run',
  range: [startDay, endDay],
  days: Math.floor((Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`)) / DAY_MS) + 1,
  batches: batches.length,
}, null, 2));

if (!execute) {
  console.log('No request sent. Add --execute after reviewing the range.');
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required with --execute');
}

const endpoint = `${supabaseUrl}/functions/v1/sync-ekonomik-gostergeler-evds`;
for (const [index, batch] of batches.entries()) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...batch,
      // Aylik EVDS serileri her dilimde tekrar cekilmez; son dilim cron ile ayni
      // freshness kontrolunu bir kez yapar ve tum backfill araligini kapsar.
      skipMonthly: index < batches.length - 1,
      ...(index === batches.length - 1 ? { monthlyFrom: startDay } : {}),
    }),
  });
  const rawBody = await response.text();
  let result;
  try {
    result = JSON.parse(rawBody);
  } catch {
    result = { rawBody };
  }
  console.log(JSON.stringify({
    batch: index + 1,
    totalBatches: batches.length,
    ...batch,
    status: response.status,
    result,
  }));
  if (!response.ok || result?.success !== true) {
    throw new Error(`Backfill stopped at batch ${index + 1}; rerun is idempotent`);
  }
}

console.log('Economic indicator backfill completed.');
