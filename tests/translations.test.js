import test from "node:test";
import assert from "node:assert/strict";
import {
  translations,
  translateTeamName,
  translateError,
  translateWarning,
  formatNames,
} from "../translations.js";

// The previous version of this file kept its own copy of the translations
// object, so it could pass while the app shipped a missing string. It now
// checks the object the app actually renders.

test("English and Spanish define exactly the same keys", () => {
  const en = Object.keys(translations.en).sort();
  const es = Object.keys(translations.es).sort();
  assert.deepEqual(es, en);
});

test("every translation is a non-empty string or a function", () => {
  for (const [language, table] of Object.entries(translations)) {
    for (const [key, value] of Object.entries(table)) {
      if (typeof value === "function") continue;
      assert.equal(typeof value, "string", `${language}.${key} should be a string`);
      assert.ok(value.length > 0, `${language}.${key} should not be empty`);
    }
  }
});

test("keys that take arguments are functions in both languages", () => {
  for (const key of Object.keys(translations.en)) {
    assert.equal(
      typeof translations.en[key],
      typeof translations.es[key],
      `${key} should have the same shape in both languages`
    );
  }
});

test("translateTeamName localises generated team names", () => {
  assert.equal(translateTeamName("Team 3", translations.es), "Equipo 3");
  assert.equal(translateTeamName("Team 1", translations.en), "Team 1");
  assert.equal(translateTeamName("Los Pibes", translations.es), "Los Pibes");
  assert.equal(translateTeamName(undefined, translations.en), "");
});

test("translateError covers every error code logic.js can return", () => {
  const cases = [
    ["setTeamsAndSize", {}],
    ["wholeNumbers", {}],
    ["lockedTooBig", {}],
    ["needPlayers", { needed: 10, have: 4 }],
    ["internal", {}],
  ];
  for (const [errorCode, errorParams] of cases) {
    for (const language of Object.keys(translations)) {
      const message = translateError(
        { error: "x", errorCode, errorParams },
        translations[language]
      );
      assert.equal(typeof message, "string", `${language}/${errorCode}`);
      assert.ok(message.length > 0, `${language}/${errorCode}`);
    }
  }
});

test("translateError returns null when there is no error", () => {
  assert.equal(translateError({ error: null }, translations.en), null);
  assert.equal(translateError(null, translations.en), null);
});

test("translateError interpolates the player counts", () => {
  const message = translateError(
    { error: "x", errorCode: "needPlayers", errorParams: { needed: 10, have: 4 } },
    translations.en
  );
  assert.match(message, /10/);
  assert.match(message, /4/);
});

test("translateWarning covers every warning code logic.js can return", () => {
  const cases = [
    { code: "scoreOutOfRange", names: ["Juan"] },
    { code: "scoreClamped", names: ["Juan"] },
    { code: "scoreMissing", names: ["Juan"] },
    { code: "duplicateNames", names: ["Juan"] },
    { code: "lockIgnored" },
    { code: "lockedMissing", count: 2 },
    { code: "lockedImbalance", spread: 4.5 },
    { code: "seedRuleRelaxed" },
    { code: "positionsUneven", positions: ["GK"] },
  ];
  for (const warning of cases) {
    for (const language of Object.keys(translations)) {
      const message = translateWarning(warning, translations[language]);
      assert.equal(typeof message, "string", `${language}/${warning.code}`);
      assert.ok(message.length > 0, `${language}/${warning.code}`);
    }
  }
});

test("translateWarning ignores unknown codes", () => {
  assert.equal(translateWarning({ code: "nope" }, translations.en), null);
  assert.equal(translateWarning(null, translations.en), null);
});

test("formatNames truncates long lists", () => {
  assert.equal(formatNames(["A", "B"]), "A, B");
  assert.equal(formatNames([]), "");
  assert.equal(
    formatNames(["A", "B", "C", "D", "E", "F", "G", "H"]),
    "A, B, C, D, E, F (+2)"
  );
});
