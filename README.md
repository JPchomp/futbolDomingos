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

## Player database

The saved player database stays in this browser. The app encrypts saved entries
with a key derived from the database password and keeps that key only while the
database is unlocked. Older readable browser data is migrated to encrypted
storage after the first successful unlock in that browser.

**Adding players needs no password. Reading or changing the database does.**
"Upload current data to database" works while the database is locked; viewing
the stored list, matching a pasted roster against it, deleting an entry and
clearing it all stay behind the password.

Additions go into a drop box rather than into the database itself. Each one is
sealed with an RSA-OAEP public key that sits unencrypted in browser storage,
and only the matching private key can open it. That private key is stored
encrypted under the password, alongside the database and under the same salt,
so the single key derivation done at unlock opens both. The next unlock opens
the drop box, merges the additions through the same rules as a normal upload —
existing spellings kept, names matched without regard to accents or casing —
and empties it.

What this does and does not protect:

- Someone without the password cannot read the database, and cannot read back
  even the additions they just made. Sealing is one-way.
- They can see *how many* additions are waiting, and they can add junk entries
  or delete waiting ones, because browser storage is theirs to write. The drop
  box is append-only by design, not tamper-proof; it caps at 500 waiting
  entries so a page left open cannot fill up storage.
- Additions cannot be checked for duplicates while locked, since that would
  require reading the database. Duplicates collapse at the next unlock.
- A browser that has never unlocked the database holds no drop box, so adding
  reports that there is nothing to add to. The database is per-browser anyway.
- If the encrypted private key is lost while the database survives, additions
  still waiting become unreadable. The next unlock reports how many it had to
  discard rather than dropping them silently.

## Tests

```
npm test
```
