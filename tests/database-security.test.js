import test from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseSession,
  encryptDatabase,
  decryptDatabase,
  verifyDatabasePassword,
} from "../database-security.js";

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
