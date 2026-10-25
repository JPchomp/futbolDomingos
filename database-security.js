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

function parseRecord(payload) {
  const record = JSON.parse(payload);
  if (record?.version !== 1 || typeof record.salt !== "string" ||
      typeof record.iv !== "string" || typeof record.data !== "string") {
    throw new Error("invalid_database_record");
  }
  const iv = fromBase64(record.iv);
  const data = fromBase64(record.data);
  if (iv.length !== 12 || data.length < 16) throw new Error("invalid_database_record");
  return { salt: fromBase64(record.salt), iv, data };
}

/** Open a record with a session already derived, so one unlock serves them all. */
export async function decryptWithSession(payload, session) {
  const { iv, data } = parseRecord(payload);
  return decoder.decode(await browserCrypto().subtle.decrypt(
    { name: "AES-GCM", iv }, session.key, data
  ));
}

export async function decryptDatabase(payload, password) {
  const { salt, iv, data } = parseRecord(payload);
  const session = await createDatabaseSession(password, salt);
  const plaintext = decoder.decode(await browserCrypto().subtle.decrypt(
    { name: "AES-GCM", iv }, session.key, data
  ));
  return { plaintext, session };
}

// ---------------------------------------------------------------------------
// Drop box: sealing players in without the password
// ---------------------------------------------------------------------------
// Adding a player must not require the password, but the password is the only
// thing that may read the database. So additions are sealed to a public key
// that anyone may use, and opened only by the private key, which is itself
// kept encrypted under the password. Sealing is one-way: whoever adds a player
// cannot read back their own addition, let alone anyone else's.

const DROP_BOX_ALGORITHM = { name: "RSA-OAEP", hash: "SHA-256" };

export async function generateDropBoxKeyPair() {
  const pair = await browserCrypto().subtle.generateKey(
    { ...DROP_BOX_ALGORITHM, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true, ["encrypt", "decrypt"]
  );
  const api = browserCrypto();
  return {
    publicKey: toBase64(new Uint8Array(await api.subtle.exportKey("spki", pair.publicKey))),
    privateKey: toBase64(new Uint8Array(await api.subtle.exportKey("pkcs8", pair.privateKey))),
  };
}

export function importDropBoxPublicKey(publicKey) {
  return browserCrypto().subtle.importKey(
    "spki", fromBase64(publicKey), DROP_BOX_ALGORITHM, false, ["encrypt"]
  );
}

export function importDropBoxPrivateKey(privateKey) {
  return browserCrypto().subtle.importKey(
    "pkcs8", fromBase64(privateKey), DROP_BOX_ALGORITHM, false, ["decrypt"]
  );
}

/**
 * Hybrid seal: the entry gets a single-use AES key, and only that key is
 * wrapped with RSA-OAEP, which on its own could not hold a long name.
 */
export async function sealForDatabase(plaintext, publicKey) {
  const api = browserCrypto();
  const entryKey = await api.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = api.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await api.subtle.encrypt(
    { name: "AES-GCM", iv }, entryKey, encoder.encode(plaintext)
  ));
  const wrapped = new Uint8Array(await api.subtle.encrypt(
    DROP_BOX_ALGORITHM, publicKey, new Uint8Array(await api.subtle.exportKey("raw", entryKey))
  ));
  return { version: 1, key: toBase64(wrapped), iv: toBase64(iv), data: toBase64(data) };
}

export async function openSealedForDatabase(record, privateKey) {
  if (record?.version !== 1 || typeof record.key !== "string" ||
      typeof record.iv !== "string" || typeof record.data !== "string") {
    throw new Error("invalid_sealed_entry");
  }
  const api = browserCrypto();
  const iv = fromBase64(record.iv);
  const data = fromBase64(record.data);
  if (iv.length !== 12 || data.length < 16) throw new Error("invalid_sealed_entry");
  const rawKey = await api.subtle.decrypt(DROP_BOX_ALGORITHM, privateKey, fromBase64(record.key));
  const entryKey = await api.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  return decoder.decode(await api.subtle.decrypt({ name: "AES-GCM", iv }, entryKey, data));
}
