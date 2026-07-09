// Edge Function: EVDS (TCMB) → ekonomik_gostergeler senkronu
//
// NEDEN: net-varlık reel/altın merceklerinin RESMÎ (TCMB) + kendi-kendine güncellenen
// veriye dayanması için. Mevcut keyless hat (Yahoo/frankfurter/TÜİK-statik) doğru ama
// altın uluslararası spot + TÜFE elle seed'liydi. Bu fonksiyon EVDS'den:
//   - gram altın = TP.MK.KUL.YTL  (Kapalıçarşı külçe satış, TL/gram — Türk piyasası, boşluksuz)
//   - TÜFE       = TP.GENENDEKS.T1 (Genel Endeks 2003=100'ün SÜREN kodu; güncel + aylık devam)
//                                   NOT: eski TP.FG.J0 (bie_tukfiy4) Oca-2026'da ARŞİV'e alındı
//                                   (TÜİK 2025=100'e rebase). Ama 2003=100 TP.GENENDEKS.T1
//                                   (bie_tukfiy2003) altında sürüyor → AYNI ÖLÇEK, drop-in, zincir yok.
//   - USD/EUR    = TP.DK.USD.S.YTL / TP.DK.EUR.S.YTL (döviz satış, TL — TCMB resmî)
// çeker ve ekonomik_gostergeler'e upsert eder. Artık 4 göstergenin de TEK kaynağı EVDS/TCMB
// (eski frankfurter+MetalpriceAPI spot-sync'i emekli edildi → net-varlık raporu tümüyle TCMB).
//
// EVDS NOTLARI (9 Tem 2026 doğrulandı):
//   - Taban https://evds3.tcmb.gov.tr/igmevdsms-dis/  (eski evds2/service/evds TAMAMEN 302→evds3)
//   - Anahtar HTTP header'da: `key: <EVDS_API_KEY>` (2024-04-05 değişikliği; URL param DEĞİL)
//   - Tarayıcı-dışı UA'da 302 riski → User-Agent gönderilir
//   - frequency=5 (aylık) + aggregationTypes=last (ay-sonu gözlem; net-varlık ay-sonu modeliyle uyumlu)
//   - Çok-seri tek çağrı "400 Bad Request" veriyor → her seri AYRI çağrı
//   - Yanıt: {totalCount, items:[{Tarih:"2026-1", TP_MK_KUL_YTL:"6817.67", UNIXTIME:{...}}]}
//     (seri kodundaki noktalar alan adında alt-çizgi olur; Tarih "YYYY-M" sıfırsız)
//
// KULLANIM: GET (opsiyonel ?from=YYYY-MM-DD, varsayılan 2021-12-01). Cron her gün çağırır
// (idempotent upsert, ~2 çağrı). ekonomik_gostergeler KULLANICI VERİSİ DEĞİL (global referans).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVDS_BASE = "https://evds3.tcmb.gov.tr/igmevdsms-dis";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// EVDS seri kodu → ekonomik_gostergeler kolonu
const SERIES: Record<string, string> = {
  "TP.MK.KUL.YTL": "gram_altin_try", // Kapalıçarşı gram altın satış (TL)
  "TP.GENENDEKS.T1": "tufe",          // TÜFE Genel Endeks 2003=100 (süren kod)
  "TP.DK.USD.S.YTL": "usd_try",       // ABD Doları döviz satış (TL)
  "TP.DK.EUR.S.YTL": "eur_try",       // Euro döviz satış (TL)
};

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

// EVDS "Tarih" ("2026-1") → ay anahtarı ("2026-01-01")
function ayKey(tarih: string): string | null {
  const m = /^(\d{4})-(\d{1,2})$/.exec((tarih ?? "").trim());
  if (!m) return null;
  return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-01`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  {
    try {
      const apiKey = Deno.env.get("EVDS_API_KEY");
      if (!apiKey) {
        throw new Error("EVDS_API_KEY environment variable is not set");
      }

      const url = new URL(req.url);
      const fromParam = url.searchParams.get("from"); // YYYY-MM-DD
      const startDate = fromParam
        ? new Date(`${fromParam}T00:00:00Z`)
        : new Date(Date.UTC(2021, 11, 1)); // 2021-12-01
      if (isNaN(startDate.getTime())) {
        throw new Error(`Invalid 'from' param: ${fromParam}`);
      }
      const endDate = new Date();
      const startStr = fmtDate(startDate);
      const endStr = fmtDate(endDate);

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceKey) {
        throw new Error("Missing Supabase environment variables");
      }
      const supabase = createClient(supabaseUrl, serviceKey);

      const nowIso = new Date().toISOString();
      const summary: Record<string, unknown> = {};

      for (const [code, col] of Object.entries(SERIES)) {
        const apiUrl =
          `${EVDS_BASE}/series=${code}` +
          `&startDate=${startStr}&endDate=${endStr}` +
          `&type=json&frequency=5&aggregationTypes=last`;

        const t0 = Date.now();
        const res = await fetch(apiUrl, {
          headers: { key: apiKey, "User-Agent": BROWSER_UA, Accept: "application/json" },
        });
        console.log(JSON.stringify({
          source: "edge", kind: "upstream", fn_name: "sync-ekonomik-gostergeler-evds",
          upstream: "evds3.tcmb.gov.tr", series: code, status: res.status, ms: Date.now() - t0,
        }));

        if (!res.ok) {
          summary[code] = { error: `http ${res.status}` };
          continue;
        }

        let data: { totalCount?: number; items?: unknown[] };
        try {
          data = await res.json();
        } catch {
          summary[code] = { error: "json parse failed (muhtemelen HTML/302)" };
          continue;
        }

        const items = Array.isArray(data.items) ? data.items : [];
        const field = code.replace(/\./g, "_"); // TP.MK.KUL.YTL → TP_MK_KUL_YTL

        const rows: Record<string, unknown>[] = [];
        for (const it of items as Record<string, unknown>[]) {
          const ay = ayKey(String(it["Tarih"] ?? ""));
          const raw = it[field];
          if (ay == null || raw == null || raw === "") continue;
          const val = Number(raw);
          if (!Number.isFinite(val)) continue;
          rows.push({ ay, [col]: val, source: "evds", updated_at: nowIso });
        }

        if (rows.length > 0) {
          // Her seri AYRI upsert → onConflict(ay) yalnız bu kolonu (+source/updated_at) günceller,
          // diğer kolonlar (usd_try/eur_try/diğer) DOKUNULMAZ. Eksik-ay satırı hiç yazılmaz.
          const { error } = await supabase
            .from("ekonomik_gostergeler")
            .upsert(rows, { onConflict: "ay" });
          if (error) {
            summary[code] = { error: error.message };
            continue;
          }
        }

        summary[code] = {
          column: col,
          upserted: rows.length,
          firstMonth: rows[0]?.ay ?? null,
          lastMonth: rows[rows.length - 1]?.ay ?? null,
        };
      }

      return new Response(
        JSON.stringify({ success: true, range: [startStr, endStr], summary }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } catch (error) {
      console.error("[sync-ekonomik-gostergeler-evds] Error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }
  }
});
