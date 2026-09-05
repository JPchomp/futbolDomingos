import test from "node:test";
import assert from "node:assert/strict";
import {
  uid,
  parseList,
  parseListIgnoreNumbers,
  buildClipboardTeams,
  buildClipboardTeamsWithScores,
  buildClipboardPlayers,
  computeAssignments,
  matchPlayersFromDatabase,
  updateDatabase,
  removeFromDatabase,
  sanitizeDatabase,
  normalizePlayers,
  collectRosterWarnings,
  coerceScore,
  DEFAULT_SCORE,
  MIN_SCORE,
  MAX_SCORE,
} from "../logic.js";

function samplePlayers(count) {
  const positions = ["GK", "DF", "MF", "FW"];
  return Array.from({ length: count }, (_, index) => ({
    id: uid(),
    name: `Player ${index + 1}`,
    score: 4 + (index % 5),
    pos1: positions[index % positions.length],
  }));
}

test("parseListIgnoreNumbers removes numeric prefixes", () => {
  const input = "1 Luis Miguel 7.5\n2. Jane Smith 8.0\n3 Carlos";
  const players = parseListIgnoreNumbers(input);
  assert.equal(players.length, 3);
  assert.equal(players[0].name, "Luis Miguel");
  assert.equal(players[0].score, 7.5);
  assert.equal(players[1].name, "Jane Smith");
  assert.equal(players[1].score, 8.0);
  assert.equal(players[2].name, "Carlos");
  assert.equal(players[2].score, 5); // default score when no score provided
});

test("parseListIgnoreNumbers extracts ratings as scores", () => {
  const input = "1 John Doe 8.5\n2 Jane Smith 7.1\n3 Carlos\n4 Maria 9,2";
  const players = parseListIgnoreNumbers(input);
  assert.equal(players.length, 4);
  assert.equal(players[0].name, "John Doe");
  assert.equal(players[0].score, 8.5);
  assert.equal(players[1].name, "Jane Smith");
  assert.equal(players[1].score, 7.1);
  assert.equal(players[2].name, "Carlos");
  assert.equal(players[2].score, 5); // default score
  assert.equal(players[3].name, "Maria");
  assert.equal(players[3].score, 9.2); // comma converted to period
});

test("buildClipboardTeams outputs space-separated rows", () => {
  const teams = [
    {
      name: "Team 1",
      members: [
        { id: "a", name: "Alice", pos1: "MF" },
        { id: "b", name: "Bob", pos1: "DF" },
      ],
    },
  ];
  const text = buildClipboardTeams(teams);
  assert.match(text, /Team 1 - White/);
  assert.doesNotMatch(text, /Name Pos/);
  assert.match(text, /Alice MF/);
  assert.doesNotMatch(text, /Name,Pos/);
  assert.doesNotMatch(text, /Alice,MF/);
});

test("buildClipboardTeamsWithScores outputs team score and player scores", () => {
  const teams = [
    {
      name: "Team 1",
      score: 15.5,
      members: [
        { id: "a", name: "Alice", pos1: "MF", score: 8 },
        { id: "b", name: "Bob", pos1: "DF", score: 7.5 },
      ],
    },
    {
      name: "Team 2",
      score: 12,
      members: [
        { id: "c", name: "Carlos", pos1: "", score: 6 },
      ],
    },
  ];
  const text = buildClipboardTeamsWithScores(teams);
  assert.match(text, /Team 1 15\.5/);
  assert.match(text, /Alice MF 8/);
  assert.match(text, /Bob DF 7\.5/);
  assert.match(text, /Team 2 12\.0/);
  assert.match(text, /Carlos 6/);
});

test("computeAssignments creates balanced teams and subs", () => {
  const players = samplePlayers(14);
  const result = computeAssignments(players, {
    numTeams: 3,
    teamSize: 4,
    seed: "demo",
    posWeight: 1,
    scoreWeight: 1,
  });
  assert.equal(result.error, null);
  assert.equal(result.teams.length, 3);
  result.teams.forEach((team) => {
    assert.equal(team.members.length, 4);
  });
  assert.equal(result.subs.reduce((sum, group) => sum + group.players.length, 0), 2);
  assert.equal(result.subs.length, 3);
});

test("computeAssignments respects locked team members", () => {
  const players = samplePlayers(8);
  const locked = { index: 0, members: [players[0].id, players[1].id] };
  const result = computeAssignments(players, {
    numTeams: 2,
    teamSize: 4,
    seed: "lock",
    posWeight: 1,
    scoreWeight: 1,
  }, locked);
  assert.equal(result.error, null);
  const teamOneIds = result.teams[0].members.map((member) => member.id);
  assert(teamOneIds.includes(players[0].id));
  assert(teamOneIds.includes(players[1].id));
});

test("computeAssignments minimizes total score discrepancy between teams", () => {
  // Players with a wide score range (10 down to 3): total = 52, optimal split = 26/26.
  const players = Array.from({ length: 8 }, (_, i) => ({
    id: String(i + 1),
    name: `Player ${i + 1}`,
    score: 10 - i,
    pos1: "",
  }));
  const result = computeAssignments(players, {
    numTeams: 2,
    teamSize: 4,
    seed: "",
    posWeight: 0,
    scoreWeight: 1,
  });
  assert.equal(result.error, null);
  const scores = result.teams.map((t) => t.score);
  const maxDiff = Math.max(...scores) - Math.min(...scores);
  assert.equal(maxDiff, 0, `Score difference ${maxDiff} should be 0 for evenly distributable scores`);
});

test("computeAssignments keeps score discrepancy small for 3 teams", () => {
  // 12 players, scores 1.0–6.5 in 0.5 steps, total = 45, optimal split = 15 each.
  const players = Array.from({ length: 12 }, (_, i) => ({
    id: String(i + 1),
    name: `Player ${i + 1}`,
    score: 1 + i * 0.5,
    pos1: "",
  }));
  const result = computeAssignments(players, {
    numTeams: 3,
    teamSize: 4,
    seed: "",
    posWeight: 0,
    scoreWeight: 1,
  });
  assert.equal(result.error, null);
  const scores = result.teams.map((t) => t.score);
  const maxDiff = Math.max(...scores) - Math.min(...scores);
  assert.ok(maxDiff <= 1, `Score difference ${maxDiff} should be ≤ 1 for scores 1–12 into 3 teams`);
});

test("buildClipboardPlayers outputs tab-delimited rows with name, pos, score", () => {
  const players = [
    { id: "a", name: "Alice", pos1: "MF", score: 7.5 },
    { id: "b", name: "Bob", pos1: "", score: 5 },
    { id: "c", name: "Carlos", pos1: "GK", score: 9 },
  ];
  const text = buildClipboardPlayers(players);
  const lines = text.split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "Alice\tMF\t7.5");
  assert.equal(lines[1], "Bob\t\t5");
  assert.equal(lines[2], "Carlos\tGK\t9");
});

test("parseListIgnoreNumbers handles tab-delimited format with positions", () => {
  const input = "Alice\tMF\t7.5\nBob\t\t5\nCarlos\tGK\t9";
  const players = parseListIgnoreNumbers(input);
  assert.equal(players.length, 3);
  assert.equal(players[0].name, "Alice");
  assert.equal(players[0].pos1, "MF");
  assert.equal(players[0].score, 7.5);
  assert.equal(players[1].name, "Bob");
  assert.equal(players[1].pos1, "");
  assert.equal(players[1].score, 5);
  assert.equal(players[2].name, "Carlos");
  assert.equal(players[2].pos1, "GK");
  assert.equal(players[2].score, 9);
});

test("buildClipboardPlayers round-trips through parseListIgnoreNumbers", () => {
  const original = [
    { id: "a", name: "John Doe", pos1: "DF", score: 8 },
    { id: "b", name: "Jane Smith", pos1: "FW", score: 7.5 },
    { id: "c", name: "Carlos", pos1: "", score: 5 },
  ];
  const text = buildClipboardPlayers(original);
  const parsed = parseListIgnoreNumbers(text);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].name, "John Doe");
  assert.equal(parsed[0].pos1, "DF");
  assert.equal(parsed[0].score, 8);
  assert.equal(parsed[1].name, "Jane Smith");
  assert.equal(parsed[1].pos1, "FW");
  assert.equal(parsed[1].score, 7.5);
  assert.equal(parsed[2].name, "Carlos");
  assert.equal(parsed[2].pos1, "");
  assert.equal(parsed[2].score, 5);
});

test("matchPlayersFromDatabase enriches matching players from db", () => {
  const db = [
    { name: "Alice", score: 9, pos1: "GK" },
    { name: "Bob", score: 7.5, pos1: "DF" },
  ];
  const parsed = [
    { id: "a", name: "Alice", score: 5, pos1: "" },
    { id: "b", name: "Bob", score: 5, pos1: "" },
    { id: "c", name: "Carlos", score: 5, pos1: "" },
  ];
  const result = matchPlayersFromDatabase(parsed, db);
  assert.equal(result[0].score, 9);
  assert.equal(result[0].pos1, "GK");
  assert.equal(result[1].score, 7.5);
  assert.equal(result[1].pos1, "DF");
  assert.equal(result[2].score, 5);
  assert.equal(result[2].pos1, "");
});

test("matchPlayersFromDatabase is case-insensitive", () => {
  const db = [{ name: "Alice", score: 9, pos1: "GK" }];
  const parsed = [{ id: "a", name: "alice", score: 5, pos1: "" }];
  const result = matchPlayersFromDatabase(parsed, db);
  assert.equal(result[0].score, 9);
});

test("updateDatabase creates new entries and updates existing ones", () => {
  const db = [
    { name: "Alice", score: 9, pos1: "GK" },
  ];
  const players = [
    { id: "a", name: "Alice", score: 8, pos1: "DF" },
    { id: "b", name: "Bob", score: 7, pos1: "MF" },
  ];
  const result = updateDatabase(players, db);
  assert.equal(result.length, 2);
  const alice = result.find((e) => e.name === "Alice");
  assert.equal(alice.score, 8);
  assert.equal(alice.pos1, "DF");
  const bob = result.find((e) => e.name === "Bob");
  assert.equal(bob.score, 7);
  assert.equal(bob.pos1, "MF");
});

test("updateDatabase is case-insensitive when matching existing entries", () => {
  const db = [{ name: "Alice", score: 9, pos1: "GK" }];
  const players = [{ id: "a", name: "alice", score: 6, pos1: "FW" }];
  const result = updateDatabase(players, db);
  assert.equal(result.length, 1);
  assert.equal(result[0].score, 6);
  assert.equal(result[0].pos1, "FW");
});

// ---------------------------------------------------------------------------
// Input validation — these used to throw out of render and blank the app.
// ---------------------------------------------------------------------------

test("computeAssignments returns an error instead of throwing on a fractional team size", () => {
  const players = samplePlayers(10);
  const result = computeAssignments(players, { numTeams: 2, teamSize: 2.5, seed: "s" });
  assert.equal(result.errorCode, "wholeNumbers");
  assert.deepEqual(result.teams, []);
});

test("computeAssignments returns an error instead of throwing on a fractional team count", () => {
  const players = samplePlayers(10);
  const result = computeAssignments(players, { numTeams: 2.5, teamSize: 2, seed: "s" });
  assert.equal(result.errorCode, "wholeNumbers");
});

test("computeAssignments tolerates a duplicated id in the lock", () => {
  const players = samplePlayers(10);
  const locked = { index: 0, members: [players[0].id, players[0].id, players[1].id] };
  const result = computeAssignments(players, { numTeams: 2, teamSize: 5, seed: "s" }, locked);
  assert.equal(result.error, null);
  result.teams.forEach((team) => assert.equal(team.members.length, 5));
});

test("computeAssignments reports a lock aimed at a team that no longer exists", () => {
  const players = samplePlayers(10);
  const locked = { index: 3, members: [players[0].id] };
  const result = computeAssignments(players, { numTeams: 2, teamSize: 5, seed: "s" }, locked);
  assert.equal(result.error, null);
  assert.ok(result.warnings.some((w) => w.code === "lockIgnored"));
});

// ---------------------------------------------------------------------------
// Seeding rule: the top `numTeams` players go one per team.
// ---------------------------------------------------------------------------

test("the highest-rated players are spread one per team", () => {
  const players = [
    { id: "s1", name: "Star A", score: 10, pos1: "" },
    { id: "s2", name: "Star B", score: 9.5, pos1: "" },
    { id: "s3", name: "Star C", score: 9, pos1: "" },
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `r${i}`,
      name: `Rest ${i}`,
      score: 4,
      pos1: "",
    })),
  ];
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = computeAssignments(players, {
      numTeams: 3,
      teamSize: 4,
      seed: `seed-${attempt}`,
    });
    assert.equal(result.error, null);
    result.teams.forEach((team) => {
      const stars = team.members.filter((m) => m.id.startsWith("s")).length;
      assert.equal(stars, 1, `every team gets exactly one of the top 3 (attempt ${attempt})`);
    });
  }
});

test("seeding can be turned off", () => {
  const players = Array.from({ length: 8 }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    score: 10,
    pos1: "",
  }));
  const result = computeAssignments(players, {
    numTeams: 2,
    teamSize: 4,
    seed: "x",
    seedTopPlayers: false,
  });
  assert.equal(result.error, null);
  assert.equal(result.seededIds.length, 0);
});

test("the seeding rule survives the balancing swaps", () => {
  // Star scores differ enough that a score-only swap phase would happily move
  // them onto the same team to level the totals.
  const players = [
    { id: "s1", name: "Star A", score: 10, pos1: "" },
    { id: "s2", name: "Star B", score: 6, pos1: "" },
    { id: "a", name: "A", score: 5, pos1: "" },
    { id: "b", name: "B", score: 5, pos1: "" },
    { id: "c", name: "C", score: 1, pos1: "" },
    { id: "d", name: "D", score: 1, pos1: "" },
  ];
  const result = computeAssignments(players, { numTeams: 2, teamSize: 3, seed: "y" });
  assert.equal(result.error, null);
  result.teams.forEach((team) => {
    assert.equal(team.members.filter((m) => m.id.startsWith("s")).length, 1);
  });
});

// ---------------------------------------------------------------------------
// Positions survive the balancing phase.
// ---------------------------------------------------------------------------

test("one goalkeeper per team when there are exactly as many keepers as teams", () => {
  const roster = [
    { name: "GK A", score: 6, pos1: "GK" },
    { name: "GK B", score: 5.5, pos1: "GK" },
    { name: "GK C", score: 6.5, pos1: "GK" },
    { name: "GK D", score: 5, pos1: "GK" },
    ...Array.from({ length: 16 }, (_, i) => ({
      name: `Field ${i}`,
      score: 3 + ((i * 0.37) % 6),
      pos1: "FL",
    })),
  ];
  let correct = 0;
  const attempts = 60;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const players = roster.map((row, i) => ({ ...row, id: `p${i}` }));
    const result = computeAssignments(players, {
      numTeams: 4,
      teamSize: 5,
      seed: `gk-${attempt}`,
      posWeight: 1,
      scoreWeight: 1,
    });
    assert.equal(result.error, null);
    const counts = result.teams.map((t) => t.members.filter((m) => m.pos1 === "GK").length);
    if (counts.every((c) => c === 1)) correct += 1;
  }
  // Before the fix this sat at roughly 25%.
  assert.ok(
    correct / attempts >= 0.9,
    `expected at least 90% of runs to give every team a keeper, got ${correct}/${attempts}`
  );
});

test("position counts are tracked case-insensitively", () => {
  const players = [
    { id: "1", name: "A", score: 5, pos1: "gk" },
    { id: "2", name: "B", score: 5, pos1: "GK" },
    { id: "3", name: "C", score: 5, pos1: " Gk " },
    { id: "4", name: "D", score: 5, pos1: "DF" },
  ];
  const result = computeAssignments(players, { numTeams: 2, teamSize: 2, seed: "" });
  assert.equal(result.error, null);
  assert.deepEqual(result.allPos, ["DF", "GK"]);
});

// ---------------------------------------------------------------------------
// The lock actually holds.
// ---------------------------------------------------------------------------

test("locked players always make the field, even when reshuffled", () => {
  const players = Array.from({ length: 12 }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    score: 5 + (i % 4),
    pos1: "",
  }));
  const locked = { index: 0, members: ["p0", "p1", "p2", "p3", "p4"] };
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = computeAssignments(
      players,
      { numTeams: 2, teamSize: 5, seed: `shuffle-${attempt}` },
      locked
    );
    assert.equal(result.error, null);
    const ids = result.teams[0].members.map((m) => m.id);
    locked.members.forEach((id) =>
      assert.ok(ids.includes(id), `${id} kept on attempt ${attempt}`)
    );
  }
});

test("a lock referring to deleted players is reported, not silently shrunk", () => {
  const players = Array.from({ length: 10 }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    score: 5,
    pos1: "",
  }));
  const result = computeAssignments(
    players,
    { numTeams: 2, teamSize: 5, seed: "s" },
    { index: 0, members: ["ghost-1", "ghost-2", "p0"] }
  );
  assert.equal(result.error, null);
  const warning = result.warnings.find((w) => w.code === "lockedMissing");
  assert.ok(warning);
  assert.equal(warning.count, 2);
});

test("locking a stacked team warns about the resulting imbalance", () => {
  const players = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, score: 10, pos1: "" })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `w${i}`, name: `W${i}`, score: 2, pos1: "" })),
  ];
  const result = computeAssignments(
    players,
    { numTeams: 2, teamSize: 5, seed: "s" },
    { index: 0, members: ["s0", "s1", "s2", "s3", "s4"] }
  );
  assert.equal(result.error, null);
  assert.ok(result.warnings.some((w) => w.code === "lockedImbalance"));
});

// ---------------------------------------------------------------------------
// Subs are shared out evenly.
// ---------------------------------------------------------------------------

test("subs never differ by more than one per team", () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const players = Array.from({ length: 17 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      score: 3 + ((i * 1.7) % 6),
      pos1: "",
    }));
    const result = computeAssignments(players, {
      numTeams: 3,
      teamSize: 5,
      seed: `subs-${attempt}`,
    });
    assert.equal(result.error, null);
    const counts = result.subs.map((s) => s.players.length);
    assert.ok(
      Math.max(...counts) - Math.min(...counts) <= 1,
      `sub counts ${counts} should differ by at most 1`
    );
  }
});

// ---------------------------------------------------------------------------
// Score handling.
// ---------------------------------------------------------------------------

test("a blank score falls back to the default, not zero", () => {
  assert.equal(coerceScore("").score, DEFAULT_SCORE);
  assert.equal(coerceScore("   ").score, DEFAULT_SCORE);
  assert.equal(coerceScore(null).score, DEFAULT_SCORE);
  assert.equal(coerceScore(undefined).score, DEFAULT_SCORE);
  assert.equal(normalizePlayers([{ name: "X", score: "" }])[0].score, DEFAULT_SCORE);
});

test("scores are clamped to the rating scale", () => {
  assert.equal(coerceScore(999999).score, MAX_SCORE);
  assert.equal(coerceScore(-3).score, MIN_SCORE);
  assert.equal(coerceScore(999999).status, "clamped");
});

test("out-of-range trailing numbers are not treated as ratings", () => {
  const { players, warnings } = parseList("Juan 0612345678\nPedro 85\nAna 8.5");
  assert.equal(players[0].name, "Juan");
  assert.equal(players[0].score, DEFAULT_SCORE);
  assert.equal(players[0].hasScore, false);
  assert.equal(players[1].name, "Pedro");
  assert.equal(players[1].score, DEFAULT_SCORE);
  assert.equal(players[2].name, "Ana");
  assert.equal(players[2].score, 8.5);
  assert.ok(warnings.some((w) => w.code === "scoreOutOfRange"));
});

test("a negative trailing number is rejected rather than silently made positive", () => {
  const players = parseListIgnoreNumbers("Bad -3");
  assert.equal(players[0].name, "Bad");
  assert.equal(players[0].score, DEFAULT_SCORE);
});

test("a trailing period does not become part of the name", () => {
  const players = parseListIgnoreNumbers("Ana 7.");
  assert.equal(players[0].name, "Ana");
  assert.equal(players[0].score, 7);
});

test("clamped and blank scores are reported", () => {
  const warnings = collectRosterWarnings([
    { name: "High", score: 50 },
    { name: "Blank", score: "" },
    { name: "Fine", score: 6 },
  ]);
  assert.ok(warnings.some((w) => w.code === "scoreClamped" && w.names.includes("High")));
  assert.ok(warnings.some((w) => w.code === "scoreMissing" && w.names.includes("Blank")));
});

test("duplicate names are reported", () => {
  const warnings = collectRosterWarnings([
    { name: "Juan", score: 8 },
    { name: "juan", score: 3 },
  ]);
  assert.ok(warnings.some((w) => w.code === "duplicateNames"));
});

// ---------------------------------------------------------------------------
// Clipboard round-trips.
// ---------------------------------------------------------------------------

test("copy-teams-with-scores round-trips back into players", () => {
  const teams = [
    {
      name: "Team 1",
      score: 15,
      members: [
        { id: "a", name: "Juan", pos1: "GK", score: 7.5 },
        { id: "b", name: "Ana", pos1: "DF", score: 7.5 },
      ],
    },
    {
      name: "Team 2",
      score: 6,
      members: [{ id: "c", name: "Pedro", pos1: "MF", score: 6 }],
    },
  ];
  const parsed = parseListIgnoreNumbers(buildClipboardTeamsWithScores(teams));
  assert.equal(parsed.length, 3);
  assert.deepEqual(
    parsed.map((p) => [p.name, p.pos1, p.score]),
    [
      ["Juan", "GK", 7.5],
      ["Ana", "DF", 7.5],
      ["Pedro", "MF", 6],
    ]
  );
});

test("copy-teams round-trips names and positions", () => {
  const teams = [
    {
      name: "Team 1",
      members: [
        { id: "a", name: "Juan", pos1: "GK" },
        { id: "b", name: "Ana Maria", pos1: "DF" },
      ],
    },
  ];
  const parsed = parseListIgnoreNumbers(buildClipboardTeams(teams));
  assert.deepEqual(
    parsed.map((p) => [p.name, p.pos1]),
    [
      ["Juan", "GK"],
      ["Ana Maria", "DF"],
    ]
  );
});

test("a single-letter trailing token is kept as part of the name", () => {
  const players = parseListIgnoreNumbers("Juan A 7");
  assert.equal(players[0].name, "Juan A");
  assert.equal(players[0].pos1, "");
});

// ---------------------------------------------------------------------------
// Database.
// ---------------------------------------------------------------------------

test("database matching ignores accents and repeated spaces", () => {
  const db = [{ name: "José Muñoz", score: 8.5, pos1: "FW" }];
  const parsed = parseListIgnoreNumbers("Jose Munoz\nJosé  Muñoz");
  const result = matchPlayersFromDatabase(parsed, db);
  assert.equal(result[0].score, 8.5);
  assert.equal(result[1].score, 8.5);
});

test("an explicitly pasted score beats the stored one", () => {
  const db = [{ name: "Juan", score: 3, pos1: "GK" }];
  const [player] = matchPlayersFromDatabase(parseListIgnoreNumbers("Juan 9"), db);
  assert.equal(player.score, 9);
  assert.equal(player.pos1, "GK", "a position the paste did not supply is still filled in");
});

test("a database match does not overwrite a position typed by hand", () => {
  const db = [{ name: "Juan", score: 7, pos1: "GK" }];
  const [player] = matchPlayersFromDatabase([{ id: "1", name: "Juan", pos1: "DF" }], db);
  assert.equal(player.pos1, "DF");
  assert.equal(player.score, 7);
});

test("a database entry missing fields does not strip the player", () => {
  const [player] = matchPlayersFromDatabase(
    [{ id: "1", name: "Juan", score: 9, pos1: "FW" }],
    [{ name: "Juan" }]
  );
  assert.equal(player.pos1, "FW");
  assert.ok(Number.isFinite(player.score));
});

test("a corrupted database shape does not throw", () => {
  assert.deepEqual(sanitizeDatabase({}), []);
  assert.deepEqual(sanitizeDatabase("junk"), []);
  assert.deepEqual(sanitizeDatabase(null), []);
  assert.deepEqual(matchPlayersFromDatabase([{ id: "1", name: "a" }], {}), [
    { id: "1", name: "a", matched: false },
  ]);
  assert.deepEqual(sanitizeDatabase([{ name: "Juan", score: "oops" }]), [
    { name: "Juan", score: DEFAULT_SCORE, pos1: "" },
  ]);
});

test("uploading a cleared score stores the default, not zero", () => {
  const db = updateDatabase([{ name: "Juan", score: "" }], []);
  assert.equal(db[0].score, DEFAULT_SCORE);
});

test("removeFromDatabase drops one entry by name", () => {
  const db = [
    { name: "Juan", score: 7, pos1: "" },
    { name: "Ana", score: 8, pos1: "" },
  ];
  const result = removeFromDatabase("juan", db);
  assert.deepEqual(
    result.map((e) => e.name),
    ["Ana"]
  );
});
