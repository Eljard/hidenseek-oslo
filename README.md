# Hide & Seek Oslo

A playful, mobile-first Oslo map companion for Jet Lag-style hide and seek.

**Live:** https://hidenseek.vedin.workers.dev/
**Source:** https://github.com/Eljard/hidenseek-oslo

## Run locally

Use Node.js 22 or 24 and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

No application secrets or accounts are required. Copy `.env.example` only if you need a place for local configuration; never commit credentials.

## Play

The app opens on Oslo. **Utforsk / Explore** controls T-bane, tram, bus and train overlays independently. Expand a mode for individual-line filters, click a route badge or map line for details, and enable stops at closer zoom levels. Bus routes appear from zoom 11; stop markers appear from zoom 13. Transport preferences persist locally.

**Spillet / The game** contains radius, thermometer, matching, measuring and tentacle questions. Questions default to the map center. Edit answers and coordinates, or drag the corresponding map markers. Questions retain the upstream engine and supported variants. The advanced hiding-zone panel supports station-based questions and custom station lists.

The Oslo preset is an urban-area rectangle (10.60–10.90 E, 59.84–60.01 N), not Oslo's municipal boundary or Ruter ticket zone. Draw or edit a boundary using the lower-left map controls. Boundary changes clear questions after confirmation. Undo/redo covers question edits, imports and boundary changes during the current page session.

Questions and boundaries autosave in this browser. Export/import shares these two elements as versioned JSON; transport preferences and advanced station preferences stay local. A separate private hider location and credentials are never exported. Exports can still contain the question locations you chose.

## Transport data and coverage

The included **17 October 2026** snapshot contains **289 routes and 2,308 stops** in the Oslo region: 5 metro, 6 tram, 256 bus and 22 rail routes. The geographic extent is 10.35–11.15 E, 59.70–60.15 N. Route variants may extend just beyond the edge to preserve continuity. Counts reflect the feed, including replacement and limited-service variants; this is a static network map, not a timetable or a statement that every route operates today.

- Source: [Entur Journey Planner v3](https://developer.entur.no/), including Ruter and rail operators outside Ruter.
- Reference: [Ruter's official network maps](https://ruter.no/planlegg-reise/rutetabeller-og-linjekart).
- License: [Norwegian Licence for Open Government Data (NLOD), via Entur](https://developer.entur.no/terms-of-service).
- Route colors come from Entur's `presentation.colour`. The fallback palette is metro orange `#e47716`, tram blue `#208ab0`, bus red `#c84453`, rail green `#358560`. Official colors sometimes identify a mode rather than a unique line; selection and route numbers distinguish lines.
- Route geometry is decoded from `journeyPatterns.pointsOnLink`, clipped to this region, and simplified with a 0.00005-degree tolerance (roughly a few meters in Oslo). No route geometry is invented.
- **Partial coverage:** 59 patterns with missing or sparse geometry are omitted. In particular, Flytoget and some international train routes provide only station-to-station links. These are not drawn as track geometry. Rail gaps over 750 meters in the original geometry are split rather than bridged. The app shows a coverage note.
- Stops are grouped by Entur stop-place ID; marker positions use an available quay in that stop place. Detail lists contain the union of stops across retained variants, not a guaranteed stop order or single departure pattern.
- The current snapshot is about 4.3 MB uncompressed. It is fetched once, cached by the browser/CDN, and rendered on a separate Leaflet Canvas layer. Visitors do not fetch Norway's national feed.

### Refresh the snapshot

```sh
pnpm data:update
pnpm test:run
pnpm build
pnpm deploy
```

The script identifies itself as `eljard-hidenseek-oslo` using Entur's required `ET-Client-Name` header, retries failed requests, and replaces the snapshot atomically only after all four modes are present. Review changed coverage/counts before publishing. Refresh before a game and when Ruter changes routes; there is no unattended refresh schedule.

Place search uses Entur's public geocoder with local stop-search fallback. Base tiles are CARTO/OpenStreetMap; their attribution remains visible. Advanced questions use the upstream OpenStreetMap/Overpass sources and ArcGIS geodesic operators. Their source coverage may differ from the displayed transit overlay, and network access is required. Failed spatial calculations are shown explicitly.

## Checks

```sh
pnpm lint:check
pnpm typecheck
pnpm test:run
pnpm build
```

The suite includes upstream tests and Oslo spatial, import/export, undo/redo, filtering, data-quality and failed-load checks. The Node test setup runs the actual ArcGIS WASM engine from the installed package.

## Deploy to Cloudflare

This is a separate Cloudflare Workers static-assets application named **hidenseek**, following the existing navigation app's Cloudflare account setup. It has no bindings to the navigation app and uses no runtime secrets.

```sh
pnpm exec wrangler login
pnpm deploy
```

`wrangler.jsonc` selects the account and `hidenseek` Worker. Wrangler should return `https://hidenseek.vedin.workers.dev/`; verify this output and the deployed app before announcing a release. Account IDs in configuration are not secrets. Local OAuth files and `.wrangler` state are ignored.

GitHub Actions runs the checks on pushes and pull requests. A manual workflow can also deploy when a repository secret named `CLOUDFLARE_API_TOKEN` is configured for this account with Worker deployment access. The local OAuth login is not uploaded to GitHub.

## Attribution

An unofficial fan project; not affiliated with Jet Lag: The Game, Ruter, Entur or the transit operators. Based on [taibeled/JetLagHideAndSeek](https://github.com/taibeled/JetLagHideAndSeek), MIT, copyright 2025 taibeled. The original [LICENSE](LICENSE) is retained; the upstream README is in [docs/UPSTREAM_README.md](docs/UPSTREAM_README.md). Third-party dependencies retain their own licenses.
