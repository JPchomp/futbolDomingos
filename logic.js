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

    // Tab-delimited format: name\tpos\tscore (produced by buildClipboardPlayers)
    if (line.includes("\t")) {
      const parts = line.split("\t");
      let name = (parts[0] || "").replace(/\./g, "").trim();
      const pos1 = (parts[1] || "").trim();
      const scoreStr = (parts[2] || "").replace(",", ".").trim();
      const score = scoreStr ? parseFloat(scoreStr) : 5;
      if (!name) continue;
      if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(name)) continue;
      out.push({ id: uid(), name, score: Number.isFinite(score) ? score : 5, pos1 });
      continue;
    }

    // Match optional list number at the beginning (to be discarded)
    // Pattern: optional whitespace, digits (no decimal), optional separators (., -, :, tab, space)
    const listNumberMatch = line.match(/^\s*(\d+)\s*[.\-:\t ]*\s*/);
    let remainingLine = line;
    
    if (listNumberMatch) {
      // Remove the list number from the line
      remainingLine = line.substring(listNumberMatch[0].length).trim();
    }
    
    // Now try to extract score from the END of the line
    // Pattern: optional whitespace, optional separator, digits with optional decimal (comma or period), optional whitespace at end
    const scoreMatch = remainingLine.match(/\s*(?:[-,:\t ]*)(\d+(?:[.,]\d+)?)\s*$/);
    let score = 5; // default score
    let name = remainingLine;
    
    if (scoreMatch) {
      // Extract the score and convert comma to period for decimal
      const scoreStr = scoreMatch[1].replace(',', '.');
      score = parseFloat(scoreStr);
      // Remove the score from the line to get the name
      name = remainingLine.substring(0, remainingLine.length - scoreMatch[0].length).trim();
    }
    
    // Remove periods from name
    name = name.replace(/\./g, "").trim();
    if (!name) continue;
    if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(name)) continue;
    out.push({ id: uid(), name, score, pos1: "" });
  }
  return out;
}

const SHIRT_COLORS = ["White", "Black", "Orange", "Yellow"];

export function buildClipboardTeams(teams) {
  const lines = [];
  (teams || []).forEach((team, idx) => {
    const label = team?.name ? String(team.name) : `Team ${idx + 1}`;
    const color = SHIRT_COLORS[idx % SHIRT_COLORS.length];
    lines.push(`${label} - ${color}`);
    const members = team?.members || [];
    const hasAnyPos = members.some((m) => m.pos1 && m.pos1.trim());
    if (hasAnyPos) {
      members.forEach((member) => {
        const pos = member.pos1 ? member.pos1.trim() : "";
        lines.push(pos ? `${member.name} ${pos}` : member.name);
      });
    } else {
      members.forEach((member) => {
        lines.push(member.name);
      });
    }
    lines.push("");
  });
  return lines.join("\n");
}

export function buildClipboardTeamsWithScores(teams) {
  const lines = [];
  (teams || []).forEach((team, idx) => {
    const label = team?.name ? String(team.name) : `Team ${idx + 1}`;
    const totalScore = (team?.score || 0).toFixed(1);
    lines.push(`${label} ${totalScore}`);
    const members = team?.members || [];
    const hasAnyPos = members.some((m) => m.pos1 && m.pos1.trim());
    if (hasAnyPos) {
      members.forEach((member) => {
        const pos = member.pos1 ? member.pos1.trim() : "";
        const playerScore = Number.isFinite(Number(member.score)) ? Number(member.score).toFixed(1) : "5.0";
        lines.push(pos ? `${member.name} ${pos} ${playerScore}` : `${member.name} ${playerScore}`);
      });
    } else {
      members.forEach((member) => {
        const playerScore = Number.isFinite(Number(member.score)) ? Number(member.score).toFixed(1) : "5.0";
        lines.push(`${member.name} ${playerScore}`);
      });
    }
    lines.push("");
  });
  return lines.join("\n");
}

export function buildClipboardPlayers(players) {
  return (players || [])
    .map((player) => {
      const name = (player.name || "").trim();
      const pos1 = (player.pos1 || "").trim();
      const score = Number.isFinite(Number(player.score)) ? Number(player.score) : 5;
      return `${name}\t${pos1}\t${score}`;
    })
    .join("\n");
}

export function normalizePlayers(rows) {
  return (rows || [])
    .map((row) => {
      return {
        ...row,
        name: (row.name || "").trim(),
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
    index,
  }));

  const avgScore =
    pool.reduce((sum, player) => sum + player.score, 0) / numTeams;

  const activeLock =
    lockedTeam &&
    Number.isInteger(lockedTeam.index) &&
    lockedTeam.index < numTeams
      ? lockedTeam
      : null;

  const lockedMembers = activeLock
    ? activeLock.members
        .map((id) => pool.find((player) => player.id === id))
        .filter(Boolean)
    : [];

  if (lockedMembers.length > teamSize) {
    return emptyResult("Locked team exceeds team size.");
  }

  const lockedMap = new Map(lockedMembers.map((player) => [player.id, true]));

  lockedMembers.forEach((member) => {
    const team = teams[activeLock.index];
    team.members.push(member);
    team.score += member.score;
    if (member.pos1) {
      team.pos[member.pos1] = (team.pos[member.pos1] || 0) + 1;
    }
  });

  const remaining = pool.filter((player) => !lockedMap.has(player.id));

  function penalty(team, candidate) {
    let total = 0;

    const targetCount = targets[team.index]?.[candidate.pos1] || 0;
    const current = targetCount
      ? (team.pos[candidate.pos1] || 0) / targetCount
      : 0;
    total += current * posWeight;

    // Use quadratic penalty on total team score vs the proportional target.
    // This heavily penalizes large score discrepancies between teams.
    const projectedTotal = team.score + candidate.score;
    const partialTarget = avgScore * (team.members.length + 1) / teamSize;
    const diff = projectedTotal - partialTarget;
    total += diff * diff * scoreWeight;

    return total;
  }

  const teamOrder = teams.map((team, idx) => ({ team, idx }));

  remaining.forEach((candidate) => {
    const eligible = teamOrder.filter(
      ({ team }) => team.members.length < teamSize
    );

    if (eligible.length === 0) {
      throw new Error("No team can accept more players.");
    }

    let best = eligible[0];
    let bestPenalty = Infinity;

    eligible.forEach(({ team, idx }) => {
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
  });

  // HARD INVARIANT: exact size
  teams.forEach((team) => {
    if (team.members.length !== teamSize) {
      throw new Error(
        `${team.name} has ${team.members.length}, expected ${teamSize}`
      );
    }
  });

  // Post-processing: iteratively swap non-locked players between teams to
  // minimize the maximum total-score difference between any two teams.
  function improveBalance() {
    let improved = true;
    while (improved) {
      improved = false;
      const scores = teams.map((t) => t.score);
      const maxDiff = Math.max(...scores) - Math.min(...scores);
      if (maxDiff === 0) break;

      for (let i = 0; i < teams.length && !improved; i += 1) {
        for (let j = i + 1; j < teams.length && !improved; j += 1) {
          const ti = teams[i];
          const tj = teams[j];
          for (let pi = 0; pi < ti.members.length && !improved; pi += 1) {
            const playerI = ti.members[pi];
            if (lockedMap.has(playerI.id)) continue;
            for (let pj = 0; pj < tj.members.length && !improved; pj += 1) {
              const playerJ = tj.members[pj];
              if (lockedMap.has(playerJ.id)) continue;
              const ni = ti.score - playerI.score + playerJ.score;
              const nj = tj.score - playerJ.score + playerI.score;
              // Compute new max-diff without allocating a new array.
              let newMax = -Infinity;
              let newMin = Infinity;
              for (let k = 0; k < scores.length; k += 1) {
                const s = k === i ? ni : k === j ? nj : scores[k];
                if (s > newMax) newMax = s;
                if (s < newMin) newMin = s;
              }
              if (newMax - newMin < maxDiff) {
                ti.members[pi] = playerJ;
                ti.score = ni;
                tj.members[pj] = playerI;
                tj.score = nj;
                improved = true;
              }
            }
          }
        }
      }
    }

    // Recalculate position tracking to reflect any swaps.
    teams.forEach((team) => {
      team.pos = {};
      team.members.forEach((member) => {
        if (member.pos1) {
          team.pos[member.pos1] = (team.pos[member.pos1] || 0) + 1;
        }
      });
    });
  }
  improveBalance();

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
    "1 Luis Miguel 7.5\n2. Jane Smith 8.0\n3 Carlos"
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
    clip.includes("Team 1 - White") && !clip.includes("Name Pos") && clip.includes("A D"),
    "Clipboard base format ok"
  );

  const clipNoPos = buildClipboardTeams([
    { name: "Team 3", members: [{ name: "X", pos1: "" }, { name: "Y", pos1: "" }] },
  ]);
  console.assert(
    clipNoPos.includes("Team 3 - White") && clipNoPos.includes("X\nY"),
    "Clipboard no-pos format ok"
  );
}
