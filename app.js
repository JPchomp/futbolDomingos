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
  const [posWeight, setPosWeight] = useState(2.0);
  const [scoreWeight, setScoreWeight] = useState(1.0);
  const [pasteText, setPasteText] = useState("");
  const [lockedTeam, setLockedTeam] = useState(null);

  const result = useMemo(
    () =>
      computeAssignments(players, {
        numTeams: numTeams || 0,
        teamSize: teamSize || 0,
        seed: shuffleSeed,
        posWeight: posWeight || 0,
        scoreWeight: scoreWeight || 0,
      }, lockedTeam),
    [players, numTeams, teamSize, shuffleSeed, posWeight, scoreWeight, lockedTeam]
  );

  function updatePlayer(id, field, value) {
    setPlayers((prev) => prev.map((player) => (player.id === id ? { ...player, [field]: value } : player)));
  }

  function removePlayer(id) {
    setPlayers((prev) => prev.filter((player) => player.id !== id));
  }

  function handlePaste() {
    const parsed = parseListIgnoreNumbers(pasteText);
    setPlayers((prev) => [...prev, ...parsed]);
    setPasteText("");
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
              onChange=${(event) => setNumTeams(event.target.value === "" ? "" : Number(event.target.value))}
              class="mt-1 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
          <label class="flex flex-col text-sm text-gray-700">
            Team size
            <input
              type="number"
              min="1"
              value=${teamSize}
              onChange=${(event) => setTeamSize(event.target.value === "" ? "" : Number(event.target.value))}
              class="mt-1 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
          <label class="flex flex-col text-sm text-gray-700">
            Position importance
            <input
              type="number"
              step="0.1"
              value=${posWeight}
              onChange=${(event) => setPosWeight(event.target.value === "" ? "" : Number(event.target.value))}
              class="mt-1 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
          <label class="flex flex-col text-sm text-gray-700">
            Score importance
            <input
              type="number"
              step="0.1"
              value=${scoreWeight}
              onChange=${(event) => setScoreWeight(event.target.value === "" ? "" : Number(event.target.value))}
              class="mt-1 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
        </div>
      </section>

      <section class="bg-white shadow rounded-lg p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Player list</h2>
        <p class="text-sm text-gray-600 mb-4">
          Paste a list of players to quickly populate the table. Format: list number, name, score (e.g., "1 John Doe 8.5").
        </p>
        <textarea
          value=${pasteText}
          onChange=${(event) => setPasteText(event.target.value)}
          rows="4"
          class="w-full rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
          placeholder=${"Example:\n1 John Doe 8.5\n2 Jane Smith 7.1\n3 Carlos"}
        ></textarea>
        <div class="flex justify-end mt-3">
          <button
            onClick=${handlePaste}
            class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Add players
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
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pos.</th>
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
                      class="w-24 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </td>
                  <td class="px-3 py-2 whitespace-nowrap">
                    <input
                      type="number"
                      value=${player.score}
                      onChange=${(event) => updatePlayer(player.id, "score", event.target.value === "" ? "" : Number(event.target.value))}
                      class="w-16 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </td>
                  <td class="px-3 py-2 whitespace-nowrap">
                    <input
                      type="text"
                      value=${player.pos1}
                      onChange=${(event) => updatePlayer(player.id, "pos1", event.target.value)}
                      class="w-16 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </td>
                  <td class="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick=${() => removePlayer(player.id)}
                      class="px-3 py-1 text-sm text-red-600 hover:text-red-800"
                      aria-label="Remove player"
                    >
                      -
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
