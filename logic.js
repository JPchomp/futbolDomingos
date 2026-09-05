const RANDOM_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

// Ratings live on a 0–10 scale. Anything outside it is a typo (a shirt number,
// a phone number, a stray "85" meant as "8,5") rather than a rating.
export const MIN_SCORE = 0;
export const MAX_SCORE = 10;
export const DEFAULT_SCORE = 5;

// Preset trade-offs between levelling team totals and spreading positions.
// The number is roughly "how many points of team-total gap we will accept to
// give every team one more correctly-placed specialist".
export const BALANCE_PRESETS = {
  score: { scoreWeight: 1, posWeight: 0.25 },
  balanced: { scoreWeight: 1, posWeight: 1 },
  positions: { scoreWeight: 1, posWeight: 4 },
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

function cleanName(raw) {
  return raw
    .replace(/\./g, "")
    .replace(/[\s,:;\-]+$/, "")
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

    // Drop a leading list number ("1.", "2 -", "3:").
    const listNumber = line.match(/^\s*\d+\s*[.\-:\t ]+\s*/);
    let rest = listNumber ? line.slice(listNumber[0].length).trim() : line;
    // A bare "10" is a list number with nothing after it.
    if (!listNumber && /^\d+$/.test(rest)) continue;

    rest = rest.replace(/[\s.,:;]+$/, "");

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
    members.forEach((member) => {
      const pos = hasAnyPos && member.pos1 ? member.pos1.trim() : "";
      const playerScore = coerceScore(member.score).score.toFixed(1);
      lines.push(pos ? `${member.name} ${pos} ${playerScore}` : `${member.name} ${playerScore}`);
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
    posWeight = 1,
    scoreWeight = 1,
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

  // Fractional ideal, so the objective does not care *which* team gets the
  // spare player of a position that does not divide evenly.
  const idealPos = Object.fromEntries(
    allPos.map((pos) => [pos, posCounts[pos] / numTeams])
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
    index,
  }));

  const targetTeamTotal =
    pool.reduce((sum, player) => sum + player.score, 0) / numTeams;

  function addMember(team, player) {
    team.members.push(player);
    team.score += player.score;
    if (player.pos1) team.pos[player.pos1] = (team.pos[player.pos1] || 0) + 1;
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

  // ---- Greedy fill ------------------------------------------------------
  const placed = new Set([...lockedIds, ...activeSeedIds]);
  const remaining = pool.filter((player) => !placed.has(player.id));

  function positionDelta(team, pos, change) {
    if (!pos || !posWeight) return 0;
    const ideal = idealPos[pos] || 0;
    const have = team.pos[pos] || 0;
    return ((have + change - ideal) ** 2 - (have - ideal) ** 2) * posWeight;
  }

  function penalty(team, candidate) {
    const projected = team.score + candidate.score;
    const partialTarget = (targetTeamTotal * (team.members.length + 1)) / teamSize;
    const diff = projected - partialTarget;
    return diff * diff * scoreWeight + positionDelta(team, candidate.pos1, 1);
  }

  for (const candidate of remaining) {
    // Fill the emptiest teams first, so nobody is left with a forced placement.
    const open = teams.filter((team) => team.members.length < teamSize);
    if (open.length === 0) {
      return emptyResult("Could not place every player.", "internal");
    }
    const minCount = Math.min(...open.map((team) => team.members.length));
    const eligible = open.filter((team) => team.members.length === minCount);

    let best = eligible[0];
    let bestPenalty = Infinity;
    for (const team of eligible) {
      const pen = penalty(team, candidate);
      if (pen < bestPenalty) {
        bestPenalty = pen;
        best = team;
      }
    }
    addMember(best, candidate);
  }

  for (const team of teams) {
    if (team.members.length !== teamSize) {
      return emptyResult("Could not place every player.", "internal");
    }
  }

  // ---- Local search on the real objective -------------------------------
  // Score imbalance AND position imbalance, so the swap phase can no longer
  // undo the positional work done above.
  function swapDelta(teamA, teamB, playerA, playerB) {
    const nextA = teamA.score - playerA.score + playerB.score;
    const nextB = teamB.score - playerB.score + playerA.score;
    let delta =
      ((nextA - targetTeamTotal) ** 2 +
        (nextB - targetTeamTotal) ** 2 -
        (teamA.score - targetTeamTotal) ** 2 -
        (teamB.score - targetTeamTotal) ** 2) *
      scoreWeight;

    if (playerA.pos1 !== playerB.pos1) {
      delta +=
        positionDelta(teamA, playerA.pos1, -1) +
        positionDelta(teamA, playerB.pos1, 1) +
        positionDelta(teamB, playerB.pos1, -1) +
        positionDelta(teamB, playerA.pos1, 1);
    }
    return delta;
  }

  // A seeded player may only trade places with another seeded player, or the
  // one-per-team rule would be undone here.
  const movable = (player) => !lockedIds.has(player.id);
  const sameRole = (a, b) => activeSeedIds.has(a.id) === activeSeedIds.has(b.id);

  const EPSILON = 1e-9;
  const MAX_PASSES = 100;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let best = null;
    let bestDelta = -EPSILON;

    for (let i = 0; i < teams.length; i += 1) {
      for (let j = i + 1; j < teams.length; j += 1) {
        for (let a = 0; a < teams[i].members.length; a += 1) {
          const playerA = teams[i].members[a];
          if (!movable(playerA)) continue;
          for (let b = 0; b < teams[j].members.length; b += 1) {
            const playerB = teams[j].members[b];
            if (!movable(playerB) || !sameRole(playerA, playerB)) continue;
            const delta = swapDelta(teams[i], teams[j], playerA, playerB);
            if (delta < bestDelta) {
              bestDelta = delta;
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
    teamA.score += playerB.score - playerA.score;
    teamB.score += playerA.score - playerB.score;
    if (playerA.pos1) teamA.pos[playerA.pos1] -= 1;
    if (playerB.pos1) teamA.pos[playerB.pos1] = (teamA.pos[playerB.pos1] || 0) + 1;
    if (playerB.pos1) teamB.pos[playerB.pos1] -= 1;
    if (playerA.pos1) teamB.pos[playerA.pos1] = (teamB.pos[playerA.pos1] || 0) + 1;
  }

  // Recompute from members so accumulated float error never reaches the UI.
  teams.forEach((team) => {
    team.score = team.members.reduce((sum, member) => sum + member.score, 0);
    team.pos = {};
    team.members.forEach((member) => {
      if (member.pos1) team.pos[member.pos1] = (team.pos[member.pos1] || 0) + 1;
    });
  });

  const teamScores = teams.map((team) => team.score);
  const spread = Math.max(...teamScores) - Math.min(...teamScores);
  if (activeLock && spread > 1.5) {
    warnings.push({ code: "lockedImbalance", spread: Number(spread.toFixed(1)) });
  }

  const unevenPositions = allPos.filter((pos) => {
    const counts = teams.map((team) => team.pos[pos] || 0);
    return Math.max(...counts) - Math.min(...counts) > 1;
  });
  if (unevenPositions.length) {
    warnings.push({ code: "positionsUneven", positions: unevenPositions });
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
    seededIds: [...activeSeedIds],
  };
}

// ---------------------------------------------------------------------------
// Player database (localStorage)
// ---------------------------------------------------------------------------

const DB_KEY = "futbolDomingos_playerDb";

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

export function loadPlayerDatabase() {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(DB_KEY);
    return sanitizeDatabase(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export function savePlayerDatabase(db) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(DB_KEY, JSON.stringify(sanitizeDatabase(db)));
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
