const MAX_LISTED_NAMES = 6;

export function formatNames(names) {
  const list = names || [];
  if (list.length <= MAX_LISTED_NAMES) return list.join(", ");
  return `${list.slice(0, MAX_LISTED_NAMES).join(", ")} (+${list.length - MAX_LISTED_NAMES})`;
}

export const translations = {
  en: {
    title: "Balanced Team Builder",
    numTeams: "Number of teams",
    teamSize: "Team size",
    wholeNumberHint: "Whole numbers only.",
    balancePriority: "Balance priority",
    balanceScore: "Even ratings",
    balanceBalanced: "Balanced",
    balancePositions: "Even positions",
    balanceHint:
      "Positions are fitted first, then ratings are levelled within that fit. Position slots are only given back if the rating gap is still wider than this setting allows.",
    playerList: "Player list",
    pasteInstructions:
      "Paste a list of players to quickly populate the table. Format: list number, name, score (e.g., \"1 John Doe 8.5\"). Ratings run from 0 to 10; a trailing number outside that range is treated as part of the name.",
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
    spreadLabel: "Spread between teams",
    topPlayer: "Top-rated player, one per team",
    removePlayer: "Remove player",
    seedRuleNote: (n) => `The ${n} highest-rated players are split one per team.`,
    errorSetTeamsAndSize: "Set teams and size.",
    errorNeedPlayers: (needed, have) => `Need ${needed} players, have ${have}.`,
    errorLockedTeamExceeds: "Locked team exceeds team size.",
    errorWholeNumbers: "Teams and size must be whole numbers.",
    errorInternal: "Could not build the teams. Check the inputs and try again.",
    warnScoreOutOfRange: (names) =>
      `Ignored a rating outside 0–10 for: ${names}. Those players default to 5.`,
    warnScoreClamped: (names) => `Ratings outside 0–10 were clamped for: ${names}.`,
    warnScoreMissing: (names) => `No rating set for: ${names}. Using 5.`,
    warnDuplicateNames: (names) =>
      `Repeated names: ${names}. They share one database entry — add a surname or initial to tell them apart.`,
    warnLockIgnored: "The locked team no longer exists, so the lock was dropped.",
    warnLockedMissing: (count) =>
      `${count} locked player(s) are no longer on the roster and were dropped from the lock.`,
    warnLockedImbalance: (spread) =>
      `The locked team leaves a ${spread}-point gap between teams. Unlock it to balance properly.`,
    warnSeedRuleRelaxed:
      "A locked team holds more than one of the top players, so not every team could get one.",
    warnPositionsUneven: (positions) =>
      `These positions do not divide evenly between the teams: ${positions}.`,
    warnPositionsReleased: (count, spread) =>
      `Moved ${count} player(s) out of their position's fair share to bring the rating gap down to ${spread}. Raise the acceptable gap to keep positions strict.`,
    database: "Player database",
    showDatabase: "Show database",
    hideDatabase: "Hide database",
    dbEntries: (count) => `${count} player(s) stored`,
    dbEmpty: "The database is empty. Use \"Upload current data\" to fill it.",
    dbDelete: "Delete",
    dbClear: "Clear database",
    dbClearConfirm: "Delete every stored player? This cannot be undone.",
    dbExport: "Copy database",
    dbSaved: "Database updated.",
    dbSaveFailed: "Could not save. Browser storage is full or unavailable.",
    dbMatched: (matched, total) => `${matched} of ${total} players matched the database.`,
    dbLocalOnly: "Stored in this browser only.",
    copyFailed: "Copy failed. Please copy manually.",
    copyUnavailable: "Clipboard access unavailable. Please copy manually.",
    copied: "Copied.",
  },
  es: {
    title: "Creador de Equipos Balanceados",
    numTeams: "Número de equipos",
    teamSize: "Tamaño del equipo",
    wholeNumberHint: "Solo números enteros.",
    balancePriority: "Prioridad de balance",
    balanceScore: "Puntuaciones parejas",
    balanceBalanced: "Equilibrado",
    balancePositions: "Posiciones parejas",
    balanceHint:
      "Primero se ajustan las posiciones y luego se nivelan las puntuaciones dentro de ese ajuste. Solo se ceden cupos de posición si la diferencia de puntuación sigue siendo mayor de lo que permite este ajuste.",
    playerList: "Lista de jugadores",
    pasteInstructions:
      "Pegue una lista de jugadores para poblar rápidamente la tabla. Formato: número de lista, nombre, puntuación (ej., \"1 John Doe 8.5\"). Las puntuaciones van de 0 a 10; un número final fuera de ese rango se toma como parte del nombre.",
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
    spreadLabel: "Diferencia entre equipos",
    topPlayer: "Jugador mejor puntuado, uno por equipo",
    removePlayer: "Quitar jugador",
    seedRuleNote: (n) => `Los ${n} jugadores mejor puntuados se reparten uno por equipo.`,
    errorSetTeamsAndSize: "Establezca equipos y tamaño.",
    errorNeedPlayers: (needed, have) => `Se necesitan ${needed} jugadores, tiene ${have}.`,
    errorLockedTeamExceeds: "El equipo bloqueado excede el tamaño del equipo.",
    errorWholeNumbers: "Los equipos y el tamaño deben ser números enteros.",
    errorInternal: "No se pudieron armar los equipos. Revise los datos e intente de nuevo.",
    warnScoreOutOfRange: (names) =>
      `Se ignoró una puntuación fuera de 0–10 para: ${names}. Esos jugadores quedan en 5.`,
    warnScoreClamped: (names) => `Puntuaciones fuera de 0–10 ajustadas para: ${names}.`,
    warnScoreMissing: (names) => `Sin puntuación para: ${names}. Se usa 5.`,
    warnDuplicateNames: (names) =>
      `Nombres repetidos: ${names}. Comparten una sola entrada en la base — agregue un apellido o inicial para distinguirlos.`,
    warnLockIgnored: "El equipo bloqueado ya no existe, así que se quitó el bloqueo.",
    warnLockedMissing: (count) =>
      `${count} jugador(es) bloqueado(s) ya no están en la lista y se quitaron del bloqueo.`,
    warnLockedImbalance: (spread) =>
      `El equipo bloqueado deja una diferencia de ${spread} puntos entre equipos. Desbloquéelo para balancear bien.`,
    warnSeedRuleRelaxed:
      "Un equipo bloqueado tiene más de uno de los mejores jugadores, así que no todos los equipos pudieron recibir uno.",
    warnPositionsUneven: (positions) =>
      `Estas posiciones no se dividen de forma pareja entre los equipos: ${positions}.`,
    warnPositionsReleased: (count, spread) =>
      `Se movió ${count} jugador(es) fuera de su cupo de posición para bajar la diferencia de puntuación a ${spread}. Aumente la diferencia aceptable para mantener las posiciones estrictas.`,
    database: "Base de datos de jugadores",
    showDatabase: "Ver base de datos",
    hideDatabase: "Ocultar base de datos",
    dbEntries: (count) => `${count} jugador(es) guardado(s)`,
    dbEmpty: "La base de datos está vacía. Use \"Subir datos actuales\" para llenarla.",
    dbDelete: "Eliminar",
    dbClear: "Vaciar base de datos",
    dbClearConfirm: "¿Eliminar todos los jugadores guardados? Esto no se puede deshacer.",
    dbExport: "Copiar base de datos",
    dbSaved: "Base de datos actualizada.",
    dbSaveFailed: "No se pudo guardar. El almacenamiento del navegador está lleno o no disponible.",
    dbMatched: (matched, total) =>
      `${matched} de ${total} jugadores coincidieron con la base de datos.`,
    dbLocalOnly: "Guardado solo en este navegador.",
    copyFailed: "No se pudo copiar. Copie manualmente.",
    copyUnavailable: "Portapapeles no disponible. Copie manualmente.",
    copied: "Copiado.",
  },
};

/** "Team 3" is generated in logic.js; show it in the reader's language. */
export function translateTeamName(teamName, t) {
  const match = String(teamName ?? "").match(/^Team (\d+)$/);
  return match ? `${t.team} ${match[1]}` : String(teamName ?? "");
}

export function translateError(result, t) {
  if (!result || !result.error) return null;
  const params = result.errorParams || {};
  switch (result.errorCode) {
    case "setTeamsAndSize":
      return t.errorSetTeamsAndSize;
    case "wholeNumbers":
      return t.errorWholeNumbers;
    case "lockedTooBig":
      return t.errorLockedTeamExceeds;
    case "needPlayers":
      return t.errorNeedPlayers(params.needed, params.have);
    case "internal":
      return t.errorInternal;
    default:
      return result.error;
  }
}

export function translateWarning(warning, t) {
  if (!warning) return null;
  switch (warning.code) {
    case "scoreOutOfRange":
      return t.warnScoreOutOfRange(formatNames(warning.names));
    case "scoreClamped":
      return t.warnScoreClamped(formatNames(warning.names));
    case "scoreMissing":
      return t.warnScoreMissing(formatNames(warning.names));
    case "duplicateNames":
      return t.warnDuplicateNames(formatNames(warning.names));
    case "lockIgnored":
      return t.warnLockIgnored;
    case "lockedMissing":
      return t.warnLockedMissing(warning.count);
    case "lockedImbalance":
      return t.warnLockedImbalance(warning.spread);
    case "seedRuleRelaxed":
      return t.warnSeedRuleRelaxed;
    case "positionsUneven":
      return t.warnPositionsUneven(formatNames(warning.positions));
    case "positionsReleased":
      return t.warnPositionsReleased(warning.count, warning.spread);
    default:
      return null;
  }
}
