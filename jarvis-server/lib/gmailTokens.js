import crypto from "node:crypto";

function getEncryptionKey() {
  const encodedKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY || "";

  if (!/^[0-9a-fA-F]{64}$/.test(encodedKey)) {
    throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must be a 32-byte hex key.");
  }

  return Buffer.from(encodedKey, "hex");
}

export function encryptToken(token) {
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("A non-empty token is required for encryption.");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptToken(encryptedToken) {
  if (typeof encryptedToken !== "string") {
    throw new Error("An encrypted token is required for decryption.");
  }

  const [version, encodedIv, encodedAuthTag, encodedCiphertext] =
    encryptedToken.split(":");

  if (
    version !== "v1" ||
    !encodedIv ||
    !encodedAuthTag ||
    !encodedCiphertext
  ) {
    throw new Error("Invalid encrypted token format.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(encodedIv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
