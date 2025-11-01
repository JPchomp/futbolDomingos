import {
  uid,
  parseListIgnoreNumbers,
  buildClipboardTeams,
  normalizePlayers,
  computeAssignments,
} from "./logic.js";

const { useMemo, useState } = React;
const html = htm.bind(React.createElement);

function App() {
  const [players, setPlayers] = useState([]);
  const [numTeams, setNumTeams] = useState(2);
  const [teamSize, setTeamSize] = useState(5);
  const [shuffleSeed, setShuffleSeed] = useState(() => uid());
  const [sameNatWeight, setSameNatWeight] = useState(1.0);
  const [posWeight, setPosWeight] = useState(2.0);
  const [scoreWeight, setScoreWeight] = useState(1.0);
  const [pasteText, setPasteText] = useState("");
  const [appendMode, setAppendMode] = useState(false);
  const [lockedTeam, setLockedTeam] = useState(null);

  const result = useMemo(
    () =>
      computeAssignments(players, {
        numTeams,
        teamSize,
        seed: shuffleSeed,
        sameNatWeight,
        posWeight,
        scoreWeight,
      }, lockedTeam),
    [players, numTeams, teamSize, shuffleSeed, sameNatWeight, posWeight, scoreWeight, lockedTeam]
  );

  function updatePlayer(id, field, value) {
    setPlayers((prev) => prev.map((player) => (player.id === id ? { ...player, [field]: value } : player)));
  }

  function addPlayer() {
    setPlayers((prev) => [
      ...prev,
      { id: uid(), name: "", score: 5, nat: "NA", pos1: "" },
    ]);
  }

  function removePlayer(id) {
    setPlayers((prev) => prev.filter((player) => player.id !== id));
  }

  function handlePaste() {
    const parsed = parseListIgnoreNumbers(pasteText);
    if (!appendMode) {
      setPlayers(parsed);
    } else {
      setPlayers((prev) => [...prev, ...parsed]);
    }
    setPasteText("");
  }

  function clearAll() {
    setPlayers([]);
    setLockedTeam(null);
  }

  function reshuffleTeams() {
    setShuffleSeed(uid());
  }

  function toggleLockTeam(teamIndex) {
    setLockedTeam((prev) => {
      if (!prev || prev.index !== teamIndex) {
        const members = result.teams[teamIndex]?.members.map((member) => member.id) || [];
        return { index: teamIndex, members };
      }
      return null;
    });
  }

  function copyTeams() {
    const text = buildClipboardTeams(result.teams);
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {
        alert("Copy failed. Please copy manually.");
      });
    } else {
      alert("Clipboard access unavailable. Please copy manually.");
    }
  }

  return html`
    <div class="space-y-6">
      <section class="bg-white shadow rounded-lg p-6">
        <h1 class="text-2xl font-semibold text-gray-900 mb-4">Balanced Team Builder</h1>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label class="flex flex-col text-sm text-gray-700">
            Number of teams
            <input
              type="number"
              min="1"
              value=${numTeams}
              onChange=${(event) => setNumTeams(Number(event.target.value) || 0)}
              class="mt-1 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
          <label class="flex flex-col text-sm text-gray-700">
            Team size
            <input
              type="number"
              min="1"
              value=${teamSize}
              onChange=${(event) => setTeamSize(Number(event.target.value) || 0)}
              class="mt-1 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
          <label class="flex flex-col text-sm text-gray-700">
            Same nationality weight
            <input
              type="number"
              step="0.1"
              value=${sameNatWeight}
              onChange=${(event) => setSameNatWeight(Number(event.target.value) || 0)}
              class="mt-1 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
          <label class="flex flex-col text-sm text-gray-700">
            Position weight
            <input
              type="number"
              step="0.1"
              value=${posWeight}
              onChange=${(event) => setPosWeight(Number(event.target.value) || 0)}
              class="mt-1 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
          <label class="flex flex-col text-sm text-gray-700">
            Score weight
            <input
              type="number"
              step="0.1"
              value=${scoreWeight}
              onChange=${(event) => setScoreWeight(Number(event.target.value) || 0)}
              class="mt-1 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
        </div>
        <div class="mt-4 flex flex-wrap gap-3">
          <button
            onClick=${addPlayer}
            class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Add player
          </button>
          <button
            onClick=${clearAll}
            class="px-4 py-2 bg-gray-100 text-gray-900 rounded hover:bg-gray-200"
          >
            Clear all
          </button>
        </div>
      </section>

      <section class="bg-white shadow rounded-lg p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Bulk import</h2>
        <p class="text-sm text-gray-600 mb-4">
          Paste a list of players (optionally with ratings) to quickly populate the table.
        </p>
        <textarea
          value=${pasteText}
          onChange=${(event) => setPasteText(event.target.value)}
          rows="4"
          class="w-full rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
          placeholder=${"Example:\n8.5 John Doe\nCarlos\n7.1 - Jane Smith"}
        ></textarea>
        <div class="flex items-center justify-between mt-3">
          <label class="flex items-center text-sm text-gray-700">
            <input
              type="checkbox"
              checked=${appendMode}
              onChange=${(event) => setAppendMode(event.target.checked)}
              class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
            />
            <span class="ml-2">Append to existing list</span>
          </label>
          <button
            onClick=${handlePaste}
            class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Parse and add players
          </button>
        </div>
      </section>

      <section class="bg-white shadow rounded-lg p-6 overflow-x-auto">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Players</h2>
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nat</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Primary position</th>
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
                      value=${player.name}
                      onChange=${(event) => updatePlayer(player.id, "name", event.target.value)}
                      class="w-full min-w-[12rem] rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </td>
                  <td class="px-3 py-2 whitespace-nowrap">
                    <input
                      type="number"
                      value=${player.score}
                      onChange=${(event) => updatePlayer(player.id, "score", event.target.value)}
                      class="w-24 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </td>
                  <td class="px-3 py-2 whitespace-nowrap">
                    <input
                      type="text"
                      value=${player.nat}
                      onChange=${(event) =>
                        updatePlayer(player.id, "nat", event.target.value.toUpperCase())
                      }
                      class="w-20 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 text-center"
                      maxLength="3"
                    />
                  </td>
                  <td class="px-3 py-2 whitespace-nowrap">
                    <input
                      type="text"
                      value=${player.pos1}
                      onChange=${(event) => updatePlayer(player.id, "pos1", event.target.value)}
                      class="w-28 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </td>
                  <td class="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick=${() => removePlayer(player.id)}
                      class="px-3 py-1 text-sm text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              `
            )}
          </tbody>
        </table>
        ${players.length === 0 && html`<p class="text-sm text-gray-500 mt-3">No players added yet.</p>`}
        ${players.length > 0 && html`
          <div class="mt-4 flex justify-end">
            <button
              onClick=${reshuffleTeams}
              class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              Shuffle teams
            </button>
          </div>
        `}
      </section>

      <section class="bg-white shadow rounded-lg p-6">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold text-gray-900">Teams</h2>
          <button
            onClick=${() => setPlayers(normalizePlayers(players))}
            class="px-3 py-1 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
          >
            Clean inputs
          </button>
        </div>
        ${result.error && html`<p class="text-sm text-red-600 mt-3">${result.error}</p>`}
        ${!result.error && html`
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            ${result.teams.map((team, index) => {
              const isLocked = lockedTeam && lockedTeam.index === index;
              return html`
                <div key=${team.name} class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-start justify-between">
                    <div>
                      <h3 class="text-lg font-semibold text-gray-900">${team.name}</h3>
                      <p class="text-sm text-gray-500">Score: ${team.score.toFixed(1)}</p>
                    </div>
                    <button
                      onClick=${() => toggleLockTeam(index)}
                      class=${`px-3 py-1 text-xs font-medium rounded ${
                        isLocked ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      ${isLocked ? "Unlock" : "Lock"}
                    </button>
                  </div>
                  <ul class="mt-3 space-y-2">
                  ${team.members.map(
                    (member) => html`
                      <li key=${member.id} class="text-sm text-gray-800">
                        <span class="font-medium">${member.name}</span>
                        ${member.pos1 && html`<span class="text-gray-500"> — ${member.pos1}</span>`}
                          <span class="ml-2 text-gray-500">(${member.score})</span>
                        </li>
                      `
                    )}
                  </ul>
                  ${team.members.length === 0 && html`
                    <p class="text-sm text-gray-500 mt-2">No players assigned.</p>
                  `}
                </div>
              `;
            })}
          </div>
          <div class="mt-6 flex justify-end">
            <button
              onClick=${copyTeams}
              class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Copy teams
            </button>
          </div>
        `}
      </section>

      ${
        !result.error &&
        result.subs.some((group) => group.players.length > 0) &&
        html`
          <section class="bg-white shadow rounded-lg p-6">
            <h2 class="text-xl font-semibold text-gray-900 mb-3">Subs</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              ${result.subs.map(
                (group) => html`
                  <div class="border border-gray-200 rounded-lg p-4">
                    <h3 class="text-lg font-semibold text-gray-900">Subs for ${group.teamName}</h3>
                    ${group.players.length === 0
                      ? html`<p class="text-sm text-gray-500 mt-2">No subs assigned.</p>`
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
        `
      }
    </div>
  `;
}

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(html`<${App} />`);
}

export { App };
