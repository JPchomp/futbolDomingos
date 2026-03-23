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
  assert.match(text, /Team 1/);
  assert.match(text, /Name Pos/);
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
