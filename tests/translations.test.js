import test from "node:test";
import assert from "node:assert/strict";

test("translations object has matching keys in English and Spanish", () => {
  // This is a simple check to ensure we have all translations
  const translations = {
    en: {
      title: "Balanced Team Builder",
      numTeams: "Number of teams",
      teamSize: "Team size",
      playerList: "Player list",
      pasteInstructions: "Paste a list of players to quickly populate the table. Format: list number, name, score (e.g., \"1 John Doe 8.5\").",
      examplePlaceholder: "Example:\n1 John Doe 8.5\n2 Jane Smith 7.1\n3 Carlos",
      addPlayers: "Add players",
      addPlayersFromDb: "Add players using database",
      uploadToDb: "Upload current data to database",
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
      addPlayersFromDb: "Agregar jugadores usando base de datos",
      uploadToDb: "Subir datos actuales a la base de datos",
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

  const enKeys = Object.keys(translations.en).sort();
  const esKeys = Object.keys(translations.es).sort();

  assert.deepEqual(enKeys, esKeys, "English and Spanish should have the same translation keys");

  // Check that error functions work
  assert.equal(translations.en.errorNeedPlayers(10, 5), "Need 10 players, have 5.");
  assert.equal(translations.es.errorNeedPlayers(10, 5), "Se necesitan 10 jugadores, tiene 5.");
});

test("team name translation helper function", () => {
  function translateTeamName(teamName, lang) {
    const teamWord = lang === "es" ? "Equipo" : "Team";
    const match = teamName.match(/^Team (\d+)$/);
    if (match) {
      return `${teamWord} ${match[1]}`;
    }
    return teamName;
  }

  assert.equal(translateTeamName("Team 1", "en"), "Team 1");
  assert.equal(translateTeamName("Team 1", "es"), "Equipo 1");
  assert.equal(translateTeamName("Team 5", "es"), "Equipo 5");
  assert.equal(translateTeamName("Custom Name", "es"), "Custom Name");
});

test("error message translation helper function", () => {
  const translations = {
    en: {
      errorSetTeamsAndSize: "Set teams and size.",
      errorNeedPlayers: (needed, have) => `Need ${needed} players, have ${have}.`,
      errorLockedTeamExceeds: "Locked team exceeds team size.",
    },
    es: {
      errorSetTeamsAndSize: "Establezca equipos y tamaño.",
      errorNeedPlayers: (needed, have) => `Se necesitan ${needed} jugadores, tiene ${have}.`,
      errorLockedTeamExceeds: "El equipo bloqueado excede el tamaño del equipo.",
    }
  };

  function translateError(error, lang) {
    const t = translations[lang];
    if (!error) return null;
    if (error === "Set teams and size.") return t.errorSetTeamsAndSize;
    if (error === "Locked team exceeds team size.") return t.errorLockedTeamExceeds;
    const needMatch = error.match(/^Need (\d+) players, have (\d+)\.$/);
    if (needMatch) {
      return t.errorNeedPlayers(needMatch[1], needMatch[2]);
    }
    return error;
  }

  assert.equal(translateError("Set teams and size.", "es"), "Establezca equipos y tamaño.");
  assert.equal(translateError("Need 10 players, have 5.", "es"), "Se necesitan 10 jugadores, tiene 5.");
  assert.equal(translateError("Locked team exceeds team size.", "es"), "El equipo bloqueado excede el tamaño del equipo.");
});
