# ZERO

A multiplayer Android party card game for 2–8 players. Start with a number from
20 to 30, draw a card and race to exactly zero while disrupting your opponents.
Includes free-for-all, 2v2 teams and offline practice with bots.

This open-source edition is based on 1.0.0. Each player uses their own phone;
hands are private and the server validates online moves. It is an early playable
project, not a production-audited multiplayer service.

## Try offline practice

Use Node.js 24+ and Python 3; no npm dependencies are needed.

```sh
npm test
npm run preview
```

Open http://localhost:8087 and choose practice. Online play requires your own
backend. The public source does not connect to the original hosted service.

## Online setup

1. Create your own Supabase project. Apply `backend/schema.sql` in its SQL editor.
2. Deploy an Edge Function named `zero-game` containing `backend/index.ts`,
   `backend/engine.js` and `backend/deno.json`. Use `index.ts` as the entry point.
3. This function implements custom device-token authentication in the
   `x-zero-token` header, so its platform JWT verification must be disabled for
   this function. Do not remove the function's token and membership checks.
4. The server reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from its
   environment. Keep the service-role key on the server only.
5. Replace `your-project-ref.supabase.co` with your project's hostname in
   `web/app.js`, `web/index.html` and
   `android/app/src/main/java/game/zero/party/MainActivity.java`.
   These are respectively the API endpoint, CSP and native network allowlist.
6. Rebuild the APK and test creating, joining and finishing a match on two phones.

Use the [Supabase deployment documentation](https://supabase.com/docs/guides/functions/deploy)
for the current deployment process. Keep `backend/engine.js` identical to
`web/engine.js`. The SQL enables RLS and denies direct anonymous/authenticated
access to rooms, rate-limit data and the rate-limit RPC. Only the server role
accesses these objects. Do not loosen those grants to enable client play.

## Android build

Requires a Java JDK, official Android SDK platform 35 and build tools 35.0.0.
Android 8.0+ with an updated Android System WebView is required to play.

```sh
python3 android/build.py \
  --tools /path/to/android-sdk/build-tools/35.0.0 \
  --platform /path/to/android-sdk/platforms/android-35/android.jar \
  --keystore /private/zero-release.p12 \
  --password-file /private/password.txt \
  --output Zero.apk
```

Supply your own keystore with alias `zero`. Never commit keys or passwords.
Forks should use their own package name and signing identity. Original release
signing material is intentionally absent.

## Rules

- 2–8 players in free-for-all; exactly four, two per team, in 2v2.
- Five cards each; starting totals are randomly chosen from 20 through 30.
- A total becomes public when its owner's first turn starts.
- Draw one card and play one on a valid player. Hit exactly zero to win. Below zero eliminates you. Last surviving player/team also wins.
- In 2v2 either teammate reaching zero wins for both. Teammates still cannot see each other's hands. Turns alternate teams.
- Subtract 1/3/5, add 2, double, divide, swap totals, reverse turns, lock a player, steal a random card, cloak your total, or shield yourself.
- Divide rounds up. Totals cap at 99. Reverse does not skip a player in a two-player game.
- Lock lasts until the end of its target's next completed turn; a player still at zero then wins. Cloak expires at the start of your next turn.
- Shield blocks the next card another player targets at you, including a teammate.
- Turns last 45 seconds. A timeout draws if needed, discards a card and adds 2. Three consecutive timeouts eliminate the player. Practice has no human turn limit.
- Maximum hand size is 12; drawing or stealing beyond it discards the oldest card.
- An offline host is replaced after 65 seconds when another player requests state. Rooms expire after two hours without saved activity; expired data is cleaned when a new room is created.

## Architecture

| Path | Purpose |
| --- | --- |
| `web/` | Interface, offline practice and shared rules |
| `backend/` | Supabase Edge Function and restricted database schema |
| `android/` | Small Java WebView shell and SDK-based build script |
| `tests/` | Rules and mocked backend request tests |

## Validation limits

Tests cover rules, hidden hands, simulated matches, room membership, concurrent
joins, revision conflicts, duplicate requests, host permissions, teams and rate
limits. Backend tests mock database transport. They do not verify a deployed
Supabase database, real network conditions or physical Android devices.

There is no ranked matchmaking, iOS build, account system or in-app purchases.
See `ROADMAP.md`, `CONTRIBUTING.md` and `SECURITY.md`.

## License

MIT. See `LICENSE` and `THIRD-PARTY-NOTICES.md`.
