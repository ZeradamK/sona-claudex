import _sodium from "libsodium-wrappers";

/**
 * Symmetric encryption for third-party credentials (e.g. iCloud app-specific
 * passwords, Music User Tokens). We never store these in plaintext. The key is
 * a single server-wide secret in INTEGRATION_ENCRYPTION_KEY (base64, 32 bytes);
 * the per-record nonce is stored alongside the ciphertext (ExternalProvider).
 */

let ready: Promise<typeof _sodium> | null = null;
async function sodium() {
  if (!ready) ready = _sodium.ready.then(() => _sodium);
  return ready;
}

function loadKey(s: typeof _sodium): Uint8Array {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw) throw new Error("integration_encryption_key_missing");
  const key = s.from_base64(raw, s.base64_variants.ORIGINAL);
  if (key.length !== s.crypto_secretbox_KEYBYTES) {
    throw new Error("integration_encryption_key_invalid_length");
  }
  return key;
}

export async function encryptCredential(
  plaintext: string
): Promise<{ ciphertext: string; nonce: Uint8Array }> {
  const s = await sodium();
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const cipher = s.crypto_secretbox_easy(s.from_string(plaintext), nonce, loadKey(s));
  return { ciphertext: s.to_base64(cipher, s.base64_variants.ORIGINAL), nonce };
}

export async function decryptCredential(
  ciphertext: string,
  nonce: Uint8Array
): Promise<string> {
  const s = await sodium();
  const cipher = s.from_base64(ciphertext, s.base64_variants.ORIGINAL);
  const plain = s.crypto_secretbox_open_easy(cipher, nonce, loadKey(s));
  return s.to_string(plain);
}
