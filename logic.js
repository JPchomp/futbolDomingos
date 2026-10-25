import {
  verifyDatabasePassword,
  createDatabaseSession,
  encryptDatabase,
  decryptDatabase,
  decryptWithSession,
  generateDropBoxKeyPair,
  importDropBoxPublicKey,
  importDropBoxPrivateKey,
  sealForDatabase,
  openSealedForDatabase,
} from "./database-security.js";

const RANDOM_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

// Ratings live on a 0–10 scale. Anything outside it is a typo (a shirt number,
// a phone number, a stray "85" meant as "8,5") rather than a rating.
export const MIN_SCORE = 0;
export const MAX_SCORE = 10;
export const DEFAULT_SCORE = 5;

// Positions are fitted first and ratings are levelled inside that fit.
export const BALANCE_PRESETS = {
  score: { scoreTolerance: 0.25 },
  balanced: { scoreTolerance: 1 },
  // Positions are never traded away, however wide the rating gap ends up.
  positions: { scoreTolerance: Infinity },
};

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

/**
 * Turn any user-supplied value into a usable rating.
 * Returns the status so callers can tell the user what happened instead of
 * silently inventing a number.
 */
export function coerceScore(value) {
  if (value === null || value === undefined) {
    return { score: DEFAULT_SCORE, status: "default" };
  }
  if (typeof value === "string" && value.trim() === "") {
    return { score: DEFAULT_SCORE, status: "default" };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return { score: DEFAULT_SCORE, status: "default" };
  if (parsed < MIN_SCORE) return { score: MIN_SCORE, status: "clamped" };
  if (parsed > MAX_SCORE) return { score: MAX_SCORE, status: "clamped" };
  return { score: parsed, status: "ok" };
}

export function isValidScore(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= MIN_SCORE && parsed <= MAX_SCORE;
}

// Multi-letter position abbreviations we are willing to split off the end of a
// pasted name. Single letters are deliberately excluded — "Juan A" is a name.
const KNOWN_POSITIONS = new Set([
  "GK", "DF", "MF", "FW", "CB", "LB", "RB", "CM", "CDM", "CAM", "LM", "RM",
  "LW", "RW", "ST", "ARQ", "POR", "DEF", "MED", "DEL", "VOL", "LAT", "EXT",
  "ALA", "PIVOT", "CIERRE",
]);

const TEAM_HEADER = /^(team|equipo)\s*\d+\b/i;
const HAS_LETTER = /[A-Za-zÀ-ÖØ-öø-ÿ]/;

export function normalizePosition(value) {
  return String(value ?? "").trim().toUpperCase();
}

/**
 * Collapse a name to a comparison key: accents, punctuation, casing and
 * repeated spaces all stop mattering. "José  Muñoz" and "jose munoz" match.
 */
export function normalizeNameKey(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitTrailingPosition(name) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { name, pos1: "" };
  const candidate = normalizePosition(parts[parts.length - 1]);
  if (!KNOWN_POSITIONS.has(candidate)) return { name, pos1: "" };
  const rest = parts.slice(0, -1).join(" ");
  if (!HAS_LETTER.test(rest)) return { name, pos1: "" };
  return { name: rest, pos1: candidate };
}

function stripStatusIcons(raw) {
  // Include variation selectors and joiners left behind by emoji sequences.
  return raw.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u2600-\u27BF\uFE0E\uFE0F\u200D\u20E3]/gu, " ");
}

function cleanName(raw) {
  return stripStatusIcons(raw)
    .replace(/\./g, "")
    .replace(/[\s,:;\-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse pasted text into players, reporting anything suspicious rather than
 * quietly turning it into a rating.
 *
 * Returns { players, warnings }. Warnings are structured so the UI can
 * translate them.
 */
export function parseList(text) {
  const warnings = [];
  const rejectedScores = [];
  const players = [];

  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    // Tab-delimited: name \t pos \t score (what "Copy players" produces).
    if (line.includes("\t")) {
      const parts = line.split("\t");
      const name = cleanName(parts[0] || "");
      if (!name || !HAS_LETTER.test(name)) continue;
      const rawScore = (parts[2] || "").replace(",", ".").trim();
      const hasScore = rawScore !== "" && isValidScore(rawScore);
      if (rawScore !== "" && !hasScore) rejectedScores.push(name);
      players.push({
        id: uid(),
        name,
        score: hasScore ? Number(rawScore) : DEFAULT_SCORE,
        pos1: normalizePosition(parts[1] || ""),
        hasScore,
      });
      continue;
    }

    // Team headers emitted by the "Copy teams" buttons are not players.
    if (TEAM_HEADER.test(line)) continue;

    // Drop a leading list number ("1.", "2)", "3 -", "4:").
    const listNumber = line.match(/^\s*\d+\s*[.)\-:\t ]+\s*/);
    let rest = listNumber ? line.slice(listNumber[0].length).trim() : line;
    // A bare "10" is a list number with nothing after it.
    if (!listNumber && /^\d+$/.test(rest)) continue;

    rest = stripStatusIcons(rest).replace(/[\s.,:;]+$/, "").trim();

    // A trailing number is the rating — but only if it could actually be one.
    let score = DEFAULT_SCORE;
    let hasScore = false;
    let rejected = null;
    const scoreMatch = rest.match(/^(.*?)[\s,:;\t]*(-?\d+(?:[.,]\d+)?)$/);
    if (scoreMatch && HAS_LETTER.test(scoreMatch[1])) {
      const value = Number(scoreMatch[2].replace(",", "."));
      rest = scoreMatch[1];
      if (isValidScore(value)) {
        score = value;
        hasScore = true;
      } else {
        rejected = scoreMatch[2];
      }
    }

    let name = cleanName(rest);
    if (!name || !HAS_LETTER.test(name)) continue;

    const split = splitTrailingPosition(name);
    name = split.name;
    if (rejected !== null) rejectedScores.push(name);

    players.push({ id: uid(), name, score, pos1: split.pos1, hasScore });
  }

  if (rejectedScores.length) {
    warnings.push({ code: "scoreOutOfRange", names: rejectedScores });
  }
  return { players, warnings };
}

// Back-compatible wrapper: the players only.
export function parseListIgnoreNumbers(text) {
  return parseList(text).players;
}

const SHIRT_COLORS = ["White", "Black", "Orange", "Yellow"];

const DISPLAY_POSITION_ORDER = new Map([
  ["GK", 0], ["ARQ", 0], ["POR", 0],
  ["D", 1], ["DF", 1], ["DEF", 1], ["CB", 1], ["LB", 1], ["RB", 1], ["LAT", 1], ["CIERRE", 1],
  ["M", 2], ["MF", 2], ["MED", 2], ["CM", 2], ["CDM", 2], ["CAM", 2], ["LM", 2], ["RM", 2], ["VOL", 2], ["PIVOT", 2],
  ["A", 3], ["FW", 3], ["DEL", 3], ["LW", 3], ["RW", 3], ["ST", 3], ["EXT", 3], ["ALA", 3],
]);

/** Return a presentation order without changing team membership or player data. */
export function sortPlayersByPositionAndScore(players) {
  return [...(players || [])].sort((a, b) => {
    const positionA = normalizePosition(a?.pos1);
    const positionB = normalizePosition(b?.pos1);
    const rankA = DISPLAY_POSITION_ORDER.get(positionA) ?? 4;
    const rankB = DISPLAY_POSITION_ORDER.get(positionB) ?? 4;
    if (rankA !== rankB) return rankA - rankB;
    if (rankA === 4 && positionA !== positionB) {
      return positionA.localeCompare(positionB, undefined, { sensitivity: "base" });
    }

    const validA = a?.score !== null && a?.score !== undefined &&
      String(a.score).trim() !== "" && isValidScore(a.score);
    const validB = b?.score !== null && b?.score !== undefined &&
      String(b.score).trim() !== "" && isValidScore(b.score);
    if (validA !== validB) return validA ? -1 : 1;
    if (validA && Number(a.score) !== Number(b.score)) {
      return Number(b.score) - Number(a.score);
    }

    const nameOrder = String(a?.name ?? "").toLocaleLowerCase()
      .localeCompare(String(b?.name ?? "").toLocaleLowerCase());
    if (nameOrder !== 0) return nameOrder;
    return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
  });
}

export function buildClipboardTeams(teams) {
  const lines = [];
  (teams || []).forEach((team, idx) => {
    const label = team?.name ? String(team.name) : `Team ${idx + 1}`;
    const color = SHIRT_COLORS[idx % SHIRT_COLORS.length];
    lines.push(`${label} - ${color}`);
    const members = sortPlayersByPositionAndScore(team?.members);
    members.forEach((member) => {
      lines.push(member.name);
    });
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
    const members = sortPlayersByPositionAndScore(team?.members);
    const hasAnyPos = members.some((m) => m.pos1 && m.pos1.trim());
    members.forEach((member) => {
      const pos = hasAnyPos && member.pos1 ? member.pos1.trim() : "";
      const playerScore = coerceScore(member.score).score.toFixed(1);
      lines.push(pos ? `${member.name} ${pos} ${playerScore}` : `${member.name} ${playerScore}`);
    });
    lines.push("");
  });
  return lines.join("\n");
}

export function buildClipboardTeamsWithPositions(teams) {
  const lines = [];
  (teams || []).forEach((team, idx) => {
    lines.push(team?.name ? String(team.name) : `Team ${idx + 1}`);
    sortPlayersByPositionAndScore(team?.members).forEach((member) => {
      const position = normalizePosition(member.pos1);
      lines.push(position ? `${member.name} (${position})` : member.name);
    });
    lines.push("");
  });
  return lines.join("\n");
}

export function buildClipboardPlayers(players) {
  return (players || [])
    .map((player) => {
      const name = (player.name || "").trim();
      const pos1 = normalizePosition(player.pos1);
      const score = coerceScore(player.score).score;
      return `${name}\t${pos1}\t${score}`;
    })
    .join("\n");
}

export function normalizePlayers(rows) {
  return (rows || [])
    .map((row) => ({
      ...row,
      name: (row.name || "").trim(),
      pos1: normalizePosition(row.pos1),
      score: coerceScore(row.score).score,
    }))
    .filter((row) => row.name);
}

/** Problems worth telling the organizer about before they read the teams. */
export function collectRosterWarnings(rows) {
  const warnings = [];
  const clamped = [];
  const blank = [];
  const seen = new Map();
  const duplicates = new Set();

  (rows || []).forEach((row) => {
    const name = (row.name || "").trim();
    if (!name) return;
    const { status } = coerceScore(row.score);
    if (status === "clamped") clamped.push(name);
    if (status === "default" && row.score !== undefined) blank.push(name);
    const key = normalizeNameKey(name);
    if (seen.has(key)) duplicates.add(seen.get(key));
    else seen.set(key, name);
  });

  if (clamped.length) warnings.push({ code: "scoreClamped", names: clamped });
  if (blank.length) warnings.push({ code: "scoreMissing", names: blank });
  if (duplicates.size) warnings.push({ code: "duplicateNames", names: [...duplicates] });
  return warnings;
}

function collectPositions(rows) {
  const set = new Set();
  rows.forEach((row) => {
    if (row.pos1) set.add(row.pos1);
  });
  return Array.from(set).sort();
}

function emptyResult(message, code = null, params = {}) {
  return {
    error: message,
    errorCode: code,
    errorParams: params,
    warnings: [],
    teams: [],
    targets: [],
    allPos: [],
    subs: [],
    used: 0,
    spread: 0,
  };
}

export function computeAssignments(players, options = {}, lockedTeam = null) {
  const {
    numTeams = 0,
    teamSize = 0,
    seed = "",
    posScoreWeight = 0.2,
    scoreWeight = 1,
    scoreTolerance = 1,
    seedTopPlayers = true,
  } = options;

  if (numTeams === "" || teamSize === "" || numTeams < 1 || teamSize < 1) {
    return emptyResult("Set teams and size.", "setTeamsAndSize");
  }
  if (!Number.isInteger(numTeams) || !Number.isInteger(teamSize)) {
    return emptyResult(
      "Teams and size must be whole numbers.",
      "wholeNumbers"
    );
  }

  const rows = normalizePlayers(players);
  const warnings = collectRosterWarnings(players);
  const needed = numTeams * teamSize;
  if (rows.length < needed) {
    return emptyResult(`Need ${needed} players, have ${rows.length}.`, "needPlayers", {
      needed,
      have: rows.length,
    });
  }

  // ---- Lock -------------------------------------------------------------
  const lockRequested = Boolean(lockedTeam);
  const activeLock =
    lockedTeam &&
    Number.isInteger(lockedTeam.index) &&
    lockedTeam.index >= 0 &&
    lockedTeam.index < numTeams
      ? lockedTeam
      : null;
  if (lockRequested && !activeLock) warnings.push({ code: "lockIgnored" });

  const byId = new Map(rows.map((row) => [row.id, row]));
  const requestedLockIds = activeLock ? [...new Set(activeLock.members || [])] : [];
  const lockedMembers = requestedLockIds.map((id) => byId.get(id)).filter(Boolean);
  const missingLocked = requestedLockIds.length - lockedMembers.length;
  if (missingLocked > 0) warnings.push({ code: "lockedMissing", count: missingLocked });

  if (lockedMembers.length > teamSize) {
    return emptyResult("Locked team exceeds team size.", "lockedTooBig");
  }
  const lockedIds = new Set(lockedMembers.map((member) => member.id));

  // ---- Who plays --------------------------------------------------------
  // Locked players always play; without this, reshuffling silently benches
  // them and quietly dissolves the lock. Everyone else is drawn at random.
  const pool = [...lockedMembers];
  for (const row of seededShuffle(rows, seed)) {
    if (pool.length >= needed) break;
    if (!lockedIds.has(row.id)) pool.push(row);
  }
  const poolIds = new Set(pool.map((player) => player.id));
  const bench = rows.filter((row) => !poolIds.has(row.id));

  // ---- Position targets -------------------------------------------------
  const allPos = collectPositions(pool);
  const posCounts = Object.fromEntries(allPos.map((pos) => [pos, 0]));
  pool.forEach((player) => {
    if (player.pos1) posCounts[player.pos1] += 1;
  });

  // A position is "fitted" when every team holds between floor and ceil of its
  // fair share. Which team gets the spare one does not matter.
  const posCeil = Object.fromEntries(
    allPos.map((pos) => [pos, Math.ceil(posCounts[pos] / numTeams)])
  );

  // Balancing counts alone would happily give one team the best keeper and the
  // best striker, so the rating carried by each position is levelled too.
  const posScoreTotals = Object.fromEntries(allPos.map((pos) => [pos, 0]));
  pool.forEach((player) => {
    if (player.pos1) posScoreTotals[player.pos1] += player.score;
  });
  const idealPosScore = Object.fromEntries(
    allPos.map((pos) => [pos, posScoreTotals[pos] / numTeams])
  );

  const targets = Array.from({ length: numTeams }, () => ({}));
  for (const pos of allPos) {
    const base = Math.floor(posCounts[pos] / numTeams);
    const remainder = posCounts[pos] % numTeams;
    for (let i = 0; i < numTeams; i += 1) {
      targets[i][pos] = base + (i < remainder ? 1 : 0);
    }
  }

  const teams = Array.from({ length: numTeams }, (_, index) => ({
    name: `Team ${index + 1}`,
    members: [],
    score: 0,
    pos: {},
    posScore: {},
    index,
  }));

  const targetTeamTotal =
    pool.reduce((sum, player) => sum + player.score, 0) / numTeams;

  function addMember(team, player) {
    team.members.push(player);
    team.score += player.score;
    if (player.pos1) {
      team.pos[player.pos1] = (team.pos[player.pos1] || 0) + 1;
      team.posScore[player.pos1] = (team.posScore[player.pos1] || 0) + player.score;
    }
  }

  function recount(team) {
    team.score = team.members.reduce((sum, member) => sum + member.score, 0);
    team.pos = {};
    team.posScore = {};
    team.members.forEach((member) => {
      if (!member.pos1) return;
      team.pos[member.pos1] = (team.pos[member.pos1] || 0) + 1;
      team.posScore[member.pos1] = (team.posScore[member.pos1] || 0) + member.score;
    });
  }

  lockedMembers.forEach((member) => addMember(teams[activeLock.index], member));

  // ---- Seeding rule -----------------------------------------------------
  // The `numTeams` highest-rated players in the pool are spread one per team,
  // so the strongest players can never stack up on one side.
  const ranked = [...pool].sort(
    (a, b) =>
      b.score - a.score ||
      a.name.localeCompare(b.name) ||
      String(a.id).localeCompare(String(b.id))
  );
  const seedIds = new Set(
    seedTopPlayers ? ranked.slice(0, numTeams).map((player) => player.id) : []
  );

  const teamHasSeed = teams.map((team) =>
    team.members.some((member) => seedIds.has(member.id))
  );
  const activeSeedIds = new Set(
    lockedMembers.filter((member) => seedIds.has(member.id)).map((m) => m.id)
  );

  // Shuffle which open team receives which seed so reshuffling changes the
  // pairings; improveBalance() may still swap seeds between teams afterwards.
  const openTeamOrder = seededShuffle(
    teams.map((_, index) => index).filter((index) => !teamHasSeed[index]),
    seed
  );
  for (const player of ranked) {
    if (!seedIds.has(player.id) || lockedIds.has(player.id)) continue;
    const target = openTeamOrder.find(
      (index) => !teamHasSeed[index] && teams[index].members.length < teamSize
    );
    if (target === undefined) break;
    addMember(teams[target], player);
    teamHasSeed[target] = true;
    activeSeedIds.add(player.id);
  }
  if (seedTopPlayers && teamHasSeed.some((has) => !has)) {
    warnings.push({ code: "seedRuleRelaxed" });
  }

  // ---- Construction: rarest positions claim their slots first ----------
  const placed = new Set([...lockedIds, ...activeSeedIds]);
  const remaining = pool.filter((player) => !placed.has(player.id));

  // How far a team is from its fair share of *rating* for one position.
  // Counts are handled as a constraint; this is purely about quality.
  function positionScorePenalty(team, pos, score) {
    if (!posScoreWeight || !pos) return 0;
    const ideal = idealPosScore[pos] || 0;
    const have = team.posScore[pos] || 0;
    return ((have + score - ideal) ** 2 - (have - ideal) ** 2) * posScoreWeight;
  }

  function fitPenalty(team, candidate) {
    const partialTarget = (targetTeamTotal * (team.members.length + 1)) / teamSize;
    const diff = team.score + candidate.score - partialTarget;
    return (
      diff * diff * scoreWeight +
      positionScorePenalty(team, candidate.pos1, candidate.score)
    );
  }

  const byPosition = new Map();
  for (const player of remaining) {
    const key = player.pos1 || "";
    if (!byPosition.has(key)) byPosition.set(key, []);
    byPosition.get(key).push(player);
  }
  // Scarcest position first: a lone keeper must claim a slot before the
  // unpositioned players fill the squad up around them.
  const positionOrder = [...byPosition.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    return (posCounts[a] || 0) - (posCounts[b] || 0) || a.localeCompare(b);
  });

  for (const pos of positionOrder) {
    for (const candidate of byPosition.get(pos)) {
      const open = teams.filter((team) => team.members.length < teamSize);
      if (open.length === 0) {
        return emptyResult("Could not place every player.", "internal");
      }
      // Teams still under their fair share of this position get first refusal.
      const withRoom = pos
        ? open.filter((team) => (team.pos[pos] || 0) < posCeil[pos])
        : [];
      const eligible = withRoom.length ? withRoom : open;
      // Keep squad sizes level so nobody is left with a forced placement.
      const minCount = Math.min(...eligible.map((team) => team.members.length));
      const finalists = eligible.filter((team) => team.members.length === minCount);

      let best = finalists[0];
      let bestPenalty = Infinity;
      for (const team of finalists) {
        const penalty = fitPenalty(team, candidate);
        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          best = team;
        }
      }
      addMember(best, candidate);
    }
  }

  for (const team of teams) {
    if (team.members.length !== teamSize) {
      return emptyResult("Could not place every player.", "internal");
    }
  }

  // ---- Hierarchical balancing -------------------------------------------
  // Positions first, ratings second. A position slot is never traded for a
  // better rating split until the ratings have been levelled as far as they
  // can be *within* a correct position fit, and even then only while the gap
  // is still wider than scoreTolerance.

  // How many players sit in a team that already holds its fair share of their
  // position. Zero means every position is spread as evenly as the arithmetic
  // allows.
  function countMisfits() {
    let total = 0;
    for (const team of teams) {
      for (const pos of allPos) {
        total += Math.max(0, (team.pos[pos] || 0) - posCeil[pos]);
      }
    }
    return total;
  }

  function misfitDelta(teamA, teamB, playerA, playerB) {
    if (playerA.pos1 === playerB.pos1) return 0;
    const cell = (team, pos, change) => {
      if (!pos) return 0;
      const have = team.pos[pos] || 0;
      const ceiling = posCeil[pos] || 0;
      return Math.max(0, have + change - ceiling) - Math.max(0, have - ceiling);
    };
    return (
      cell(teamA, playerA.pos1, -1) +
      cell(teamA, playerB.pos1, 1) +
      cell(teamB, playerB.pos1, -1) +
      cell(teamB, playerA.pos1, 1)
    );
  }

  function ratingDelta(teamA, teamB, playerA, playerB) {
    const nextA = teamA.score - playerA.score + playerB.score;
    const nextB = teamB.score - playerB.score + playerA.score;
    let delta =
      ((nextA - targetTeamTotal) ** 2 +
        (nextB - targetTeamTotal) ** 2 -
        (teamA.score - targetTeamTotal) ** 2 -
        (teamB.score - targetTeamTotal) ** 2) *
      scoreWeight;

    if (!posScoreWeight) return delta;
    if (playerA.pos1 !== playerB.pos1) {
      delta +=
        positionScorePenalty(teamA, playerA.pos1, -playerA.score) +
        positionScorePenalty(teamA, playerB.pos1, playerB.score) +
        positionScorePenalty(teamB, playerB.pos1, -playerB.score) +
        positionScorePenalty(teamB, playerA.pos1, playerA.score);
    } else if (playerA.pos1) {
      // Same position: the counts do not move, but the rating does.
      const pos = playerA.pos1;
      const ideal = idealPosScore[pos] || 0;
      const haveA = teamA.posScore[pos] || 0;
      const haveB = teamB.posScore[pos] || 0;
      delta +=
        ((haveA - playerA.score + playerB.score - ideal) ** 2 +
          (haveB - playerB.score + playerA.score - ideal) ** 2 -
          (haveA - ideal) ** 2 -
          (haveB - ideal) ** 2) *
        posScoreWeight;
    }
    return delta;
  }

  // A seeded player may only trade places with another seeded player, or the
  // one-per-team rule would be undone here.
  const movable = (player) => !lockedIds.has(player.id);
  const sameRole = (a, b) => activeSeedIds.has(a.id) === activeSeedIds.has(b.id);

  function ratingSpread() {
    const totals = teams.map((team) => team.score);
    return Math.max(...totals) - Math.min(...totals);
  }

  function snapshot() {
    return teams.map((team) => [...team.members]);
  }

  function restore(snap) {
    teams.forEach((team, index) => {
      team.members = [...snap[index]];
      recount(team);
    });
  }

  const EPSILON = 1e-9;
  const MAX_PASSES = 200;

  /**
   * Hill-climb by swapping pairs between teams.
   * `budget` caps how many players may sit outside their position's fair
   * share. With `positionsFirst`, a swap that reduces the misfit count always
   * wins, whatever it does to the ratings; otherwise only the ratings matter
   * and the budget is what protects the positions.
   */
  function improve(budget, positionsFirst) {
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      const misfits = countMisfits();
      let best = null;
      let bestMisfit = 0;
      let bestRating = -EPSILON;

      for (let i = 0; i < teams.length; i += 1) {
        for (let j = i + 1; j < teams.length; j += 1) {
          for (let a = 0; a < teams[i].members.length; a += 1) {
            const playerA = teams[i].members[a];
            if (!movable(playerA)) continue;
            for (let b = 0; b < teams[j].members.length; b += 1) {
              const playerB = teams[j].members[b];
              if (!movable(playerB) || !sameRole(playerA, playerB)) continue;

              const dMisfit = misfitDelta(teams[i], teams[j], playerA, playerB);
              if (misfits + dMisfit > budget) continue;
              const dRating = ratingDelta(teams[i], teams[j], playerA, playerB);

              if (positionsFirst) {
                if (
                  dMisfit < bestMisfit ||
                  (dMisfit === bestMisfit && dRating < bestRating)
                ) {
                  bestMisfit = dMisfit;
                  bestRating = dRating;
                  best = { i, j, a, b };
                }
              } else if (dRating < bestRating) {
                bestRating = dRating;
                best = { i, j, a, b };
              }
            }
          }
        }
      }

      if (!best) break;
      const teamA = teams[best.i];
      const teamB = teams[best.j];
      const playerA = teamA.members[best.a];
      const playerB = teamB.members[best.b];
      teamA.members[best.a] = playerB;
      teamB.members[best.b] = playerA;
      recount(teamA);
      recount(teamB);
    }
  }

  // Step 1 — fit the positions, and level the ratings as far as they will go
  // without ever giving a position slot back.
  improve(countMisfits(), true);

  const fittedMisfits = countMisfits();
  let outcome = { snap: snapshot(), misfits: fittedMisfits, spread: ratingSpread() };

  if (outcome.spread > scoreTolerance) {
    // Step 2 — the ratings are still too far apart, so release position slots
    // one player at a time and stop at the first level that closes the gap.
    let fallback = outcome;
    let closed = null;
    const cap = fittedMisfits + Math.max(1, numTeams);
    for (let budget = fittedMisfits + 1; budget <= cap; budget += 1) {
      improve(budget, false);
      const spread = ratingSpread();
      const state = { snap: snapshot(), misfits: countMisfits(), spread };
      if (spread <= scoreTolerance) {
        closed = state;
        break;
      }
      if (spread < fallback.spread - EPSILON) fallback = state;
    }
    outcome = closed || fallback;
    restore(outcome.snap);
  }

  const positionsReleased = outcome.misfits - fittedMisfits;
  const spread = ratingSpread();

  if (activeLock && spread > 1.5) {
    warnings.push({ code: "lockedImbalance", spread: Number(spread.toFixed(1)) });
  }
  if (fittedMisfits > 0) {
    // Even the best fit leaves someone out of place, e.g. three keepers
    // between two teams.
    const uneven = allPos.filter((pos) =>
      teams.some((team) => (team.pos[pos] || 0) > posCeil[pos])
    );
    if (uneven.length) warnings.push({ code: "positionsUneven", positions: uneven });
  }
  if (positionsReleased > 0) {
    warnings.push({
      code: "positionsReleased",
      count: positionsReleased,
      spread: Number(spread.toFixed(1)),
    });
  }

  // ---- Subs -------------------------------------------------------------
  // Round-robin by sub count first, so no team ends up with two extra players
  // while another has none.
  const subs = teams.map((team) => ({ teamName: team.name, players: [], score: 0 }));
  [...bench]
    .sort((a, b) => b.score - a.score)
    .forEach((player) => {
      let target = 0;
      let bestKey = null;
      subs.forEach((group, index) => {
        const key = [group.players.length, teams[index].score + group.score];
        if (
          bestKey === null ||
          key[0] < bestKey[0] ||
          (key[0] === bestKey[0] && key[1] < bestKey[1])
        ) {
          bestKey = key;
          target = index;
        }
      });
      subs[target].players.push(player);
      subs[target].score += player.score;
    });

  return {
    error: null,
    errorCode: null,
    errorParams: {},
    warnings,
    teams: teams.map(({ index, ...rest }) => rest),
    targets,
    allPos,
    subs,
    used: pool.length,
    spread,
    misfits: outcome.misfits,
    positionsReleased,
    seededIds: [...activeSeedIds],
  };
}

// ---------------------------------------------------------------------------
// Player database (localStorage)
// ---------------------------------------------------------------------------

const DB_KEY = "futbolDomingos_playerDb";
const ENCRYPTED_DB_KEY = "futbolDomingos_playerDbEncrypted";
const DB_PUBLIC_KEY = "futbolDomingos_playerDbPublicKey";
const DB_PRIVATE_KEY = "futbolDomingos_playerDbPrivateKey";
const DB_PENDING_KEY = "futbolDomingos_playerDbPending";

/** A cap so an unattended page cannot be used to fill up browser storage. */
export const MAX_PENDING_ENTRIES = 500;

/** Drop anything malformed so a corrupted key can never crash the app. */
export function sanitizeDatabase(db) {
  if (!Array.isArray(db)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of db) {
    if (!entry || typeof entry !== "object") continue;
    const name = String(entry.name ?? "").trim();
    const key = normalizeNameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      score: coerceScore(entry.score).score,
      pos1: normalizePosition(entry.pos1),
    });
  }
  return out;
}

/**
 * Reading the `localStorage` property itself throws in a sandboxed frame or
 * when the browser is set to block site data, so even the existence check has
 * to sit inside the try.
 */
function getStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readPendingEntries(storage) {
  try {
    const raw = storage.getItem(DB_PENDING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * The private key is stored under the same salt as the database itself, so the
 * single derivation done to open the database also opens the drop box.
 */
async function installDropBoxKeyPair(storage, session) {
  const pair = await generateDropBoxKeyPair();
  storage.setItem(DB_PRIVATE_KEY, await encryptDatabase(pair.privateKey, session));
  storage.setItem(DB_PUBLIC_KEY, pair.publicKey);
}

/** Opens everything sealed in since the last unlock. Exported to be tested. */
export async function openDatabaseDropBox(storage, session) {
  const pending = readPendingEntries(storage);
  let privateKey = null;
  try {
    const stored = storage.getItem(DB_PRIVATE_KEY);
    if (stored !== null) {
      privateKey = await importDropBoxPrivateKey(await decryptWithSession(stored, session));
    }
  } catch {
    privateKey = null;
  }

  // Without a usable key pair nothing sealed earlier can ever be read again,
  // so the only honest thing is to start a fresh box and report the loss.
  if (!privateKey) {
    await installDropBoxKeyPair(storage, session);
    return { entries: [], dropped: pending.length };
  }

  const entries = [];
  let dropped = 0;
  for (const record of pending) {
    try {
      entries.push(JSON.parse(await openSealedForDatabase(record, privateKey)));
    } catch {
      dropped += 1;
    }
  }
  return { entries: sanitizeDatabase(entries), dropped };
}

/**
 * Seals players into the drop box without the password. The caller cannot read
 * the database, cannot check for duplicates, and cannot read back what it just
 * wrote; entries are merged in at the next unlock.
 */
export async function submitPlayersToDatabase(players) {
  const storage = getStorage();
  if (!storage || !globalThis.crypto?.subtle) return { status: "unavailable", queued: 0 };

  const entries = sanitizeDatabase(
    normalizePlayers(players).map(({ name, score, pos1 }) => ({ name, score, pos1 }))
  );
  if (!entries.length) return { status: "queued", queued: 0 };

  let publicKey;
  try {
    const stored = storage.getItem(DB_PUBLIC_KEY);
    // No drop box yet means this browser holds no database to add to.
    if (!stored) return { status: "locked", queued: 0 };
    publicKey = await importDropBoxPublicKey(stored);
  } catch {
    return { status: "locked", queued: 0 };
  }

  try {
    const pending = readPendingEntries(storage);
    if (pending.length + entries.length > MAX_PENDING_ENTRIES) {
      return { status: "full", queued: 0 };
    }
    for (const entry of entries) {
      pending.push(await sealForDatabase(JSON.stringify(entry), publicKey));
    }
    storage.setItem(DB_PENDING_KEY, JSON.stringify(pending));
    return { status: "queued", queued: entries.length };
  } catch {
    return { status: "unavailable", queued: 0 };
  }
}

export async function unlockPlayerDatabase(password) {
  const storage = getStorage();
  if (!storage || !globalThis.crypto?.subtle) return { status: "unavailable" };
  try {
    if (!await verifyDatabasePassword(password)) return { status: "invalid" };
  } catch {
    return { status: "unavailable" };
  }

  try {
    const encrypted = storage.getItem(ENCRYPTED_DB_KEY);
    let db;
    let session;
    if (encrypted !== null) {
      try {
        const opened = await decryptDatabase(encrypted, password);
        db = sanitizeDatabase(JSON.parse(opened.plaintext));
        session = opened.session;
      } catch {
        return { status: "corrupt" };
      }
    } else {
      // The old app stored readable JSON. Move it only after a correct unlock.
      const legacy = storage.getItem(DB_KEY);
      db = sanitizeDatabase(legacy ? JSON.parse(legacy) : []);
      session = await createDatabaseSession(password);
    }

    const box = await openDatabaseDropBox(storage, session);
    const merged = box.entries.length ? updateDatabase(box.entries, db) : db;
    if (encrypted === null || box.entries.length) {
      storage.setItem(ENCRYPTED_DB_KEY, await encryptDatabase(JSON.stringify(merged), session));
    }
    if (box.entries.length || box.dropped) storage.removeItem(DB_PENDING_KEY);
    // Finish a migration interrupted after the encrypted write.
    if (storage.getItem(DB_KEY) !== null) storage.removeItem(DB_KEY);
    if (storage.getItem(DB_KEY) !== null) return { status: "unavailable" };
    return {
      status: "ready",
      db: merged,
      session,
      merged: box.entries.length,
      dropped: box.dropped,
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function savePlayerDatabase(db, session) {
  const storage = getStorage();
  if (!storage || !session?.key) return false;
  try {
    const encrypted = await encryptDatabase(JSON.stringify(sanitizeDatabase(db)), session);
    storage.setItem(ENCRYPTED_DB_KEY, encrypted);
    return true;
  } catch {
    return false;
  }
}

export function removeFromDatabase(name, db) {
  const key = normalizeNameKey(name);
  return sanitizeDatabase(db).filter((entry) => normalizeNameKey(entry.name) !== key);
}

export function matchPlayersFromDatabase(parsed, db) {
  const clean = sanitizeDatabase(db);
  const index = new Map(clean.map((entry) => [normalizeNameKey(entry.name), entry]));
  return (parsed || []).map((player) => {
    const entry = index.get(normalizeNameKey(player.name));
    if (!entry) return { ...player, matched: false };
    const next = { ...player, matched: true };
    // An explicitly pasted rating beats the stored one; a blank one is filled.
    if (player.hasScore !== true) next.score = entry.score;
    if (!normalizePosition(player.pos1)) next.pos1 = entry.pos1;
    return next;
  });
}

export function updateDatabase(players, db) {
  const updated = sanitizeDatabase(db);
  const index = new Map(
    updated.map((entry, i) => [normalizeNameKey(entry.name), i])
  );
  for (const player of normalizePlayers(players)) {
    const key = normalizeNameKey(player.name);
    if (!key) continue;
    const at = index.get(key);
    // Keep the spelling already stored so casing does not churn week to week.
    const entry = {
      name: at === undefined ? player.name : updated[at].name,
      score: player.score,
      pos1: player.pos1,
    };
    if (at === undefined) {
      index.set(key, updated.length);
      updated.push(entry);
    } else {
      updated[at] = entry;
    }
  }
  return updated;
}
