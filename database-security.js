const ITERATIONS = 250_000;
const VERIFY_SALT = "futbol-domingos-db-verify-v1";
// PBKDF2 proof for the configured database password. The password is never
// stored in the site source or browser storage.
const VERIFY_PROOF = "6PXQNADfriggV7te6vnG7Ks9OVSLzhX+3TQs8qULTlo=";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function browserCrypto() {
  const api = globalThis.crypto;
  if (!api?.subtle || !api.getRandomValues) throw new Error("crypto_unavailable");
  return api;
}

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function keyMaterial(password) {
  return browserCrypto().subtle.importKey(
    "raw", encoder.encode(password), "PBKDF2", false, ["deriveBits", "deriveKey"]
  );
}

export async function verifyDatabasePassword(password) {
  const material = await keyMaterial(password);
  const proof = new Uint8Array(await browserCrypto().subtle.deriveBits({
    name: "PBKDF2",
    salt: encoder.encode(VERIFY_SALT),
    iterations: ITERATIONS,
    hash: "SHA-256",
  }, material, 256));
  const expected = fromBase64(VERIFY_PROOF);
  let difference = proof.length ^ expected.length;
  for (let i = 0; i < proof.length; i += 1) {
    difference |= proof[i] ^ (expected[i] ?? 0);
  }
  return difference === 0;
}

export async function createDatabaseSession(password, saltBytes) {
  const api = browserCrypto();
  const salt = saltBytes ?? api.getRandomValues(new Uint8Array(16));
  if (salt.length !== 16) throw new Error("invalid_salt");
  const key = await api.subtle.deriveKey({
    name: "PBKDF2",
    salt,
    iterations: ITERATIONS,
    hash: "SHA-256",
  }, await keyMaterial(password), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return { key, salt: toBase64(salt) };
}

export async function encryptDatabase(plaintext, session) {
  const api = browserCrypto();
  const iv = api.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await api.subtle.encrypt(
    { name: "AES-GCM", iv }, session.key, encoder.encode(plaintext)
  ));
  return JSON.stringify({ version: 1, salt: session.salt, iv: toBase64(iv), data: toBase64(ciphertext) });
}

export async function decryptDatabase(payload, password) {
  const record = JSON.parse(payload);
  if (record?.version !== 1 || typeof record.salt !== "string" ||
      typeof record.iv !== "string" || typeof record.data !== "string") {
    throw new Error("invalid_database_record");
  }
  const salt = fromBase64(record.salt);
  const iv = fromBase64(record.iv);
  const data = fromBase64(record.data);
  if (iv.length !== 12 || data.length < 16) throw new Error("invalid_database_record");
  const session = await createDatabaseSession(password, salt);
  const plaintext = decoder.decode(await browserCrypto().subtle.decrypt(
    { name: "AES-GCM", iv }, session.key, data
  ));
  return { plaintext, session };
}
