import {
  uid,
  parseList,
  buildClipboardTeams,
  buildClipboardTeamsWithScores,
  buildClipboardTeamsWithPositions,
  buildClipboardPlayers,
  sortPlayersByPositionAndScore,
  normalizePlayers,
  computeAssignments,
  unlockPlayerDatabase,
  savePlayerDatabase,
  submitPlayersToDatabase,
  matchPlayersFromDatabase,
  updateDatabase,
  removeFromDatabase,
  coerceScore,
  BALANCE_PRESETS,
  MIN_SCORE,
  MAX_SCORE,
} from "./logic.js";
import {
  translations,
  translateTeamName,
  translateError,
  translateWarning,
} from "./translations.js";

const { useMemo, useState, useEffect, useRef } = React;
const html = htm.bind(React.createElement);

/** "" while the field is being edited; otherwise a positive whole number. */
function parseCount(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  if (text === "") return "";
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isWholeCount(value) {
  return value === "" || (Number.isInteger(value) && value >= 1);
}

function App() {
  const [players, setPlayers] = useState([]);
  // Kept as raw strings so the field stays editable; validated before use.
  const [numTeamsInput, setNumTeamsInput] = useState("2");
  const [teamSizeInput, setTeamSizeInput] = useState("5");
  const [shuffleSeed, setShuffleSeed] = useState(() => uid());
  const [pasteText, setPasteText] = useState("");
  const [pasteWarnings, setPasteWarnings] = useState([]);
  const [lockedTeam, setLockedTeam] = useState(null);
  const [language, setLanguage] = useState("en");
  const [db, setDb] = useState([]);
  const [dbSession, setDbSession] = useState(null);
  const [dbPassword, setDbPassword] = useState("");
  const [dbUnlocking, setDbUnlocking] = useState(false);
  const [dbSaving, setDbSaving] = useState(false);
  const dbWriteInProgress = useRef(false);
  const [dbError, setDbError] = useState(null);
  const [showDb, setShowDb] = useState(false);
  const [notice, setNotice] = useState(null);

  const t = translations[language];

  const numTeams = parseCount(numTeamsInput);
  const teamSize = parseCount(teamSizeInput);
  const countsValid = isWholeCount(numTeams) && isWholeCount(teamSize);

  // A lock pointing at a team that no longer exists is meaningless.
  useEffect(() => {
    if (lockedTeam && Number.isInteger(numTeams) && lockedTeam.index >= numTeams) {
      setLockedTeam(null);
    }
  }, [numTeams, lockedTeam]);

  const result = useMemo(() => {
    try {
      return computeAssignments(
        players,
        {
          numTeams: numTeams === "" ? 0 : numTeams,
          teamSize: teamSize === "" ? 0 : teamSize,
          seed: shuffleSeed,
          ...BALANCE_PRESETS.balanced,
        },
        lockedTeam
      );
    } catch (err) {
      // Nothing should reach here, but a thrown error during render would
      // unmount the whole app and take the roster with it.
      console.error("computeAssignments failed", err);
      return {
        error: "internal",
        errorCode: "internal",
        errorParams: {},
        warnings: [],
        teams: [],
        targets: [],
        allPos: [],
        subs: [],
        used: 0,
        spread: 0,
        seededIds: [],
      };
    }
  }, [players, numTeams, teamSize, shuffleSeed, lockedTeam]);

  const seededIds = useMemo(() => new Set(result.seededIds || []), [result]);
  const displayedTeams = useMemo(
    () => result.teams.map((team) => ({
      ...team,
      members: sortPlayersByPositionAndScore(team.members),
    })),
    [result.teams]
  );
  const errorMessage = translateError(result, t);
  const warnings = [...pasteWarnings, ...(result.warnings || [])]
    .map((warning) => translateWarning(warning, t))
    .filter(Boolean);

  function flash(message) {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 4000);
  }

  function updatePlayer(id, field, value) {
    setPlayers((prev) =>
      prev.map((player) => (player.id === id ? { ...player, [field]: value } : player))
    );
  }

  function removePlayer(id) {
    setPlayers((prev) => prev.filter((player) => player.id !== id));
    setLockedTeam((prev) =>
      prev ? { ...prev, members: prev.members.filter((member) => member !== id) } : prev
    );
  }

  function handlePaste() {
    const { players: parsed, warnings: parseWarnings } = parseList(pasteText);
    setPlayers((prev) => [...prev, ...parsed]);
    setPasteWarnings(parseWarnings);
    setPasteText("");
  }

  function handlePasteWithDb() {
    if (!dbSession) return;
    const { players: parsed, warnings: parseWarnings } = parseList(pasteText);
    const matched = matchPlayersFromDatabase(parsed, db);
    setPlayers((prev) => [...prev, ...matched]);
    setPasteWarnings(parseWarnings);
    setPasteText("");
    if (parsed.length) {
      flash(t.dbMatched(matched.filter((player) => player.matched).length, parsed.length));
    }
  }

  async function handleUnlockDb(event) {
    event.preventDefault();
    if (dbUnlocking) return;
    setDbUnlocking(true);
    setDbError(null);
    const outcome = await unlockPlayerDatabase(dbPassword);
    setDbPassword("");
    setDbUnlocking(false);
    if (outcome.status === "ready") {
      setDb(outcome.db);
      setDbSession(outcome.session);
      setShowDb(true);
      if (outcome.dropped) flash(t.dbDroppedOnUnlock(outcome.dropped));
      else if (outcome.merged) flash(t.dbMergedOnUnlock(outcome.merged));
    } else {
      setDbError(outcome.status);
    }
  }

  function handleLockDb() {
    if (dbWriteInProgress.current) return;
    setShowDb(false);
    setDb([]);
    setDbSession(null);
    setDbPassword("");
    setDbError(null);
  }

  async function persistDb(updated) {
    if (!dbSession || dbWriteInProgress.current) return false;
    dbWriteInProgress.current = true;
    setDbSaving(true);
    let saved = false;
    try {
      saved = await savePlayerDatabase(updated, dbSession);
    } finally {
      dbWriteInProgress.current = false;
      setDbSaving(false);
    }
    if (saved) setDb(updated);
    else flash(t.dbSaveFailed);
    return saved;
  }

  async function handleUploadToDb() {
    if (dbSession) {
      const updated = updateDatabase(normalizePlayers(players), db);
      if (await persistDb(updated)) flash(t.dbSaved);
      return;
    }
    // Locked: the players can be sealed in, but nothing can be read back.
    if (dbSaving) return;
    setDbSaving(true);
    let outcome;
    try {
      outcome = await submitPlayersToDatabase(players);
    } finally {
      setDbSaving(false);
    }
    if (outcome.status === "queued") flash(t.dbQueued(outcome.queued));
    else if (outcome.status === "locked") flash(t.dbQueueLocked);
    else if (outcome.status === "full") flash(t.dbQueueFull);
    else flash(t.dbSaveFailed);
  }

  async function handleDeleteDbEntry(name) {
    const updated = removeFromDatabase(name, db);
    await persistDb(updated);
  }

  async function handleClearDb() {
    if (!window.confirm(t.dbClearConfirm)) return;
    if (await persistDb([])) flash(t.dbSaved);
  }

  function reshuffleTeams() {
    setShuffleSeed(uid());
  }

  function toggleLockTeam(teamIndex) {
    setLockedTeam((prev) => {
      if (prev && prev.index === teamIndex) return null;
      const members = result.teams[teamIndex]?.members.map((member) => member.id) || [];
      if (!members.length) return prev;
      return { index: teamIndex, members };
    });
  }

  function copyToClipboard(text) {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => flash(t.copied),
        () => flash(t.copyFailed)
      );
    } else {
      flash(t.copyUnavailable);
    }
  }

  const countField = (label, value, onChange) => html`
    <label class="flex flex-col text-sm text-gray-700">
      ${label}
      <input
        type="number"
        min="1"
        step="1"
        inputmode="numeric"
        value=${value}
        onChange=${(event) => onChange(event.target.value)}
        class=${`mt-1 rounded focus:ring-indigo-500 ${
          isWholeCount(parseCount(value))
            ? "border-gray-300 focus:border-indigo-500"
            : "border-red-400 focus:border-red-500"
        }`}
      />
      ${!isWholeCount(parseCount(value)) &&
      html`<span class="mt-1 text-xs text-red-600">${t.wholeNumberHint}</span>`}
    </label>
  `;

  return html`
    <div class="space-y-6">
      <section class="bg-white shadow rounded-lg p-6">
        <div class="flex justify-between items-center mb-4">
          <h1 class="text-2xl font-semibold text-gray-900">${t.title}</h1>
          <button
            onClick=${() => setLanguage(language === "en" ? "es" : "en")}
            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
          >
            ${language === "en" ? "Español" : "English"}
          </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${countField(t.numTeams, numTeamsInput, setNumTeamsInput)}
          ${countField(t.teamSize, teamSizeInput, setTeamSizeInput)}
        </div>
        ${Number.isInteger(numTeams) &&
        numTeams > 1 &&
        html`<p class="mt-1 text-xs text-gray-500">${t.seedRuleNote(numTeams)}</p>`}
      </section>

      ${notice && html`
        <div class="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg px-4 py-2">
          ${notice}
        </div>
      `}

      <section class="bg-white shadow rounded-lg p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">${t.playerList}</h2>
        <p class="text-sm text-gray-600 mb-4">${t.pasteInstructions}</p>
        <textarea
          value=${pasteText}
          onChange=${(event) => setPasteText(event.target.value)}
          rows="4"
          class="w-full rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
          placeholder=${t.examplePlaceholder}
        ></textarea>
        <div class="flex flex-wrap justify-end gap-2 mt-3">
          <button
            onClick=${handlePaste}
            class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            ${t.addPlayers}
          </button>
          ${dbSession && html`
            <button
              onClick=${handlePasteWithDb}
              class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              ${t.addPlayersFromDb}
            </button>
          `}
        </div>
      </section>

      ${warnings.length > 0 && html`
        <section class="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <ul class="space-y-1 text-sm text-amber-900 list-disc list-inside">
            ${warnings.map((message, index) => html`<li key=${index}>${message}</li>`)}
          </ul>
        </section>
      `}

      <section class="bg-white shadow rounded-lg p-6 overflow-x-auto">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">${t.players}</h2>
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t.name}</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t.score}</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${t.pos}</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            ${players.map(
              (player) => html`
                <tr key=${player.id}>
                  <td class="px-3 py-2">
                    <input
                      type="text"
                      value=${player.name ?? ""}
                      onChange=${(event) => updatePlayer(player.id, "name", event.target.value)}
                      class="w-24 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </td>
                  <td class="px-3 py-2 whitespace-nowrap">
                    <input
                      type="number"
                      min=${MIN_SCORE}
                      max=${MAX_SCORE}
                      step="0.1"
                      value=${player.score ?? ""}
                      onChange=${(event) => updatePlayer(player.id, "score", event.target.value)}
                      onBlur=${(event) =>
                        updatePlayer(player.id, "score", coerceScore(event.target.value).score)}
                      class="w-16 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </td>
                  <td class="px-3 py-2 whitespace-nowrap">
                    <input
                      type="text"
                      value=${player.pos1 ?? ""}
                      onChange=${(event) => updatePlayer(player.id, "pos1", event.target.value)}
                      class="w-16 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </td>
                  <td class="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick=${() => removePlayer(player.id)}
                      class="px-3 py-1 text-sm text-red-600 hover:text-red-800"
                      aria-label=${t.removePlayer}
                    >
                      -
                    </button>
                  </td>
                </tr>
              `
            )}
          </tbody>
        </table>
        ${players.length === 0 && html`<p class="text-sm text-gray-500 mt-3">${t.noPlayersYet}</p>`}
        ${players.length > 0 && html`
          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <button
              onClick=${handleUploadToDb}
              disabled=${dbSaving}
              class="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
            >
              ${t.uploadToDb}
            </button>
            <button
              onClick=${() => copyToClipboard(buildClipboardPlayers(players))}
              class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              ${t.copyPlayers}
            </button>
            <button
              onClick=${reshuffleTeams}
              class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              ${t.shuffleTeams}
            </button>
          </div>
        `}
      </section>

      <section class="bg-white shadow rounded-lg p-6">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold text-gray-900">${t.teams}</h2>
          <button
            onClick=${() => setPlayers(normalizePlayers(players))}
            class="px-3 py-1 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
          >
            ${t.cleanInputs}
          </button>
        </div>
        ${!countsValid && html`
          <p class="text-sm text-red-600 mt-3">${t.errorWholeNumbers}</p>
        `}
        ${countsValid && errorMessage && html`
          <p class="text-sm text-red-600 mt-3">${errorMessage}</p>
        `}
        ${countsValid && !errorMessage && html`
          <p class="text-sm text-gray-500 mt-2">
            ${t.spreadLabel}: ${result.spread.toFixed(1)}
          </p>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            ${displayedTeams.map((team, index) => {
              const isLocked = lockedTeam && lockedTeam.index === index;
              return html`
                <div key=${team.name} class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-start justify-between">
                    <div>
                      <h3 class="text-lg font-semibold text-gray-900">
                        ${translateTeamName(team.name, t)}
                      </h3>
                      <p class="text-sm text-gray-500">${t.scoreLabel}: ${team.score.toFixed(1)}</p>
                      ${result.allPos.length > 0 && html`
                        <p class="text-xs text-gray-400 mt-0.5">
                          ${result.allPos.map((pos) => `${pos}: ${(team.posScore?.[pos] || 0).toFixed(1)}`).join(' · ')}
                        </p>
                      `}
                    </div>
                    <button
                      onClick=${() => toggleLockTeam(index)}
                      class=${`px-3 py-1 text-xs font-medium rounded ${
                        isLocked ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      ${isLocked ? t.unlock : t.lock}
                    </button>
                  </div>
                  <ul class="mt-3 space-y-2">
                    ${team.members.map(
                      (member) => html`
                        <li key=${member.id} class="text-sm text-gray-800">
                          <span class="font-medium">${member.name}</span>
                          ${seededIds.has(member.id) &&
                          html`<span class="ml-1" title=${t.topPlayer}>★</span>`}
                          ${member.pos1 && html`<span class="text-gray-500"> — ${member.pos1}</span>`}
                          <span class="ml-2 text-gray-500">(${member.score})</span>
                        </li>
                      `
                    )}
                  </ul>
                  ${team.members.length === 0 && html`
                    <p class="text-sm text-gray-500 mt-2">${t.noPlayersAssigned}</p>
                  `}
                </div>
              `;
            })}
          </div>
          <div class="mt-6 flex flex-wrap justify-end gap-2">
            <button
              onClick=${() => copyToClipboard(buildClipboardTeams(displayedTeams))}
              class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              ${t.copyTeams}
            </button>
            <button
              onClick=${() => copyToClipboard(buildClipboardTeamsWithScores(displayedTeams))}
              class="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700"
            >
              ${t.copyTeamsWithScores}
            </button>
            <button
              onClick=${() => copyToClipboard(buildClipboardTeamsWithPositions(displayedTeams))}
              class="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
            >
              ${t.copyTeamsWithPositions}
            </button>
          </div>
        `}
      </section>

      ${countsValid &&
      !errorMessage &&
      result.subs.some((group) => group.players.length > 0) &&
      html`
        <section class="bg-white shadow rounded-lg p-6">
          <h2 class="text-xl font-semibold text-gray-900 mb-3">${t.subs}</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${result.subs.map(
              (group) => html`
                <div key=${group.teamName} class="border border-gray-200 rounded-lg p-4">
                  <h3 class="text-lg font-semibold text-gray-900">
                    ${t.subsFor} ${translateTeamName(group.teamName, t)}
                  </h3>
                  ${group.players.length === 0
                    ? html`<p class="text-sm text-gray-500 mt-2">${t.noSubsAssigned}</p>`
                    : html`
                        <ul class="mt-3 space-y-2">
                          ${group.players.map(
                            (player) => html`
                              <li key=${player.id} class="text-sm text-gray-700">
                                <span class="font-medium">${player.name}</span>
                                <span class="ml-2 text-gray-500">(${player.score})</span>
                              </li>
                            `
                          )}
                        </ul>
                      `}
                </div>
              `
            )}
          </div>
        </section>
      `}

      <section class="bg-white shadow rounded-lg p-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-semibold text-gray-900">${t.database}</h2>
            ${dbSession && html`
              <p class="text-xs text-gray-500 mt-1">
                ${t.dbEntries(db.length)} · ${t.dbLocalOnly}
              </p>
            `}
          </div>
          ${dbSession && html`
            <div class="flex gap-2">
              <button
                onClick=${() => setShowDb(!showDb)}
                class="px-3 py-1 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
              >
                ${showDb ? t.hideDatabase : t.showDatabase}
              </button>
              <button
                onClick=${handleLockDb}
                disabled=${dbSaving}
                class="px-3 py-1 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                ${t.lockDatabase}
              </button>
            </div>
          `}
        </div>
        ${!dbSession && html`
          <form onSubmit=${handleUnlockDb} class="mt-4 flex flex-wrap items-end gap-3">
            <label class="flex flex-col text-sm text-gray-700">
              ${t.dbPassword}
              <input
                type="password"
                value=${dbPassword}
                onChange=${(event) => setDbPassword(event.target.value)}
                autocomplete="off"
                class="mt-1 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
              />
            </label>
            <button
              type="submit"
              disabled=${dbUnlocking || !dbPassword}
              class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              ${dbUnlocking ? t.dbUnlocking : t.unlockDatabase}
            </button>
          </form>
          <p class="text-xs text-gray-500 mt-2">${t.dbLockedHint}</p>
          ${dbError && html`
            <p class="text-sm text-red-600 mt-2" role="alert">
              ${dbError === "invalid" ? t.dbWrongPassword :
                dbError === "corrupt" ? t.dbCorrupt : t.dbUnavailable}
            </p>
          `}
        `}
        ${dbSession && showDb && html`
          <div class="mt-4">
            ${db.length === 0
              ? html`<p class="text-sm text-gray-500">${t.dbEmpty}</p>`
              : html`
                  <ul class="divide-y divide-gray-200 max-h-72 overflow-y-auto">
                    ${db.map(
                      (entry) => html`
                        <li key=${entry.name} class="flex items-center justify-between py-2 text-sm">
                          <span class="text-gray-800">
                            ${entry.name}
                            ${entry.pos1 && html`<span class="text-gray-500"> — ${entry.pos1}</span>`}
                            <span class="ml-2 text-gray-500">(${entry.score})</span>
                          </span>
                          <button
                            onClick=${() => handleDeleteDbEntry(entry.name)}
                            disabled=${dbSaving}
                            class="px-2 py-1 text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            ${t.dbDelete}
                          </button>
                        </li>
                      `
                    )}
                  </ul>
                  <div class="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      onClick=${() => copyToClipboard(buildClipboardPlayers(db))}
                      class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                    >
                      ${t.dbExport}
                    </button>
                    <button
                      onClick=${handleClearDb}
                      disabled=${dbSaving}
                      class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm disabled:opacity-50"
                    >
                      ${t.dbClear}
                    </button>
                  </div>
                `}
          </div>
        `}
      </section>
    </div>
  `;
}

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(html`<${App} />`);
}

export { App };
