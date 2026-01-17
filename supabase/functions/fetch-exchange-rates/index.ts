// Edge Function: Döviz ve Metal Kurlarını Güncelle
// MetalpriceAPI'den günlük kurları çeker ve Supabase'e yazar
// Günde 1 kez cron job ile çalıştırılır

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 1 troy ons = 31.1035 gram
const TROY_OUNCE_TO_GRAM = 31.1035;

// İstenen para birimleri ve metaller
const CURRENCIES = ["USD", "EUR", "GBP", "XAU", "XAG"];

interface MetalpriceAPIResponse {
  success: boolean;
  base: string;
  timestamp: number;
  rates: Record<string, number>; // TRY→X format: {USD: 0.023, EUR: 0.020, XAU: 0.0003, ...}
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[fetch-exchange-rates] Starting exchange rate fetch...");

    // MetalpriceAPI'den kurları çek (TRY base)
    const apiKey = Deno.env.get("METALPRICE_API_KEY");

    if (!apiKey) {
      throw new Error("METALPRICE_API_KEY environment variable is not set");
    }

    const apiUrl = `https://api.metalpriceapi.com/v1/latest?api_key=${apiKey}&base=TRY&currencies=${CURRENCIES.join(",")}`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data: MetalpriceAPIResponse = await response.json();

    if (!data.success) {
      throw new Error("MetalpriceAPI returned error");
    }

    console.log(`[fetch-exchange-rates] Received rates for ${Object.keys(data.rates).length} currencies/metals`);

    // API returns TRY→X format, we need X→TRY format
    // If 1 TRY = 0.023 USD, then 1 USD = 1/0.023 = 43.48 TRY
    const ratesInTRY: Record<string, number> = {};

    for (const [currency, rate] of Object.entries(data.rates)) {
      if (typeof rate === "number" && rate > 0) {
        // TRY→X formatından X→TRY formatına çevir
        let convertedRate = 1 / rate;

        // XAU ve XAG için: API ons cinsinden veriyor, biz gram istiyoruz
        // 1 ons altın = X TRY → 1 gram altın = X / 31.1035 TRY
        if (currency === "XAU" || currency === "XAG") {
          convertedRate = convertedRate / TROY_OUNCE_TO_GRAM;
        }

        // 4 ondalık basamağa yuvarla
        ratesInTRY[currency] = Math.round(convertedRate * 10000) / 10000;
      }
    }

    // TRY = 1 TRY (referans)
    ratesInTRY["TRY"] = 1;

    console.log(`[fetch-exchange-rates] Converted rates: USD=${ratesInTRY["USD"]}, EUR=${ratesInTRY["EUR"]}, XAU=${ratesInTRY["XAU"]}, XAG=${ratesInTRY["XAG"]}`);

    // Supabase client oluştur
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // exchange_rates tablosunu güncelle
    const { error: updateError } = await supabase
      .from("exchange_rates")
      .update({
        rates: ratesInTRY,
        updated_at: new Date().toISOString(),
        source: "metalpriceapi",
      })
      .eq("base_currency", "TRY");

    if (updateError) {
      // Eğer kayıt yoksa insert yap
      if (updateError.code === "PGRST116") {
        const { error: insertError } = await supabase
          .from("exchange_rates")
          .insert({
            base_currency: "TRY",
            rates: ratesInTRY,
            source: "metalpriceapi",
          });

        if (insertError) {
          throw new Error(`Insert failed: ${insertError.message}`);
        }
      } else {
        throw new Error(`Update failed: ${updateError.message}`);
      }
    }

    console.log("[fetch-exchange-rates] Successfully updated exchange rates");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Exchange rates updated successfully",
        currencies_count: Object.keys(ratesInTRY).length,
        sample: {
          USD: ratesInTRY["USD"],
          EUR: ratesInTRY["EUR"],
          GBP: ratesInTRY["GBP"],
          XAU: ratesInTRY["XAU"],
          XAG: ratesInTRY["XAG"],
        },
        updated_at: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[fetch-exchange-rates] Error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
