import * as crypto from "crypto";

/**
 * Valida cabeçalho X-Hub-Signature-256 do webhook Meta (HMAC-SHA256 do corpo bruto).
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
export function verifyMetaHubSignature256(
  rawBody: Buffer,
  signatureHeader: string | string[] | undefined,
  appSecret: string,
): boolean {
  const sig = Array.isArray(signatureHeader)
    ? signatureHeader[0]
    : signatureHeader;
  if (!sig || typeof sig !== "string" || !sig.startsWith("sha256=")) {
    return false;
  }
  const expectedHex = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const expectedHeader = `sha256=${expectedHex}`;
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expectedHeader, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
