import test from "node:test";
import assert from "node:assert/strict";
import {
  uid,
  parseListIgnoreNumbers,
  buildClipboardTeams,
  buildClipboardTeamsWithScores,
  buildClipboardPlayers,
  computeAssignments,
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
  // 12 players, scores 1–12, total = 78, optimal split = 26 each.
  const players = Array.from({ length: 12 }, (_, i) => ({
    id: String(i + 1),
    name: `Player ${i + 1}`,
    score: i + 1,
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

test("computeAssignments balances per-position scores across teams", () => {
  // 8 players split evenly: 4 DF and 4 MF, each position has scores 10,9,6,5.
  // Optimal split for each position: both teams get two players totalling 15 each.
  const players = [
    { id: "1", name: "DF1", score: 10, pos1: "DF" },
    { id: "2", name: "DF2", score: 9,  pos1: "DF" },
    { id: "3", name: "DF3", score: 6,  pos1: "DF" },
    { id: "4", name: "DF4", score: 5,  pos1: "DF" },
    { id: "5", name: "MF1", score: 10, pos1: "MF" },
    { id: "6", name: "MF2", score: 9,  pos1: "MF" },
    { id: "7", name: "MF3", score: 6,  pos1: "MF" },
    { id: "8", name: "MF4", score: 5,  pos1: "MF" },
  ];
  const result = computeAssignments(players, {
    numTeams: 2,
    teamSize: 4,
    seed: "",
    posWeight: 5,
    scoreWeight: 1,
  });
  assert.equal(result.error, null);
  assert.equal(result.teams.length, 2);
  // Each team should have posScore close to 15 for DF and 15 for MF.
  result.teams.forEach((team) => {
    assert.ok(team.posScore !== undefined, "team.posScore should be defined");
  });
  const dfScores = result.teams.map((t) => t.posScore?.DF || 0);
  const mfScores = result.teams.map((t) => t.posScore?.MF || 0);
  const dfDiff = Math.abs(dfScores[0] - dfScores[1]);
  const mfDiff = Math.abs(mfScores[0] - mfScores[1]);
  assert.ok(dfDiff <= 1, `DF score difference ${dfDiff} should be ≤ 1`);
  assert.ok(mfDiff <= 1, `MF score difference ${mfDiff} should be ≤ 1`);
});

test("computeAssignments does not crash with only one player of a position across many teams", () => {
  // 1 GK for 4 teams — the GK cannot be distributed evenly, but the algorithm must not crash.
  const players = [
    { id: "1",  name: "GK1",  score: 8, pos1: "GK" },
    ...Array.from({ length: 15 }, (_, i) => ({
      id: String(i + 2),
      name: `DF${i + 1}`,
      score: 5 + (i % 4),
      pos1: "DF",
    })),
  ];
  let result;
  assert.doesNotThrow(() => {
    result = computeAssignments(players, {
      numTeams: 4,
      teamSize: 4,
      seed: "edge",
      posWeight: 5,
      scoreWeight: 1,
    });
  });
  assert.equal(result.error, null);
  assert.equal(result.teams.length, 4);
  result.teams.forEach((team) => {
    assert.equal(team.members.length, 4);
    assert.ok(team.posScore !== undefined, "team.posScore should be defined");
  });
  // The single GK must end up on exactly one team.
  const gkCounts = result.teams.map((t) => t.members.filter((m) => m.pos1 === "GK").length);
  assert.equal(gkCounts.reduce((a, b) => a + b, 0), 1, "Exactly 1 GK across all teams");
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
