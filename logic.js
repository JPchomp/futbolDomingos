const RANDOM_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

export function uid(length = 7) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += RANDOM_CHARS[Math.floor(Math.random() * RANDOM_CHARS.length)];
  }
  return out;
}

export function seededShuffle(arr, seed) {
  if (!seed) return [...arr];
  let s = 0;
  for (let i = 0; i < seed.length; i += 1) {
    s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  }
  function rand() {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 2 ** 32;
  }
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function parseListIgnoreNumbers(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let name = line
      .replace(/^\s*\d+(?:[.,]\d+)?\s*(?:[-,:\t ]+)?\s*/i, "")
      .trim();
    name = name.replace(/\./g, "").trim();
    if (!name) continue;
    if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(name)) continue;
    out.push({ id: uid(), name, score: 5, nat: "NA", pos1: "" });
  }
  return out;
}

export function buildClipboardTeams(teams) {
  const lines = [];
  (teams || []).forEach((team, idx) => {
    const label = team?.name ? String(team.name) : `Team ${idx + 1}`;
    lines.push(label);
    const members = team?.members || [];
    const hasAnyPos = members.some((m) => m.pos1 && m.pos1.trim());
    if (hasAnyPos) {
      lines.push("Name,Pos");
      members.forEach((member) => {
        const pos = member.pos1 ? member.pos1.trim() : "";
        if (pos) {
          lines.push(`${member.name},${pos}`);
        } else {
          lines.push(member.name);
        }
      });
    } else {
      lines.push("Name");
      members.forEach((member) => {
        lines.push(member.name);
      });
    }
    lines.push("");
  });
  return lines.join("\n");
}

export function normalizePlayers(rows) {
  return (rows || [])
    .map((row) => {
      const nat = (row.nat || "").trim();
      return {
        ...row,
        name: (row.name || "").trim(),
        nat: nat || "NA",
        pos1: (row.pos1 || "").trim(),
        score: Number.isFinite(Number(row.score)) ? Number(row.score) : 5,
      };
    })
    .filter((row) => row.name);
}

function collectPositions(rows) {
  const set = new Set();
  rows.forEach((row) => {
    if (row.pos1) set.add(row.pos1);
  });
  return Array.from(set).sort();
}

function emptyResult(message) {
  return {
    error: message,
    teams: [],
    targets: [],
    allPos: [],
    subs: [],
    used: 0,
  };
}

export function computeAssignments(players, options = {}, lockedTeam = null) {
  const {
    numTeams = 0,
    teamSize = 0,
    seed = "",
    sameNatWeight = 1,
    posWeight = 2,
    scoreWeight = 1,
  } = options;

  if (numTeams < 1 || teamSize < 1) {
    return emptyResult("Set teams and size.");
  }

  const rows = normalizePlayers(players);
  const needed = numTeams * teamSize;
  if (rows.length < needed) {
    return emptyResult(`Need ${needed} players, have ${rows.length}.`);
  }

  const orderedAll = seededShuffle(
    [...rows].sort(
      (a, b) => b.score - a.score || a.name.localeCompare(b.name)
    ),
    seed
  );
  const pool = orderedAll.slice(0, needed);
  const bench = orderedAll.slice(needed);

  const allPos = collectPositions(pool);
  const posCounts = Object.fromEntries(allPos.map((pos) => [pos, 0]));
  pool.forEach((player) => {
    if (player.pos1) posCounts[player.pos1] = (posCounts[player.pos1] || 0) + 1;
  });

  const targets = Array.from({ length: numTeams }, () => ({}));
  for (const pos of allPos) {
    const total = posCounts[pos] || 0;
    const base = Math.floor(total / numTeams);
    let remainder = total % numTeams;
    for (let teamIndex = 0; teamIndex < numTeams; teamIndex += 1) {
      targets[teamIndex][pos] = base + (teamIndex < remainder ? 1 : 0);
    }
  }

  const teams = Array.from({ length: numTeams }, (_, index) => ({
    name: `Team ${index + 1}`,
    members: [],
    score: 0,
    pos: {},
    nat: {},
    index,
  }));

  const avgScore = pool.reduce((sum, player) => sum + player.score, 0) / numTeams;

  const activeLock =
    lockedTeam && Number.isInteger(lockedTeam.index) && lockedTeam.index < numTeams
      ? lockedTeam
      : null;

  const lockedMembers = activeLock
    ? activeLock.members
        .map((id) => pool.find((player) => player.id === id))
        .filter(Boolean)
    : [];

  const lockedMap = new Map(lockedMembers.map((player) => [player.id, true]));

  lockedMembers.forEach((member) => {
    const team = teams[activeLock.index];
    team.members.push(member);
    team.score += member.score;
    if (member.pos1) {
      team.pos[member.pos1] = (team.pos[member.pos1] || 0) + 1;
    }
    if (member.nat) {
      team.nat[member.nat] = (team.nat[member.nat] || 0) + 1;
    }
  });

  const remaining = pool.filter((player) => !lockedMap.has(player.id));

  function penalty(team, candidate) {
    let total = 0;
    const natCount = team.nat[candidate.nat] || 0;
    total += natCount * sameNatWeight;

    const targetCount = targets[team.index]?.[candidate.pos1] || 0;
    const current = targetCount
      ? (team.pos[candidate.pos1] || 0) / Math.max(1, targetCount)
      : 0;
    total += current * posWeight;

    const projected =
      (team.score + candidate.score) / Math.max(1, team.members.length + 1);
    total += Math.abs(projected - avgScore) * scoreWeight;

    return total;
  }

  const teamOrder = teams.map((team, idx) => ({ team, idx }));

  remaining.forEach((candidate) => {
    teamOrder.sort(
      (a, b) => a.team.members.length - b.team.members.length || a.idx - b.idx
    );
    let best = teamOrder[0];
    let bestPenalty = Infinity;
    teamOrder.forEach(({ team, idx }) => {
      team.index = idx;
      const pen = penalty(team, candidate);
      if (pen < bestPenalty) {
        bestPenalty = pen;
        best = { team, idx };
      }
    });
    const targetTeam = best.team;
    targetTeam.members.push(candidate);
    targetTeam.score += candidate.score;
    if (candidate.pos1) {
      targetTeam.pos[candidate.pos1] =
        (targetTeam.pos[candidate.pos1] || 0) + 1;
    }
    if (candidate.nat) {
      targetTeam.nat[candidate.nat] =
        (targetTeam.nat[candidate.nat] || 0) + 1;
    }
  });

  const subs = teams.map((team) => ({
    teamName: team.name,
    players: [],
    score: 0,
  }));

  bench.forEach((player) => {
    let targetIndex = 0;
    let bestScore = Infinity;
    subs.forEach((group, idx) => {
      const projected = teams[idx].score + group.score + player.score;
      if (projected < bestScore) {
        bestScore = projected;
        targetIndex = idx;
      }
    });
    const targetGroup = subs[targetIndex];
    targetGroup.players.push(player);
    targetGroup.score += player.score;
  });

  return {
    error: null,
    teams: teams.map(({ index, ...rest }) => rest),
    targets,
    allPos,
    subs,
    used: pool.length,
  };
}

if (typeof console !== "undefined") {
  const parsed = parseListIgnoreNumbers(
    "12. Luis Miguel\n7.5 - Jane Smith.\n...\n  33 Carlos"
  );
  console.assert(parsed.length === 3, "parseListIgnoreNumbers keeps 3 valid names");
  console.assert(parsed[0].name === "Luis Miguel", "First name cleaned");

  const shuffled = seededShuffle([1, 2, 3, 4], "x");
  console.assert(Array.isArray(shuffled) && shuffled.length === 4, "seededShuffle returns array");

  const clip = buildClipboardTeams([
    { name: "Team 1", members: [{ name: "A", pos1: "D" }, { name: "B", pos1: "M" }] },
    { name: "Team 2", members: [{ name: "C", pos1: "F" }] },
  ]);
  console.assert(
    clip.includes("Team 1") && clip.includes("Name,Pos") && clip.includes("A,D"),
    "Clipboard base format ok"
  );

  const clipNoPos = buildClipboardTeams([
    { name: "Team 3", members: [{ name: "X", pos1: "" }, { name: "Y", pos1: "" }] },
  ]);
  console.assert(
    clipNoPos.includes("Team 3") && clipNoPos.includes("Name\nX\nY"),
    "Clipboard no-pos format ok"
  );
}
