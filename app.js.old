// Updated JS Code in app.js



{/* Other parts of the code omitted for brevity */}

// Updated onChange handlers:
<input type="number" ... onChange={(event) => setNumTeams(event.target.value === "" ? "" : Number(event.target.value))} />

<input type="number" ... onChange={(event) => setTeamSize(event.target.value === "" ? "" : Number(event.target.value))} />

<input type="number" ... onChange={(event) => setSameNatWeight(event.target.value === "" ? "" : Number(event.target.value))} />

<input type="number" ... onChange={(event) => setPosWeight(event.target.value === "" ? "" : Number(event.target.value))} />

<input type="number" ... onChange={(event) => setScoreWeight(event.target.value === "" ? "" : Number(event.target.value))} />



// Updated computeAssignments call:
computeAssignments(players, {
  numTeams: numTeams || 0,
  teamSize: teamSize || 0,
  seed: shuffleSeed,
  sameNatWeight: sameNatWeight || 0,
  posWeight: posWeight || 0,
  scoreWeight: scoreWeight || 0,
}, lockedTeam);