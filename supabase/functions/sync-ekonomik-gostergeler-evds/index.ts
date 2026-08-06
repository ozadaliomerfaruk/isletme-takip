// TCMB / EVDS -> aylik ve gunluk ekonomik gostergeler senkronu.
//
// Aylik tablo net-varlik merceklerinin geriye uyumlu kaynagidir. Gunluk tablo
// gelir/gider tarihsel mercekleri icindir. Dovizler TCMB'nin gunluk gosterge
// satis kurundan, gram altin TCMB saatlik arsivindeki 11:00 XAU degerinden gelir.
// XAG kaynak para birimli islemler icin gram gumus, uygulamanin canli metal
// kurlarinda da kullandigi MetalpriceAPI tarihsel gunluk serisinden gelir.
// Hafta sonu ve tatiller icin yapay satir yazilmaz; RPC onceki is gununu bulur.
//
// Varsayilan cron davranisi son 7 takvim gununu tekrar upsert eder. Backfill
// icin POST { startDate, endDate } veya query parametreleri kullanilir; tek
// istekte en fazla 40 gun kabul edilir. Boylece uzun backfill kucuk, tekrar
// calistirilabilir dilimlerle yapilir.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const EVDS_BASE = "https://evds3.tcmb.gov.tr/igmevdsms-dis";
const TCMB_BASE = "https://www.tcmb.gov.tr";
const METALPRICE_BASE = "https://api.metalpriceapi.com/v1";
const TROY_OUNCE_TO_GRAM = 31.1035;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAX_DAILY_RANGE_DAYS = 40;
const DAILY_FETCH_CONCURRENCY = 5;
// TCMB'nin saatlik XAU XML arsivi 29 Aralik 2021'de basliyor. Daha eski altin
// yoklugu veri hatasi degil, raporda gorunur bir kapsama boslugudur.
const GOLD_ARCHIVE_START_DAY = "2021-12-29";

const MONTHLY_SERIES: Record<string, { column: string; maxAgeMonths: number }> = {
  "TP.GENENDEKS.T1": { column: "tufe", maxAgeMonths: 2 },
  "TP.DK.USD.S.YTL": { column: "usd_try", maxAgeMonths: 1 },
  "TP.DK.EUR.S.YTL": { column: "eur_try", maxAgeMonths: 1 },
};

type RequestBody = {
  startDate?: string;
  endDate?: string;
  monthlyFrom?: string;
  skipMonthly?: boolean;
};

type DailyCurrencyRow = {
  gun: string;
  usd_try: number;
  eur_try: number;
  gbp_try: number;
  doviz_yayim_zamani: string;
  source: string;
  updated_at: string;
};

type DailyGoldRow = {
  gun: string;
  gram_altin_try: number;
  altin_yayim_zamani: string;
  source: string;
  updated_at: string;
};

type DailySilverRow = {
  gun: string;
  // ON CONFLICT insert adayinin mevcut has_value kisitini gecmesi icin ayni
  // gundeki resmi USD degeri de degismeden tasinir.
  usd_try: number;
  gram_gumus_try: number;
  gumus_yayim_zamani: string;
  gumus_source: string;
  updated_at: string;
};

type MetalpriceTimeframeResponse = {
  success?: boolean;
  rates?: Record<string, Record<string, number>>;
  error?: { code?: number; info?: string };
  message?: string;
};

function isIsoDay(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function daysBetweenInclusive(startDay: string, endDay: string): number {
  return Math.floor(
    (Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`))
      / 86_400_000,
  ) + 1;
}

function eachDay(startDay: string, endDay: string): string[] {
  const result: string[] = [];
  for (let day = startDay; day <= endDay; day = addDays(day, 1)) {
    result.push(day);
  }
  return result;
}

function istanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dayParts(day: string) {
  const [year, month, date] = day.split("-");
  return {
    year,
    month,
    date,
    yearMonth: `${year}${month}`,
    dayMonthYear: `${date}${month}${year}`,
  };
}

function fmtEvdsDate(day: string): string {
  const { year, month, date } = dayParts(day);
  return `${date}-${month}-${year}`;
}

function parsePositive(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function tagValue(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)<\\/${tag}>`, "i").exec(xml);
  return match?.[1]?.trim() ?? null;
}

function parseIndicativeCurrencies(xml: string): {
  USD: number | null;
  EUR: number | null;
  GBP: number | null;
} {
  const values = { USD: null, EUR: null, GBP: null } as {
    USD: number | null;
    EUR: number | null;
    GBP: number | null;
  };
  const blocks = xml.match(/<Currency\b[\s\S]*?<\/Currency>/gi) ?? [];
  for (const block of blocks) {
    const code = /CurrencyCode="([A-Z]{3})"/i.exec(block)?.[1]?.toUpperCase();
    if (code !== "USD" && code !== "EUR" && code !== "GBP") continue;
    const unit = parsePositive(tagValue(block, "Unit")) ?? 1;
    const selling = parsePositive(tagValue(block, "ForexSelling"));
    if (selling != null) values[code] = selling / unit;
  }
  return values;
}

function parseHourlyGold(xml: string): { value: number | null; publishedAt: string | null } {
  const blocks = xml.match(/<kur>[\s\S]*?<\/kur>/gi) ?? [];
  for (const block of blocks) {
    if (tagValue(block, "doviz_cinsi")?.toUpperCase() !== "XAU") continue;
    return {
      value: parsePositive(tagValue(block, "alis")),
      publishedAt: tagValue(xml, "zaman_etiketi"),
    };
  }
  return { value: null, publishedAt: tagValue(xml, "zaman_etiketi") };
}

async function fetchOptionalXml(
  url: string,
  source: string,
  errors: string[],
): Promise<string | null> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/xml,text/xml" },
    });
    console.log(JSON.stringify({
      source: "edge",
      kind: "upstream",
      fn_name: "sync-ekonomik-gostergeler-evds",
      upstream: source,
      status: response.status,
      ms: Date.now() - startedAt,
    }));
    if (response.status === 404) return null;
    if (!response.ok) {
      errors.push(`${source}: http ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (error) {
    errors.push(`${source}: ${error instanceof Error ? error.message : "fetch failed"}`);
    return null;
  }
}

function monthDistance(fromMonth: string, toDay: string): number {
  const [fromYear, fromMonthNumber] = fromMonth.split("-").map(Number);
  const [toYear, toMonthNumber] = toDay.split("-").map(Number);
  return (toYear - fromYear) * 12 + toMonthNumber - fromMonthNumber;
}

function ayKey(tarih: string): string | null {
  const match = /^(\d{4})-(\d{1,2})$/.exec((tarih ?? "").trim());
  if (!match) return null;
  return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-01`;
}

async function parseRequestBody(req: Request): Promise<RequestBody> {
  if (req.method !== "POST") return {};
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object" ? parsed as RequestBody : {};
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const url = new URL(req.url);
    const body = await parseRequestBody(req);
    const today = istanbulToday();
    const startDay = body.startDate ?? url.searchParams.get("startDate") ?? addDays(today, -6);
    const endDay = body.endDate ?? url.searchParams.get("endDate") ?? today;
    const monthlyFrom = body.monthlyFrom ?? url.searchParams.get("monthlyFrom")
      ?? `${addDays(today.slice(0, 7) + "-01", -93).slice(0, 7)}-01`;

    if (!isIsoDay(startDay) || !isIsoDay(endDay) || startDay > endDay) {
      throw new Error("startDate/endDate must be a valid ascending YYYY-MM-DD range");
    }
    if (!isIsoDay(monthlyFrom)) {
      throw new Error("monthlyFrom must be YYYY-MM-DD");
    }
    const dailyRangeDays = daysBetweenInclusive(startDay, endDay);
    if (dailyRangeDays > MAX_DAILY_RANGE_DAYS) {
      throw new Error(`Daily sync range cannot exceed ${MAX_DAILY_RANGE_DAYS} days`);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const nowIso = new Date().toISOString();
    const errors: string[] = [];
    const warnings: string[] = [];
    const summary: Record<string, unknown> = {};
    const currencyRows: DailyCurrencyRow[] = [];
    const goldRows: DailyGoldRow[] = [];
    const silverRows: DailySilverRow[] = [];

    const requestedDays = eachDay(startDay, endDay);
    for (let offset = 0; offset < requestedDays.length; offset += DAILY_FETCH_CONCURRENCY) {
      const batch = requestedDays.slice(offset, offset + DAILY_FETCH_CONCURRENCY);
      await Promise.all(batch.map(async (day) => {
        const parts = dayParts(day);
        const currencyUrl = `${TCMB_BASE}/kurlar/${parts.yearMonth}/${parts.dayMonthYear}.xml`;
        const goldUrl = `${TCMB_BASE}/reeskontkur/${parts.yearMonth}/${parts.dayMonthYear}-1100.xml`;
        const [currencyXml, goldXml] = await Promise.all([
          fetchOptionalXml(currencyUrl, `tcmb-indicative:${day}`, errors),
          fetchOptionalXml(goldUrl, `tcmb-hourly-xau:${day}`, errors),
        ]);

        if (currencyXml) {
          const currency = parseIndicativeCurrencies(currencyXml);
          if (currency.USD != null && currency.EUR != null && currency.GBP != null) {
            currencyRows.push({
              gun: day,
              usd_try: currency.USD,
              eur_try: currency.EUR,
              gbp_try: currency.GBP,
              doviz_yayim_zamani: `${day}T15:30:00+03:00`,
              source: "tcmb-indicative",
              updated_at: nowIso,
            });
          } else {
            errors.push(`tcmb-indicative:${day}: USD/EUR/GBP parse incomplete`);
          }
        }

        if (goldXml) {
          const gold = parseHourlyGold(goldXml);
          if (gold.value != null) {
            goldRows.push({
              gun: day,
              gram_altin_try: gold.value,
              altin_yayim_zamani: gold.publishedAt ?? `${day}T11:00:00+03:00`,
              source: "tcmb-hourly-xau",
              updated_at: nowIso,
            });
          } else if (currencyXml && day >= GOLD_ARCHIVE_START_DAY) {
            errors.push(`tcmb-hourly-xau:${day}: XAU parse failed`);
          }
        } else if (currencyXml && day >= GOLD_ARCHIVE_START_DAY) {
          // Ayni gun doviz dosyasi varsa is gunudur; 2022 sonrasi XAU 404 olmasi
          // seri/kaynak arizasidir ve cron artik bunu HTTP 502 ile gorunur kilar.
          errors.push(`tcmb-hourly-xau:${day}: expected business-day archive is missing`);
        }
      }));
    }

    if (currencyRows.length > 0) {
      const { error } = await supabase
        .from("ekonomik_gostergeler_gunluk")
        .upsert(currencyRows, { onConflict: "gun" });
      if (error) errors.push(`daily currencies upsert: ${error.message}`);
    }
    if (goldRows.length > 0) {
      const { error } = await supabase
        .from("ekonomik_gostergeler_gunluk")
        .upsert(goldRows, { onConflict: "gun" });
      if (error) errors.push(`daily gold upsert: ${error.message}`);
    }

    // MetalpriceAPI hafta sonlari da fiyat dondurebilir. Raporun butun serileri
    // ayni TCMB is gunu takviminde kalsin diye yalniz tabloda zaten bulunan
    // gunlere XAG eklenir; yapay hafta sonu satiri olusturulmaz.
    const metalpriceApiKey = Deno.env.get("METALPRICE_API_KEY");
    if (!metalpriceApiKey) {
      warnings.push("METALPRICE_API_KEY environment variable is not set");
    } else {
      const metalpriceUrl = `${METALPRICE_BASE}/timeframe`
        + `?api_key=${encodeURIComponent(metalpriceApiKey)}`
        + `&start_date=${startDay}&end_date=${endDay}`
        + "&base=TRY&currencies=XAG";
      const startedAt = Date.now();
      try {
        const response = await fetch(metalpriceUrl, {
          headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
        });
        console.log(JSON.stringify({
          source: "edge",
          kind: "upstream",
          fn_name: "sync-ekonomik-gostergeler-evds",
          upstream: "api.metalpriceapi.com",
          series: "XAG",
          status: response.status,
          ms: Date.now() - startedAt,
        }));
        const payload = await response.json() as MetalpriceTimeframeResponse;
        if (!response.ok || payload.success !== true || !payload.rates) {
          const detail = payload.error?.info
            ?? payload.message
            ?? `unexpected response keys: ${Object.keys(payload).sort().join(",") || "none"}`;
          warnings.push(`metalprice-xag: ${detail} (http ${response.status})`);
        } else {
          const { data: existingRows, error: existingRowsError } = await supabase
            .from("ekonomik_gostergeler_gunluk")
            .select("gun,usd_try")
            .gte("gun", startDay)
            .lte("gun", endDay);
          if (existingRowsError) {
            warnings.push(`metalprice-xag existing days: ${existingRowsError.message}`);
          } else {
            const existingByDay = new Map(
              (existingRows ?? [])
                .filter((row) => Number(row.usd_try) > 0)
                .map((row) => [String(row.gun).slice(0, 10), Number(row.usd_try)]),
            );
            for (const [day, rates] of Object.entries(payload.rates)) {
              const existingUsdTry = existingByDay.get(day);
              if (existingUsdTry == null) continue;
              const tryToSilverOunce = Number(rates.XAG);
              if (!Number.isFinite(tryToSilverOunce) || tryToSilverOunce <= 0) continue;
              const gramSilverTry = 1 / tryToSilverOunce / TROY_OUNCE_TO_GRAM;
              if (!Number.isFinite(gramSilverTry) || gramSilverTry <= 0) continue;
              silverRows.push({
                gun: day,
                usd_try: existingUsdTry,
                gram_gumus_try: Math.round(gramSilverTry * 100_000_000) / 100_000_000,
                gumus_yayim_zamani: `${addDays(day, 1)}T00:05:00Z`,
                gumus_source: "metalpriceapi-historical",
                updated_at: nowIso,
              });
            }
            if (silverRows.length > 0) {
              const { error: silverUpsertError } = await supabase
                .from("ekonomik_gostergeler_gunluk")
                .upsert(silverRows, { onConflict: "gun" });
              if (silverUpsertError) {
                warnings.push(`daily silver upsert: ${silverUpsertError.message}`);
              }
            }
            const expectedBusinessDays = currencyRows.length;
            if (expectedBusinessDays > 0 && silverRows.length < expectedBusinessDays) {
              warnings.push(
                `metalprice-xag: incomplete (${silverRows.length}/${expectedBusinessDays} business days)`,
              );
            }
          }
        }
      } catch (error) {
        warnings.push(
          `metalprice-xag: ${error instanceof Error ? error.message : "fetch failed"}`,
        );
      }
    }
    summary.daily = {
      range: [startDay, endDay],
      currencyRows: currencyRows.length,
      goldRows: goldRows.length,
      silverRows: silverRows.length,
    };

    const apiKey = Deno.env.get("EVDS_API_KEY");
    if (body.skipMonthly !== true && !apiKey) {
      errors.push("EVDS_API_KEY environment variable is not set");
    } else if (body.skipMonthly !== true && apiKey) {
      const monthlySummary: Record<string, unknown> = {};
      for (const [code, config] of Object.entries(MONTHLY_SERIES)) {
        const apiUrl = `${EVDS_BASE}/series=${code}`
          + `&startDate=${fmtEvdsDate(monthlyFrom)}&endDate=${fmtEvdsDate(today)}`
          + "&type=json&frequency=5&aggregationTypes=last";
        const startedAt = Date.now();
        let response: Response;
        try {
          response = await fetch(apiUrl, {
            headers: { key: apiKey, "User-Agent": BROWSER_UA, Accept: "application/json" },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "fetch failed";
          errors.push(`${code}: ${message}`);
          monthlySummary[code] = { error: message };
          continue;
        }
        console.log(JSON.stringify({
          source: "edge",
          kind: "upstream",
          fn_name: "sync-ekonomik-gostergeler-evds",
          upstream: "evds3.tcmb.gov.tr",
          series: code,
          status: response.status,
          ms: Date.now() - startedAt,
        }));
        if (!response.ok) {
          const message = `http ${response.status}`;
          errors.push(`${code}: ${message}`);
          monthlySummary[code] = { error: message };
          continue;
        }

        let payload: { items?: unknown[] };
        try {
          payload = await response.json();
        } catch {
          const message = "json parse failed";
          errors.push(`${code}: ${message}`);
          monthlySummary[code] = { error: message };
          continue;
        }

        const field = code.replace(/\./g, "_");
        const rows: Record<string, unknown>[] = [];
        for (const item of Array.isArray(payload.items) ? payload.items : []) {
          const record = item as Record<string, unknown>;
          const ay = ayKey(String(record.Tarih ?? ""));
          const value = parsePositive(String(record[field] ?? ""));
          if (ay && value != null) {
            rows.push({ ay, [config.column]: value, source: "evds", updated_at: nowIso });
          }
        }
        rows.sort((left, right) => String(left.ay).localeCompare(String(right.ay)));
        if (rows.length > 0) {
          const { error } = await supabase
            .from("ekonomik_gostergeler")
            .upsert(rows, { onConflict: "ay" });
          if (error) {
            errors.push(`${code} upsert: ${error.message}`);
            monthlySummary[code] = { error: error.message };
            continue;
          }
        }

        const lastMonth = String(rows.at(-1)?.ay ?? "");
        const ageMonths = lastMonth ? monthDistance(lastMonth, today) : Number.POSITIVE_INFINITY;
        if (ageMonths > config.maxAgeMonths) {
          errors.push(`${code}: stale or empty (last month ${lastMonth || "none"})`);
        }
        monthlySummary[code] = {
          column: config.column,
          upserted: rows.length,
          firstMonth: rows[0]?.ay ?? null,
          lastMonth: rows.at(-1)?.ay ?? null,
          stale: ageMonths > config.maxAgeMonths,
        };
      }
      summary.monthlyEvds = monthlySummary;
    } else {
      summary.monthlyEvds = { skipped: true };
    }

    // Gunluk tablodaki son is gunu degerlerini aylik tabloya yansit. Bu, EVDS'nin
    // Ocak 2026'da duran aylik kulce-altin serisine bagimliligi kaldirir ve mevcut
    // net-varlik altin mercegini de guncel tutar.
    const touchedMonths = [...new Set(eachDay(startDay, endDay).map((day) => day.slice(0, 7)))]
      .sort();
    let monthlyDerivedRows = 0;
    for (const month of touchedMonths) {
      const monthStart = `${month}-01`;
      const nextMonth = `${addDays(monthStart, 32).slice(0, 7)}-01`;
      const { data, error } = await supabase
        .from("ekonomik_gostergeler_gunluk")
        .select("gun,usd_try,eur_try,gram_altin_try")
        .gte("gun", monthStart)
        .lt("gun", nextMonth)
        .order("gun", { ascending: false });
      if (error) {
        errors.push(`monthly derive ${month}: ${error.message}`);
        continue;
      }
      const observations = Array.isArray(data) ? data : [];
      const lastUsd = observations.find((row) => Number(row.usd_try) > 0)?.usd_try;
      const lastEur = observations.find((row) => Number(row.eur_try) > 0)?.eur_try;
      const lastGold = observations.find((row) => Number(row.gram_altin_try) > 0)?.gram_altin_try;
      const derived: Record<string, unknown> = {
        ay: monthStart,
        source: "tcmb-daily-derived",
        updated_at: nowIso,
      };
      if (lastUsd != null) derived.usd_try = lastUsd;
      if (lastEur != null) derived.eur_try = lastEur;
      if (lastGold != null) derived.gram_altin_try = lastGold;
      if (lastUsd == null && lastEur == null && lastGold == null) continue;
      const { error: upsertError } = await supabase
        .from("ekonomik_gostergeler")
        .upsert(derived, { onConflict: "ay" });
      if (upsertError) errors.push(`monthly derive ${month}: ${upsertError.message}`);
      else monthlyDerivedRows += 1;
    }
    summary.monthlyDerivedRows = monthlyDerivedRows;

    if (warnings.length > 0) {
      console.warn(JSON.stringify({
        source: "edge",
        kind: "degraded",
        fn_name: "sync-ekonomik-gostergeler-evds",
        warnings,
      }));
    }
    const success = errors.length === 0;
    return new Response(
      JSON.stringify({ success, summary, errors, warnings }),
      { headers: jsonHeaders, status: success ? 200 : 502 },
    );
  } catch (error) {
    console.error("[sync-ekonomik-gostergeler-evds] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { headers: jsonHeaders, status: 500 },
    );
  }
});
