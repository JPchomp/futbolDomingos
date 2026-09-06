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
3. **Fitting the positions** — players are placed scarcest-position-first, so a
   lone keeper claims a slot before the unpositioned players fill the squad up
   around them. Every position is then spread so that each team holds between
   the floor and the ceiling of its fair share.
4. **Levelling the ratings inside that fit** — pairs are swapped to even out
   the team totals and the rating each team holds *per position*, but only
   while the position fit is preserved.

The two goals are **hierarchical, not weighted**. A position slot is never
traded for a better rating split while the ratings can still be improved within
a correct fit. Only if the rating gap is still wider than the **Balance
priority** setting allows does the app start giving position slots back, one
player at a time, stopping at the first level that closes the gap — and it
reports how many it gave up.

- **Even positions** — positions are strict, whatever gap that leaves.
- **Balanced** — give a slot back only if the gap exceeds 1 point.
- **Even ratings** — give a slot back if the gap exceeds 0.25 points.

When the two goals do not conflict, which is the normal case, positions are
fitted perfectly at every setting and nothing is given up.

Ratings run 0–10. A trailing number outside that range is treated as part of the
name rather than a rating, so shirt numbers and phone numbers pasted from a chat
do not become ratings.

## Tests

```
npm test
```
