const source = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

function between(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  assert(startIndex >= 0, `start marker missing: ${start}`);
  assert(endIndex >= 0, `end marker missing: ${end}`);

  return source.slice(startIndex, endIndex);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value.replaceAll("\r\n", "\n")),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.test(
  "cari-ekstre uses only the service-role token validator for link lookup",
  () => {
    assert(
      source.includes(
        '.rpc("cari_ekstre_token_dogrula_v1", { p_token: token })',
      ),
      "validator RPC call is missing",
    );
    assert(
      !source.includes('.from("cari_ekstre_links")'),
      "direct service-role link-table read must stay removed",
    );
    assert(
      source.includes(
        "ef24f5d124cc2803665f5e83fa59c895e90dcee80d95952db9c8c34c5e01b954",
      ),
      "live Edge v5 provenance is missing",
    );
  },
);

Deno.test(
  "cari-ekstre preserves the live v5 balance and type calculation blocks",
  async () => {
    const deltaBlock = between(
      "function cariDelta",
      "const TIP_ETIKET",
    );
    const typeLabels = between(
      "const TIP_ETIKET",
      "function htmlPage",
    );

    assert(
      await sha256(deltaBlock) ===
        "5bf1828f617c36e6d4f384c17d3c25074a4b59cf63429ade779c4fe9e4f6a442",
      "cariDelta changed relative to live v5",
    );
    assert(
      await sha256(typeLabels) ===
        "e87826d3fcac7bffc4d0407e86b1ea4b6462833bd710505bd645303e4baffdca",
      "transaction type labels changed relative to live v5",
    );
  },
);

Deno.test(
  "cari-ekstre preserves the live v5 error, JSON, query and HTML tail",
  async () => {
    const marker = "  if (linkErr)";
    const markerIndex = source.indexOf(marker);
    assert(markerIndex >= 0, "protected response tail marker is missing");

    const protectedTail = source.slice(markerIndex);
    assert(
      await sha256(protectedTail) ===
        "3cd770f7dc402e18de44e309bf48de79be6ae1a97f57838133604a0c324a8b7d",
      "response/calculation tail changed relative to live v5",
    );
    assert(
      protectedTail.includes(
        'return fail("Bu bağlantı iptal edilmiş veya geçersiz.", 404)',
      ),
      "revoked/invalid 404 behavior changed",
    );
    assert(
      protectedTail.includes(
        'return fail("Bu bağlantının süresi dolmuş. İşletmeden yeni bağlantı isteyin.", 410)',
      ),
      "expired 410 behavior changed",
    );
    assert(
      protectedTail.includes("satirlar: jsonSatirlar") &&
        protectedTail.includes("expires_at: link.expires_at") &&
        protectedTail.includes(".limit(2000)"),
      "public JSON or row-limit contract changed",
    );
  },
);
