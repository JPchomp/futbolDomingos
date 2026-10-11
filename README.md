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
a correct fit. If the rating gap remains wider than 1 point, the app gives
position slots back one player at a time until the gap closes, and reports how
many it gave up.

When the two goals do not conflict, which is the normal case, positions are
fitted perfectly and nothing is given up.

Ratings run 0–10. A trailing number outside that range is treated as part of the
name rather than a rating, so shirt numbers and phone numbers pasted from a chat
do not become ratings. Check marks and decorative icons are removed from pasted
names; players without a rating default to 5.

## Tests

```
npm test
```
