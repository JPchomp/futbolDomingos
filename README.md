# Balanced Team Builder

Static React web app using CDN imports, Google Analytics, and non-personalized AdSense ads.

## Deployment (Vercel)
1. Push this folder to GitHub.
2. Import the repository in Vercel.
3. Framework preset: **Other**.
4. Build command: none.
5. Output directory: `/`.

Site will deploy to: `https://yourproject.vercel.app`.

## How teams are built

`logic.js` assigns players in four steps:

1. **Who plays** — locked players always make the field; everyone else is drawn
   at random from the roster using the shuffle seed.
2. **Seeding** — the `numTeams` highest-rated players in that group are placed
   one per team, so the best players can never stack up on one side. They are
   marked with a ★ and only ever swap with each other.
3. **Greedy fill** — the emptiest team picks next, choosing whichever player
   costs least against the combined objective.
4. **Local search** — pairs of players are swapped while it lowers a single
   cost: squared team-total deviation *plus* squared position-count deviation.
   Positions are part of the objective, so the swap phase cannot undo them.

**Balance priority** in the UI trades the two off. Roughly, it is how large a
team-total gap the app will accept to give every team one more correctly-placed
specialist: `Even ratings` ≈ 1 point, `Balanced` ≈ 2, `Even positions` ≈ 4.

Ratings run 0–10. A trailing number outside that range is treated as part of the
name rather than a rating, so shirt numbers and phone numbers pasted from a chat
do not become ratings.

## Tests

```
npm test
```
