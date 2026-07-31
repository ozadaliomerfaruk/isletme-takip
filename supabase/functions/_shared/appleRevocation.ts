export const APPLE_TOKEN_ENDPOINT = "https://appleid.apple.com/auth/token";
export const APPLE_REVOKE_ENDPOINT = "https://appleid.apple.com/auth/revoke";
export const APPLE_HTTP_TIMEOUT_MS = 10_000;

export type AppleServerConfig = {
  clientId: string;
  keyId: string;
  teamId: string;
  privateKeyP8: string;
  encryptionKey: Uint8Array;
};

type AppleTokenResponse = {
  refresh_token?: string;
  id_token?: string;
  error?: string;
};

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + 0x8000)
    );
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - normalized.length % 4) % 4),
    "="
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`APPLE_REVOCATION_CONFIG_MISSING:${name}`);
  }
  return value;
}

export function loadAppleServerConfig(): AppleServerConfig {
  // APPLE_TOKEN_ENCRYPTION_KEY is a durable-data key, not an ordinary
  // disposable secret. Replacing it while encrypted credential rows remain
  // would make those rows unreadable; the worker then fails closed before
  // deleting Auth. Drain/re-encrypt pending rows first, or introduce an
  // additive key-version/keyring migration before rotating this key.
  const encryptionKey = base64ToBytes(
    requiredEnv("APPLE_TOKEN_ENCRYPTION_KEY")
  );
  if (encryptionKey.length !== 32) {
    throw new Error("APPLE_REVOCATION_INVALID_ENCRYPTION_KEY");
  }

  return {
    clientId: requiredEnv("APPLE_CLIENT_ID"),
    keyId: requiredEnv("APPLE_KEY_ID"),
    teamId: requiredEnv("APPLE_TEAM_ID"),
    privateKeyP8: requiredEnv("APPLE_PRIVATE_KEY_P8").replace(/\\n/g, "\n"),
    encryptionKey,
  };
}

async function importApplePrivateKey(pem: string): Promise<CryptoKey> {
  const der = base64ToBytes(
    pem
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace(/\s/g, "")
  );

  return crypto.subtle.importKey(
    "pkcs8",
    toArrayBuffer(der),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

export async function createAppleClientSecret(
  config: AppleServerConfig,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<string> {
  const header = base64Url(
    utf8(JSON.stringify({ alg: "ES256", kid: config.keyId }))
  );
  const payload = base64Url(
    utf8(JSON.stringify({
      iss: config.teamId,
      iat: nowSeconds,
      exp: nowSeconds + 300,
      aud: "https://appleid.apple.com",
      sub: config.clientId,
    }))
  );
  const signingInput = `${header}.${payload}`;
  const privateKey = await importApplePrivateKey(config.privateKeyP8);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      toArrayBuffer(utf8(signingInput))
    )
  );
  // Apple expects JOSE ES256's raw R || S representation (64 bytes), not an
  // ASN.1 DER ECDSA signature. Deno WebCrypto returns the JOSE-compatible
  // format; keep this guard so a runtime behavior change fails closed.
  if (signature.length !== 64) {
    throw new Error("APPLE_CLIENT_SECRET_INVALID_SIGNATURE_FORMAT");
  }

  return `${signingInput}.${base64Url(signature)}`;
}

async function postAppleForm(
  url: string,
  body: URLSearchParams
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(APPLE_HTTP_TIMEOUT_MS),
  });
}

export async function exchangeAppleAuthorizationCode(
  authorizationCode: string,
  config: AppleServerConfig
): Promise<{ refreshToken: string; idToken: string }> {
  const clientSecret = await createAppleClientSecret(config);
  const response = await postAppleForm(
    APPLE_TOKEN_ENDPOINT,
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: clientSecret,
      code: authorizationCode,
      grant_type: "authorization_code",
    })
  );
  const payload = await response.json() as AppleTokenResponse;

  if (
    !response.ok
    || typeof payload.refresh_token !== "string"
    || typeof payload.id_token !== "string"
  ) {
    throw new Error(
      `APPLE_TOKEN_EXCHANGE_FAILED:${payload.error ?? response.status}`
    );
  }

  return {
    refreshToken: payload.refresh_token,
    idToken: payload.id_token,
  };
}

export async function revokeAppleRefreshToken(
  refreshToken: string,
  config: AppleServerConfig
): Promise<void> {
  const clientSecret = await createAppleClientSecret(config);
  const response = await postAppleForm(
    APPLE_REVOKE_ENDPOINT,
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: clientSecret,
      token: refreshToken,
      token_type_hint: "refresh_token",
    })
  );

  if (!response.ok) {
    let appleError = String(response.status);
    try {
      const payload = await response.json() as { error?: string };
      appleError = payload.error ?? appleError;
    } catch {
      // Response body is intentionally not logged; it may contain diagnostics.
    }
    throw new Error(`APPLE_TOKEN_REVOCATION_FAILED:${appleError}`);
  }
}

export async function encryptAppleRefreshToken(
  refreshToken: string,
  config: AppleServerConfig
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(config.encryptionKey),
    "AES-GCM",
    false,
    ["encrypt"]
  );
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      toArrayBuffer(utf8(refreshToken))
    )
  );

  return {
    ciphertext: bytesToBase64(encrypted),
    iv: bytesToBase64(iv),
  };
}

export async function decryptAppleRefreshToken(
  ciphertext: string,
  iv: string,
  config: AppleServerConfig
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(config.encryptionKey),
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(base64ToBytes(iv)) },
    key,
    toArrayBuffer(base64ToBytes(ciphertext))
  );
  return new TextDecoder().decode(decrypted);
}

export function decodeAppleIdTokenPayload(
  idToken: string
): { sub?: string; aud?: string | string[] } {
  const payloadPart = idToken.split(".")[1];
  if (!payloadPart) {
    throw new Error("APPLE_ID_TOKEN_MALFORMED");
  }
  return JSON.parse(
    new TextDecoder().decode(base64ToBytes(payloadPart))
  ) as { sub?: string; aud?: string | string[] };
}

export function isAppleAudience(
  audience: string | string[] | undefined,
  expectedClientId: string
): boolean {
  return Array.isArray(audience)
    ? audience.includes(expectedClientId)
    : audience === expectedClientId;
}
