import test from "node:test";
import assert from "node:assert/strict";
import {
  uid,
  parseListIgnoreNumbers,
  buildClipboardTeams,
  computeAssignments,
} from "../logic.js";

function samplePlayers(count) {
  const positions = ["GK", "DF", "MF", "FW"];
  const nations = ["US", "ES", "BR", "FR"];
  return Array.from({ length: count }, (_, index) => ({
    id: uid(),
    name: `Player ${index + 1}`,
    score: 4 + (index % 5),
    nat: nations[index % nations.length],
    pos1: positions[index % positions.length],
  }));
}

test("parseListIgnoreNumbers removes numeric prefixes", () => {
  const input = "12. Luis Miguel\n7.5 - Jane Smith.\n  33 Carlos\n\n-- invalid";
  const players = parseListIgnoreNumbers(input);
  assert(players.length >= 3);
  assert.equal(players[0].name, "Luis Miguel");
  assert.equal(players[1].name, "Jane Smith");
  assert.equal(players[2].name, "Carlos");
});

test("parseListIgnoreNumbers extracts ratings as scores", () => {
  const input = "8.5 John Doe\n7.1 - Jane Smith\nCarlos\n9,2 Maria";
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

test("buildClipboardTeams outputs CSV style rows", () => {
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
  assert.match(text, /Name,Pos/);
  assert.match(text, /Alice,MF/);
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
