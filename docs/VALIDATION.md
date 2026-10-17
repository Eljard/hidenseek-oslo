# Release validation — 17 October 2026

- ESLint: passed across `src`.
- TypeScript: passed (`tsc --noEmit`).
- Vitest: 32 tests passed across 5 suites, including real ArcGIS WASM calculations.
- Production Astro build: passed.
- Cloudflare deployment dry run: passed; 32 static assets, no runtime bindings.
- Desktop UI checked at 1440 × 960; phone UI checked at 390 × 844 and the app panel's narrower viewport.
- Browser verified all four transport switches independently, all modes together, individual route controls, route details, local station search, and English/Norwegian switching.
- Browser verified a radius question (~12.5 km² for 2 km), undo, redo, reload restoration, export download, clearing confirmation, and importing the exported JSON.
- Browser checked the collapsible phone sheet; production preview reported no console errors.
- Source snapshot tests check all four modes, a known Oslo station, rejected sparse train geometry, polyline decoding and clipping, network errors, and recovery.
- Source tests check malformed/oversized imports, hider-position exclusion, atomic session undo, in-place edits, redo branching, contradictory questions and transport/game-state isolation.

## Coverage and practical limits

The transit layer is a dated snapshot, not live service information. Its 289 lines include service variants; not every line necessarily runs on the day of play. Flytoget and some international rail services are omitted because their source geometry is only station-to-station. The app and README disclose this. Refresh the snapshot before playing after network changes.

Advanced questions use the original OSM/Overpass data rather than the transit overlay and need internet. External service failures are surfaced as calculation errors. Geolocation is implemented but was not invoked during QA to avoid requesting the user's actual location.

The upstream map/drawing dependencies emit a nonfatal Vite interoperability warning and bundle-size warnings. The production build and rendered map/drawing controls work. Styling uses Google Fonts with system fallbacks; map tiles, place search, and advanced geographic sources require network connectivity.
