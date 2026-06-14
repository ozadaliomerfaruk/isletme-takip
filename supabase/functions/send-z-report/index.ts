// Edge Function: Akşam "Z raporu" / gün sonu özeti push bildirimi
//
// Her akşam TR 23:30 (UTC 20:30) pg_cron ile çalışır:
//   - Bugün işlem GİRMİŞ işletmelere  -> gün sonu özeti (Gelir / Gider / Net)
//   - Bugün girmemiş ama son 14 günde aktif -> "bugünü kapatmayı unutma" hatırlatması
//   - Uzun süredir pasif (14 gün+) işletmeler -> GÖNDERİLMEZ (spam önleme)
//
// Rakamlar get_z_report_targets RPC'sinden gelir; uygulamanın gelir/gider
// tanımı (src/constants/islemTypes.ts) ve para birimi çevrimiyle BİREBİR.
//
// Deep link: data.screen = "/(tabs)" -> _layout bildirim handler'ı dashboard'a götürür.
//
// GÜVENLİ TEST (cron'u açmadan önce):
//   POST body { "test_user_id": "<uuid>" } -> SADECE o kullanıcıya gönderir (pasiflik
//      kuralını da atlar; her durumda bir mesaj gider).
//   POST body { "dry_run": true }          -> hesaplar ama GÖNDERMEZ; ne gideceğini döner.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withFnTelemetry, measuredFetch } from "../_shared/telemetry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH = 100; // Expo tek istekte en fazla 100 mesaj kabul eder

interface ZReportTarget {
  isletme_id: string;
  user_id: string;
  isletme_adi: string;
  gelir: number;
  gider: number;
  islem_sayisi: number;
  aktif_son14: boolean;
}

interface PushTokenRow {
  user_id: string;
  token: string;
  locale: string | null;
}

interface ExpoMessage {
  to: string;
  sound: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  priority: string;
  channelId: string;
}

function money(amount: number, locale: "tr" | "en"): string {
  const intlLocale = locale === "en" ? "en-US" : "tr-TR";
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} TL`;
  }
}

function signedMoney(amount: number, locale: "tr" | "en"): string {
  const sign = amount >= 0 ? "+" : "-";
  return `${sign}${money(Math.abs(amount), locale)}`;
}

// Hedef + locale -> bildirim metni. islem_sayisi>0 ise özet, değilse hatırlatma.
function buildMessage(
  target: ZReportTarget,
  locale: "tr" | "en",
): { title: string; body: string } {
  const gelir = Number(target.gelir) || 0;
  const gider = Number(target.gider) || 0;
  const net = gelir - gider;

  if (target.islem_sayisi > 0) {
    if (locale === "en") {
      return {
        title: "📊 Day-end summary",
        body: `Income ${money(gelir, "en")} · Expense ${money(gider, "en")} · Net ${signedMoney(net, "en")}`,
      };
    }
    return {
      title: "📊 Gün sonu özeti",
      body: `Gelir ${money(gelir, "tr")} · Gider ${money(gider, "tr")} · Net ${signedMoney(net, "tr")}`,
    };
  }

  if (locale === "en") {
    return {
      title: "Don't forget to close today 🧾",
      body: "You haven't logged anything today. Tap to record your day.",
    };
  }
  return {
    title: "Bugünü kapatmayı unutma 🧾",
    body: "Bugün hiç kayıt girmedin. Gününü kaydetmek için dokun.",
  };
}

async function sendExpoBatch(messages: ExpoMessage[]): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < messages.length; i += EXPO_BATCH) {
    const chunk = messages.slice(i, i + EXPO_BATCH);
    try {
      const res = await measuredFetch(
        EXPO_PUSH_URL,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(chunk),
        },
        "send-z-report",
      );
      const result = await res.json();
      // Expo dizi gönderiminde data bir tickets dizisidir
      const tickets = Array.isArray(result?.data) ? result.data : [];
      for (const tkt of tickets) {
        if (tkt?.status === "error") fail++;
        else ok++;
      }
      // Beklenmedik yanıt biçimi: tüm chunk'ı başarısız say
      if (tickets.length === 0) fail += chunk.length;
    } catch (err) {
      console.error("Expo batch error:", err instanceof Error ? err.message : err);
      fail += chunk.length;
    }
  }
  return { ok, fail };
}

Deno.serve(
  withFnTelemetry({ name: "send-z-report" }, async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      // Opsiyonel parametreler (test/dry-run). Body yoksa/boşsa cron modudur.
      let testUserId: string | null = null;
      let dryRun = false;
      try {
        const body = await req.json();
        if (body && typeof body === "object") {
          if (typeof body.test_user_id === "string") testUserId = body.test_user_id;
          if (body.dry_run === true) dryRun = true;
        }
      } catch {
        // body yok -> normal cron çalışması
      }

      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { autoRefreshToken: false, persistSession: false } },
      );

      // "Bugün"ü ana pazar olan Europe/Istanbul takvim gününde hesapla
      // (process-scheduled-transactions ile aynı desen; en-CA -> YYYY-MM-DD).
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

      const { data: targetsRaw, error: rpcError } = await supabaseAdmin.rpc("get_z_report_targets", {
        p_date: today,
      });
      if (rpcError) throw new Error(`RPC get_z_report_targets: ${rpcError.message}`);

      let targets = (targetsRaw || []) as ZReportTarget[];

      // Test modu: yalnızca tek kullanıcı, pasiflik kuralı atlanır (her zaman gönder)
      if (testUserId) {
        targets = targets.filter((t) => t.user_id === testUserId);
      }

      // Gönderilecek kullanıcıların push token'larını topla
      const userIds = [...new Set(targets.map((t) => t.user_id))];
      const tokenMap = new Map<string, PushTokenRow>();
      if (userIds.length > 0) {
        const { data: tokens, error: tokenError } = await supabaseAdmin
          .from("push_tokens")
          .select("user_id, token, locale")
          .in("user_id", userIds);
        if (tokenError) console.error("push_tokens fetch error:", tokenError.message);
        for (const tk of (tokens || []) as PushTokenRow[]) {
          tokenMap.set(tk.user_id, tk);
        }
      }

      const messages: ExpoMessage[] = [];
      let summaryCount = 0;
      let reminderCount = 0;
      let skippedDormant = 0;
      let noToken = 0;

      for (const target of targets) {
        const hasActivity = target.islem_sayisi > 0;

        // Pasiflik kuralı (test modunda atlanır): bugün girmemiş + son 14 günde de
        // aktif değilse rahatsız etme.
        if (!hasActivity && !target.aktif_son14 && !testUserId) {
          skippedDormant++;
          continue;
        }

        const tk = tokenMap.get(target.user_id);
        if (!tk?.token) {
          noToken++;
          continue;
        }

        const locale: "tr" | "en" = tk.locale === "en" ? "en" : "tr";
        const { title, body } = buildMessage(target, locale);

        if (hasActivity) summaryCount++;
        else reminderCount++;

        messages.push({
          to: tk.token,
          sound: "default",
          title,
          body,
          data: { type: "z_report", screen: "/(tabs)", isletme_id: target.isletme_id },
          priority: "high",
          channelId: "default",
        });
      }

      // dry-run: gönderme, ne gideceğini döndür (rakam doğrulaması için ilk 5 örnek)
      if (dryRun) {
        return new Response(
          JSON.stringify({
            dry_run: true,
            date: today,
            total_targets: targets.length,
            would_send: messages.length,
            summary_count: summaryCount,
            reminder_count: reminderCount,
            skipped_dormant: skippedDormant,
            no_token: noToken,
            sample: messages.slice(0, 5).map((m) => ({ title: m.title, body: m.body })),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { ok, fail } = messages.length > 0 ? await sendExpoBatch(messages) : { ok: 0, fail: 0 };

      console.log(
        `Z raporu: tarih=${today} hedef=${targets.length} ozet=${summaryCount} hatirlatma=${reminderCount} ` +
          `pasif_atlandi=${skippedDormant} token_yok=${noToken} gonderildi=${ok} basarisiz=${fail}` +
          (testUserId ? ` [TEST user=${testUserId}]` : ""),
      );

      return new Response(
        JSON.stringify({
          date: today,
          test_user_id: testUserId,
          total_targets: targets.length,
          summary_count: summaryCount,
          reminder_count: reminderCount,
          skipped_dormant: skippedDormant,
          no_token: noToken,
          sent: ok,
          failed: fail,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bilinmeyen hata";
      console.error("send-z-report hatası:", message);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }),
);
