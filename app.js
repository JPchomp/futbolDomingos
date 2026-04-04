import {
  uid,
  parseListIgnoreNumbers,
  buildClipboardTeams,
  buildClipboardTeamsWithScores,
  buildClipboardPlayers,
  normalizePlayers,
  computeAssignments,
} from "./logic.js";

const { useMemo, useState } = React;
const html = htm.bind(React.createElement);

const translations = {
  en: {
    title: "Balanced Team Builder",
    numTeams: "Number of teams",
    teamSize: "Team size",
    playerList: "Player list",
    pasteInstructions: "Paste a list of players to quickly populate the table. Format: list number, name, score (e.g., \"1 John Doe 8.5\").",
    examplePlaceholder: "Example:\n1 John Doe 8.5\n2 Jane Smith 7.1\n3 Carlos",
    addPlayers: "Add players",
    players: "Players",
    name: "Name",
    score: "Score",
    pos: "Pos.",
    noPlayersYet: "No players added yet.",
    shuffleTeams: "Shuffle teams",
    teams: "Teams",
    cleanInputs: "Clean inputs",
    lock: "Lock",
    unlock: "Unlock",
    noPlayersAssigned: "No players assigned.",
    copyTeams: "Copy teams",
    copyTeamsWithScores: "Copy teams with scores",
    copyPlayers: "Copy players",
    subs: "Subs",
    subsFor: "Subs for",
    noSubsAssigned: "No subs assigned.",
    language: "Language",
    team: "Team",
    scoreLabel: "Score",
    errorSetTeamsAndSize: "Set teams and size.",
    errorNeedPlayers: (needed, have) => `Need ${needed} players, have ${have}.`,
    errorLockedTeamExceeds: "Locked team exceeds team size.",
  },
  es: {
    title: "Creador de Equipos Balanceados",
    numTeams: "Número de equipos",
    teamSize: "Tamaño del equipo",
    playerList: "Lista de jugadores",
    pasteInstructions: "Pegue una lista de jugadores para poblar rápidamente la tabla. Formato: número de lista, nombre, puntuación (ej., \"1 John Doe 8.5\").",
    examplePlaceholder: "Ejemplo:\n1 John Doe 8.5\n2 Jane Smith 7.1\n3 Carlos",
    addPlayers: "Agregar jugadores",
    players: "Jugadores",
    name: "Nombre",
    score: "Puntuación",
    pos: "Pos.",
    noPlayersYet: "Aún no se han agregado jugadores.",
    shuffleTeams: "Mezclar equipos",
    teams: "Equipos",
    cleanInputs: "Limpiar entradas",
    lock: "Bloquear",
    unlock: "Desbloquear",
    noPlayersAssigned: "No hay jugadores asignados.",
    copyTeams: "Copiar equipos",
    copyTeamsWithScores: "Copiar equipos con puntuaciones",
    copyPlayers: "Copiar jugadores",
    subs: "Suplentes",
    subsFor: "Suplentes para",
    noSubsAssigned: "No hay suplentes asignados.",
    language: "Idioma",
    team: "Equipo",
    scoreLabel: "Puntuación",
    errorSetTeamsAndSize: "Establezca equipos y tamaño.",
    errorNeedPlayers: (needed, have) => `Se necesitan ${needed} jugadores, tiene ${have}.`,
    errorLockedTeamExceeds: "El equipo bloqueado excede el tamaño del equipo.",
  }
};

function App() {
  const [players, setPlayers] = useState([]);
  const [numTeams, setNumTeams] = useState(2);
  const [teamSize, setTeamSize] = useState(5);
  const [shuffleSeed, setShuffleSeed] = useState(() => uid());
  const posWeight = 5;
  const scoreWeight = 5;
  const [pasteText, setPasteText] = useState("");
  const [lockedTeam, setLockedTeam] = useState(null);
  const [language, setLanguage] = useState("en");
  
  const t = translations[language];

  // Helper function to translate team names
  function translateTeamName(teamName) {
    const match = teamName.match(/^Team (\d+)$/);
    if (match) {
      return `${t.team} ${match[1]}`;
    }
    return teamName;
  }

  // Helper function to translate error messages
  function translateError(error) {
    if (!error) return null;
    if (error === "Set teams and size.") return t.errorSetTeamsAndSize;
    if (error === "Locked team exceeds team size.") return t.errorLockedTeamExceeds;
    const needMatch = error.match(/^Need (\d+) players, have (\d+)\.$/);
    if (needMatch) {
      return t.errorNeedPlayers(needMatch[1], needMatch[2]);
    }
    return error;
  }

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

  function copyToClipboard(text) {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {
        alert("Copy failed. Please copy manually.");
      });
    } else {
      alert("Clipboard access unavailable. Please copy manually.");
    }
  }

  function copyTeams() {
    copyToClipboard(buildClipboardTeams(result.teams));
  }

  function copyTeamsWithScores() {
    copyToClipboard(buildClipboardTeamsWithScores(result.teams));
  }

  function copyPlayers() {
    copyToClipboard(buildClipboardPlayers(players));
  }

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
          <label class="flex flex-col text-sm text-gray-700">
            ${t.numTeams}
            <input
              type="number"
              min="1"
              value=${numTeams}
              onChange=${(event) => setNumTeams(event.target.value === "" ? "" : Number(event.target.value))}
              class="mt-1 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
          <label class="flex flex-col text-sm text-gray-700">
            ${t.teamSize}
            <input
              type="number"
              min="1"
              value=${teamSize}
              onChange=${(event) => setTeamSize(event.target.value === "" ? "" : Number(event.target.value))}
              class="mt-1 rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
        </div>
      </section>

      <section class="bg-white shadow rounded-lg p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">${t.playerList}</h2>
        <p class="text-sm text-gray-600 mb-4">
          ${t.pasteInstructions}
        </p>
        <textarea
          value=${pasteText}
          onChange=${(event) => setPasteText(event.target.value)}
          rows="4"
          class="w-full rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
          placeholder=${t.examplePlaceholder}
        ></textarea>
        <div class="flex justify-end mt-3">
          <button
            onClick=${handlePaste}
            class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            ${t.addPlayers}
          </button>
        </div>
      </section>

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
        ${players.length === 0 && html`<p class="text-sm text-gray-500 mt-3">${t.noPlayersYet}</p>`}
        ${players.length > 0 && html`
          <div class="mt-4 flex justify-end gap-2">
            <button
              onClick=${copyPlayers}
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
        ${result.error && html`<p class="text-sm text-red-600 mt-3">${translateError(result.error)}</p>`}
        ${!result.error && html`
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            ${result.teams.map((team, index) => {
              const isLocked = lockedTeam && lockedTeam.index === index;
              return html`
                <div key=${team.name} class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-start justify-between">
                    <div>
                      <h3 class="text-lg font-semibold text-gray-900">${translateTeamName(team.name)}</h3>
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
          <div class="mt-6 flex justify-end gap-2">
            <button
              onClick=${copyTeams}
              class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              ${t.copyTeams}
            </button>
            <button
              onClick=${copyTeamsWithScores}
              class="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700"
            >
              ${t.copyTeamsWithScores}
            </button>
          </div>
        `}
      </section>

      ${
        !result.error &&
        result.subs.some((group) => group.players.length > 0) &&
        html`
          <section class="bg-white shadow rounded-lg p-6">
            <h2 class="text-xl font-semibold text-gray-900 mb-3">${t.subs}</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              ${result.subs.map(
                (group) => html`
                  <div class="border border-gray-200 rounded-lg p-4">
                    <h3 class="text-lg font-semibold text-gray-900">${t.subsFor} ${translateTeamName(group.teamName)}</h3>
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
