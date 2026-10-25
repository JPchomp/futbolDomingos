import test from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseSession,
  encryptDatabase,
  decryptDatabase,
  verifyDatabasePassword,
  generateDropBoxKeyPair,
  importDropBoxPublicKey,
  importDropBoxPrivateKey,
  sealForDatabase,
  openSealedForDatabase,
} from "../database-security.js";
import {
  submitPlayersToDatabase,
  openDatabaseDropBox,
  updateDatabase,
  MAX_PENDING_ENTRIES,
} from "../logic.js";

/**
 * Installs a `localStorage` stand-in and hands back its backing object, so a
 * test can look at exactly what was written to the browser.
 */
function useStubStorage(initial) {
  const store = { ...initial };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
      removeItem: (key) => { delete store[key]; },
    },
  });
  return store;
}

test("saved player data is encrypted and requires the unlock password", async () => {
  const password = "test-only-password";
  const session = await createDatabaseSession(password);
  const plaintext = JSON.stringify([{ name: "César", score: 8, pos1: "GK" }]);
  const first = await encryptDatabase(plaintext, session);
  const second = await encryptDatabase(plaintext, session);

  assert.ok(!first.includes("César"));
  assert.notEqual(first, second, "each save must use a fresh nonce");
  assert.equal((await decryptDatabase(first, password)).plaintext, plaintext);
  await assert.rejects(decryptDatabase(first, "wrong-password"));
  assert.equal(await verifyDatabasePassword("wrong-password"), false);
});

test("tampered encrypted player data is rejected", async () => {
  const password = "test-only-password";
  const session = await createDatabaseSession(password);
  const record = JSON.parse(await encryptDatabase("[]", session));
  record.data = record.data.slice(0, -4) + "AAAA";
  await assert.rejects(decryptDatabase(JSON.stringify(record), password));
});

test("a sealed addition cannot be read back without the private key", async () => {
  const pair = await generateDropBoxKeyPair();
  const publicKey = await importDropBoxPublicKey(pair.publicKey);
  const entry = JSON.stringify({ name: "César", score: 8, pos1: "GK" });

  const first = await sealForDatabase(entry, publicKey);
  const second = await sealForDatabase(entry, publicKey);

  assert.ok(!JSON.stringify(first).includes("César"));
  assert.notDeepEqual(first, second, "each addition must use a fresh entry key");

  const privateKey = await importDropBoxPrivateKey(pair.privateKey);
  assert.equal(await openSealedForDatabase(first, privateKey), entry);

  // A second key pair stands for anyone who does not hold the password.
  const stranger = await generateDropBoxKeyPair();
  await assert.rejects(
    openSealedForDatabase(first, await importDropBoxPrivateKey(stranger.privateKey))
  );
});

test("a tampered sealed addition is rejected", async () => {
  const pair = await generateDropBoxKeyPair();
  const sealed = await sealForDatabase("{}", await importDropBoxPublicKey(pair.publicKey));
  const privateKey = await importDropBoxPrivateKey(pair.privateKey);

  await assert.rejects(openSealedForDatabase(
    { ...sealed, data: sealed.data.slice(0, -4) + "AAAA" }, privateKey
  ));
  await assert.rejects(openSealedForDatabase({ ...sealed, version: 2 }, privateKey));
  await assert.rejects(openSealedForDatabase({ ...sealed, iv: "AAAA" }, privateKey));
});

test("players are added without the password and stay unreadable until unlock", async () => {
  const pair = await generateDropBoxKeyPair();
  const store = useStubStorage({
    futbolDomingos_playerDbPublicKey: pair.publicKey,
    futbolDomingos_playerDbEncrypted: "untouched",
  });

  // No password is passed, and none is asked for.
  const outcome = await submitPlayersToDatabase([
    { name: "César", score: 8, pos1: "GK" },
    { name: "Nico", score: 6, pos1: "" },
  ]);
  assert.equal(outcome.status, "queued");
  assert.equal(outcome.queued, 2);

  const raw = store.futbolDomingos_playerDbPending;
  assert.ok(!raw.includes("César") && !raw.includes("Nico"));
  assert.equal(store.futbolDomingos_playerDbEncrypted, "untouched",
    "adding must not rewrite the database it cannot read");

  const privateKey = await importDropBoxPrivateKey(pair.privateKey);
  const opened = [];
  for (const record of JSON.parse(raw)) {
    opened.push(JSON.parse(await openSealedForDatabase(record, privateKey)));
  }
  assert.deepEqual(opened, [
    { name: "César", score: 8, pos1: "GK" },
    { name: "Nico", score: 6, pos1: "" },
  ]);
});

test("additions queue up across calls and stop at the cap", async () => {
  const pair = await generateDropBoxKeyPair();
  const store = useStubStorage({ futbolDomingos_playerDbPublicKey: pair.publicKey });

  await submitPlayersToDatabase([{ name: "César", score: 8, pos1: "GK" }]);
  await submitPlayersToDatabase([{ name: "Nico", score: 6, pos1: "" }]);
  assert.equal(JSON.parse(store.futbolDomingos_playerDbPending).length, 2);

  const tooMany = Array.from({ length: MAX_PENDING_ENTRIES }, (_, i) => ({
    name: `Player ${i}`, score: 5, pos1: "",
  }));
  assert.equal((await submitPlayersToDatabase(tooMany)).status, "full");
  assert.equal(JSON.parse(store.futbolDomingos_playerDbPending).length, 2,
    "a refused batch must leave the queue as it was");
});

test("adding reports a browser with no database rather than storing plaintext", async () => {
  const store = useStubStorage({});
  const outcome = await submitPlayersToDatabase([{ name: "César", score: 8, pos1: "GK" }]);
  assert.equal(outcome.status, "locked");
  assert.equal(outcome.queued, 0);
  assert.deepEqual(Object.keys(store), []);
});

test("a later unlock opens the box and merges what was added while locked", async () => {
  const password = "test-only-password";
  const store = useStubStorage({});

  // First unlock: no key pair yet, so one is installed for the drop box.
  const first = await createDatabaseSession(password);
  const opened = await openDatabaseDropBox(globalThis.localStorage, first);
  assert.deepEqual(opened, { entries: [], dropped: 0 });
  assert.ok(store.futbolDomingos_playerDbPublicKey);
  store.futbolDomingos_playerDbEncrypted = await encryptDatabase(
    JSON.stringify([{ name: "César", score: 8, pos1: "GK" }]), first
  );

  // The private key has to travel under the database's own salt, or the single
  // derivation done at the next unlock could not open it.
  assert.equal(
    JSON.parse(store.futbolDomingos_playerDbPrivateKey).salt,
    JSON.parse(store.futbolDomingos_playerDbEncrypted).salt
  );

  // Locked: two players are added, one of them already stored.
  assert.equal((await submitPlayersToDatabase([
    { name: "Nico", score: 6, pos1: "DEF" },
    { name: "cesar", score: 9, pos1: "GK" },
  ])).queued, 2);

  // A later unlock derives its session from the stored database, as the app does.
  const next = await decryptDatabase(store.futbolDomingos_playerDbEncrypted, password);
  const box = await openDatabaseDropBox(globalThis.localStorage, next.session);
  assert.equal(box.dropped, 0);

  const merged = updateDatabase(box.entries, JSON.parse(next.plaintext));
  assert.deepEqual(merged, [
    // The stored spelling is kept while the added rating lands.
    { name: "César", score: 9, pos1: "GK" },
    { name: "Nico", score: 6, pos1: "DEF" },
  ]);
});

test("additions are discarded, not silently lost, when the key pair is gone", async () => {
  const password = "test-only-password";
  const store = useStubStorage({});
  const session = await createDatabaseSession(password);
  await openDatabaseDropBox(globalThis.localStorage, session);
  await submitPlayersToDatabase([{ name: "César", score: 8, pos1: "GK" }]);

  delete store.futbolDomingos_playerDbPrivateKey;
  const box = await openDatabaseDropBox(globalThis.localStorage, session);
  assert.deepEqual(box.entries, []);
  assert.equal(box.dropped, 1, "an unreadable addition must be reported");
  assert.ok(store.futbolDomingos_playerDbPrivateKey, "a fresh box must replace the lost one");
});
