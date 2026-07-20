// Edge Function: cari-ekstre — PUBLIC web ekstresi (Faz 4, plan §4 karar #4)
//
// Anonim tarayıcı, opak token ile carinin salt-okuma HTML ekstresini görür:
//   GET /functions/v1/cari-ekstre?token=<48-hex>
//
// Güvenlik:
//  * verify_jwt = OFF (config.toml) — token TEK yetki kaynağıdır: 48-hex opak,
//    cari başına tek aktif, süreli (varsayılan 30 gün), app'ten iptal edilebilir.
//  * service-role client YALNIZ token doğrulandıktan sonra o carinin verisini okur.
//  * Yanıt hiçbir kimlik/oturum bilgisi taşımaz; robots noindex.
//
// Bakiye matematiği computeBalanceOps'un CARİ bacağının aynasıdır (owner-canonical):
//   satis +amount · alis −amount · tahsilat −converted · odeme +converted ·
//   satis_iade −amount · alis_iade +amount   (pozitif = cari bize borçlu)
// Ekstre sunumu: pozitif delta = "Borç", negatif = "Alacak", yürüyen bakiye.

import { createClient } from "npm:@supabase/supabase-js@2";

const HEADERS_HTML = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: currency === "XAU" || currency === "XAG" ? "TRY" : currency,
      minimumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

function fmtDate(d: string): string {
  const p = String(d).slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(d);
}

// calculateTargetAmount aynası (TRY-referanslı kur) — cari-taraf converted tutar.
function cariDelta(row: {
  type: string;
  amount: number;
  exchange_rate: number | null;
  source_currency: string | null;
  target_currency: string | null;
}): number {
  const amount = Number(row.amount) || 0;
  const src = row.source_currency || "TRY";
  const tgt = row.target_currency || "TRY";
  const rate = Number(row.exchange_rate) || 0;
  const converted =
    src === tgt || rate <= 0 ? amount : src === "TRY" ? amount / rate : amount * rate;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  switch (row.type) {
    case "cari_satis": return r2(amount);
    case "cari_alis": return r2(-amount);
    case "cari_tahsilat": return r2(-converted);
    case "cari_odeme": return r2(converted);
    case "cari_satis_iade": return r2(-amount);
    case "cari_alis_iade": return r2(amount);
    default: return 0;
  }
}

const TIP_ETIKET: Record<string, string> = {
  cari_satis: "Satış",
  cari_alis: "Alış",
  cari_tahsilat: "Tahsilat",
  cari_odeme: "Ödeme",
  cari_satis_iade: "Satış İadesi",
  cari_alis_iade: "Alış İadesi",
};

function htmlPage(title: string, body: string): string {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; background: #F4F5F7; color: #111827; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 16px; }
  .card { background: #fff; border-radius: 14px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #6B7280; font-size: 13px; margin-bottom: 14px; }
  .bakiye { font-size: 22px; font-weight: 700; margin: 10px 0 16px; }
  .bakiye.borclu { color: #16A34A; } .bakiye.alacakli { color: #DC2626; }
  .tablo-kap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #6B7280; font-weight: 600; padding: 8px 10px; border-bottom: 2px solid #E5E7EB; white-space: nowrap; }
  td { padding: 8px 10px; border-bottom: 1px solid #F0F1F3; white-space: nowrap; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .borc { color: #16A34A; } .alacak { color: #DC2626; }
  .foot { text-align: center; color: #9CA3AF; font-size: 12px; margin: 18px 0 6px; }
  .err { text-align: center; padding: 48px 16px; }
</style></head><body><div class="wrap">${body}</div></body></html>`;
}

function errorPage(msg: string, status: number): Response {
  const body = `<div class="card err"><h1>Ekstre görüntülenemiyor</h1><p class="sub">${esc(msg)}</p></div>
<p class="foot">İşletme Takip</p>`;
  return new Response(htmlPage("Ekstre", body), { status, headers: HEADERS_HTML });
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return errorPage("Geçersiz istek.", 405);

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{48}$/.test(token)) return errorPage("Geçersiz bağlantı.", 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: link, error: linkErr } = await supabase
    .from("cari_ekstre_links")
    .select("id, isletme_id, cari_id, expires_at, revoked")
    .eq("token", token)
    .maybeSingle();

  if (linkErr) return errorPage("Beklenmeyen bir hata oluştu.", 500);
  if (!link || link.revoked) return errorPage("Bu bağlantı iptal edilmiş veya geçersiz.", 404);
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return errorPage("Bu bağlantının süresi dolmuş. İşletmeden yeni bağlantı isteyin.", 410);
  }

  const [{ data: cari }, { data: isletme }, { data: islemler, error: islemErr }] = await Promise.all([
    supabase.from("cariler").select("id, name, currency, type, balance").eq("id", link.cari_id).maybeSingle(),
    supabase.from("isletmeler").select("name").eq("id", link.isletme_id).maybeSingle(),
    supabase
      .from("islemler")
      .select("date, type, description, amount, exchange_rate, source_currency, target_currency, vade_tarihi")
      .eq("isletme_id", link.isletme_id)
      .eq("cari_id", link.cari_id)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(2000),
  ]);

  if (islemErr || !cari) return errorPage("Beklenmeyen bir hata oluştu.", 500);

  const currency = (cari.currency as string) || "TRY";
  let bakiye = 0;
  const satirlar = (islemler ?? [])
    .filter((r) => TIP_ETIKET[r.type as string])
    .map((r) => {
      const delta = cariDelta(r as Parameters<typeof cariDelta>[0]);
      bakiye = Math.round((bakiye + delta) * 100) / 100;
      const vade = r.vade_tarihi ? ` · Vade: ${fmtDate(String(r.vade_tarihi))}` : "";
      return `<tr>
<td>${fmtDate(String(r.date))}</td>
<td>${esc(TIP_ETIKET[r.type as string])}${vade}</td>
<td>${esc(r.description ?? "")}</td>
<td class="num borc">${delta > 0 ? esc(fmtMoney(delta, currency)) : ""}</td>
<td class="num alacak">${delta < 0 ? esc(fmtMoney(-delta, currency)) : ""}</td>
<td class="num">${esc(fmtMoney(bakiye, currency))}</td>
</tr>`;
    })
    .join("");

  const borclu = bakiye > 0.009;
  const alacakli = bakiye < -0.009;
  const bakiyeText = borclu
    ? `Bakiye: ${fmtMoney(bakiye, currency)} (bize borçlu)`
    : alacakli
      ? `Bakiye: ${fmtMoney(-bakiye, currency)} (biz borçluyuz)`
      : `Bakiye: ${fmtMoney(0, currency)}`;

  const bugun = new Date().toLocaleDateString("tr-TR");
  const body = `<div class="card">
<h1>${esc(cari.name)}</h1>
<div class="sub">${esc(isletme?.name ?? "")} · Cari Hesap Ekstresi · ${esc(bugun)}</div>
<div class="bakiye ${borclu ? "borclu" : alacakli ? "alacakli" : ""}">${esc(bakiyeText)}</div>
<div class="tablo-kap"><table>
<thead><tr><th>Tarih</th><th>İşlem</th><th>Açıklama</th><th class="num">Borç</th><th class="num">Alacak</th><th class="num">Bakiye</th></tr></thead>
<tbody>${satirlar || '<tr><td colspan="6" style="text-align:center;color:#9CA3AF;padding:24px">Kayıt bulunamadı</td></tr>'}</tbody>
</table></div>
</div>
<p class="foot">Bu ekstre İşletme Takip uygulamasıyla oluşturuldu · Bağlantı ${esc(fmtDate(String(link.expires_at).slice(0, 10)))} tarihine kadar geçerlidir</p>`;

  return new Response(htmlPage(`${cari.name} — Cari Ekstre`, body), {
    status: 200,
    headers: HEADERS_HTML,
  });
});
