# Hide & Seek Oslo

[Play](https://hidenseek.vedin.workers.dev/) · [Source](https://github.com/Eljard/hidenseek-oslo)

Oslo transit map and shared hide-and-seek games, in Norwegian and English.

## Play

Create a game with 2–50 teams, choose a playing area in **Setup**, then copy the invitation. The first team hides by default. The host can select the next hider between rounds. The Oslo preset is an urban-area rectangle, not a municipal boundary or ticket zone.

The question flow follows [hemund99/Hide-Seek-OSLO](https://github.com/hemund99/Hide-Seek-OSLO): 58 small-game questions, four optional tentacles, one pending question, hider-only answers, photo evidence, thermometer journeys, repeat draw/keep sequences, private cards, curses, endgame, catches and best-round scoring. This implementation is independent. Cards are recorded from a physical deck; players resolve casting conditions and spatial answers. Radar rings are references; seekers can add shared exclusion areas and pins.

Timers and team permissions run on the server. Late answers stop scoring at the deadline until answered and receive no card reward. Pauses freeze scoring and extend active deadlines. Held time bonuses are added when the host records a catch.

Players join with a room invitation and a device token saved in their browser. This uses guest membership rather than the reference project's ChatGPT account sign-in. The host should keep the same browser storage. Leaving keeps the device's room key for rejoining. Participants can choose a team when joining, so invitations provide access to the game.

## Notifications and location

In-game alerts cover questions, answers and timers. Select **Alerts / Varsler** to enable encrypted Web Push, including when the page is closed where supported. On iPhone/iPad, first add the app to the Home Screen. Each player grants notification permission. Actual delivery depends on browser/OS settings and connectivity.

Push payloads contain only the game name and a generic event label. Answers, card contents, photos and coordinates are excluded. Recipients receive only events intended for their team. Expired endpoints are removed; leaving unregisters the device from that room's alerts.

Seeker location sharing is an explicit opt-in and requires the app to remain open. Positions disappear after five minutes without an update. Hider GPS is rejected by the server. The map's locate button only centres your own map.

Private hider cards and notes are removed from seeker responses, including when the host is a seeker. Photo evidence requires room membership and becomes available after the answer is submitted. The normal upload flow resizes and re-encodes JPEGs in the browser, removing original metadata. Evidence is removed at the next round.

## Transport data and colours

The 17 October 2026 snapshot contains **289 routes and 2,308 stops**: 5 metro, 6 tram, 256 bus and 22 rail routes, covering 10.35–11.15 E and 59.70–60.15 N. This is a static network, not a timetable. Route variants can extend slightly beyond the bounds.

- Geometry: [Entur Journey Planner](https://developer.entur.no/), [NLOD terms](https://developer.entur.no/terms-of-service). Actual shapes are decoded, clipped and simplified. Sparse station-to-station links are omitted, including Flytoget; rail gaps above 750 m are split. Stops include the union of retained variants.
- Metro, tram and bus colours: the individual line maps linked from [Ruter](https://ruter.no/planlegg-reise/rutetabeller-og-linjekart), checked 17 October 2026. Each mapped line records its exact PDF source. CMYK maps use their rendered RGB swatches.
- Trains: [Bane NOR's official maps](https://www.banenor.no/reise-og-trafikk/last-ned-toglinjekart/), including local green, regional red, regional express light blue and long-distance blue.
- All 5 metro, 6 tram, 22 train and 161 bus routes use published map colours. Other bus variants retain Entur's colour or an attributed mode fallback. Unknown codes never inherit another route's colour by number prefix. Map editions can use different palettes; the recorded source identifies the edition used here.
- `src/transit/colours.mjs` and `ruter-bus-colours.json` are shared by the snapshot and refresh pipeline. Badges, filters and paths read the same line colour.

Four mode switches, individual line filters, opacity, stops and place search remain available. Bus routes appear from zoom 11 and stops from zoom 13. CARTO/OpenStreetMap attribution remains visible. Preferences persist on the device. Place search uses Entur's geocoder with a local stop-search fallback.

## Development

Use Node.js 22 or 24 and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec wrangler dev --local --port 8787
```

Wrangler serves the built app and API at http://127.0.0.1:8787. `pnpm dev` provides Astro UI development only; shared-game requests need the Worker server. Local SQLite state is under ignored `.wrangler/`.

```sh
pnpm lint:check
pnpm typecheck
pnpm test:run
pnpm build
```

Tests cover game roles, private responses, paused/late scoring, repeat costs, thermometer distance, curses, push encryption/audiences, published colours, plus upstream spatial and Oslo data checks. ArcGIS tests run the installed WASM engine.

Run `node scripts/test-room.mjs` against local Wrangler to test real Worker/SQLite/WebSocket behaviour. It waits one minute for the actual hiding alarm and uses the synthetic JPEG in `tests/fixtures/photo.jpg`. Do not target real games.

Refresh geometry with `pnpm data:update`. The script identifies itself to Entur as `eljard-hidenseek-oslo`, retries failed requests and atomically replaces the snapshot only when all four modes are present. Review coverage before publishing. There is no scheduled refresh.

## Cloudflare deployment

The existing **hidenseek** Worker serves Astro assets and one SQLite-backed `GameRoom` Durable Object per room. The `v1` migration creates the class. State survives disconnects and deployments. WebSockets use hibernation; alarms handle hiding transitions, answer deadlines and curse expiry without connected clients.

`VAPID_PUBLIC_KEY` and `VAPID_SUBJECT` are public configuration in `wrangler.jsonc`. The matching `VAPID_PRIVATE_KEY` is a Worker secret. Replacing the pair requires devices to re-enable alerts. Keep private keys and local credentials out of Git.

```sh
pnpm exec wrangler login
pnpm deploy
```

Verify Wrangler returns `https://hidenseek.vedin.workers.dev/`. The navigation app is a separate Worker. GitHub Actions checks pushes and pull requests; manual deployment is available when `CLOUDFLARE_API_TOKEN` is configured as a repository secret.

## Attribution

Unofficial fan project; not affiliated with Jet Lag: The Game, Ruter, Entur or the operators. Based on [taibeled/JetLagHideAndSeek](https://github.com/taibeled/JetLagHideAndSeek), MIT, copyright 2025 taibeled. The original [LICENSE](LICENSE) is retained; its README is in [docs/UPSTREAM_README.md](docs/UPSTREAM_README.md). Shared-game behaviour was independently implemented after reviewing the linked Oslo project. Third-party dependencies retain their own licences.
