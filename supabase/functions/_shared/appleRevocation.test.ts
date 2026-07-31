import {
  createAppleClientSecret,
  type AppleServerConfig,
} from "./appleRevocation.ts";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + 0x8000)
    );
  }
  return btoa(binary);
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - normalized.length % 4) % 4),
    "="
  );
  return Uint8Array.from(
    atob(padded),
    (character) => character.charCodeAt(0)
  );
}

Deno.test("Apple client secret uses a 64-byte JOSE ES256 signature", async () => {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const privateKeyPkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)
  );
  const privateKeyP8 = [
    "-----BEGIN PRIVATE KEY-----",
    bytesToBase64(privateKeyPkcs8),
    "-----END PRIVATE KEY-----",
  ].join("\n");
  const config: AppleServerConfig = {
    clientId: "com.example.test",
    keyId: "TESTKEY123",
    teamId: "TESTTEAM123",
    privateKeyP8,
    encryptionKey: new Uint8Array(32),
  };

  const jwt = await createAppleClientSecret(config, 1_700_000_000);
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    throw new Error("Expected a three-part JWT");
  }

  const signature = decodeBase64Url(parts[2]);
  if (signature.length !== 64) {
    throw new Error(
      `Expected 64-byte JOSE ES256 signature, got ${signature.length}`
    );
  }
});
