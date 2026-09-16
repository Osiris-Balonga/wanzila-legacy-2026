# Public map visual pilot — 16 September 2026

Status: **integrated pilot, not an approved visual baseline**. The map is the default at `/`; the list remains available at `/#list`, and existing `/#map` links still open the map. The reference images are [`mobile-map.png`](mockups/mobile-map.png) and [`mobile-map-selected.png`](mockups/mobile-map-selected.png). Compare the inner app area, excluding the illustrative phone frame and operating-system status bar.

## Evidence and verification

- Run `pnpm validate` and `pnpm test:e2e` from an isolated worktree. Set `WANZILA_E2E_PORT` to a distinct port for each concurrently tested worktree; the preview uses `--strictPort` so a collision fails instead of testing another checkout.
- The default Playwright map test intercepts OpenFreeMap TileJSON and serves valid empty vector tiles, so the interaction/worker checks do not depend on an external network.
- For a real-background capture, run `WANZILA_LIVE_MAP=1 pnpm exec playwright test tests/e2e/pharmacy-map-pilot.spec.ts --project=desktop` (PowerShell: `$env:WANZILA_LIVE_MAP='1'; pnpm exec playwright test tests/e2e/pharmacy-map-pilot.spec.ts --project=desktop`). The test outputs `map-pilot-390.png`, `map-pilot-selected-390.png` and `map-pilot-1440.png` under its `test-results` directory. These contain fixture pharmacy records and live third-party cartography; do not treat them as approved baselines.
- Set `WANZILA_MAP_CAPTURE_DIR=docs/design/captures` together with `WANZILA_LIVE_MAP=1` to generate the exact reviewed PNG artifacts committed with the pilot.
- The map is tested at 320, 390, 768 and 1440 CSS px, including map/list state, search/filter URL state, selected pharmacy, telephone action and lack of page-level horizontal overflow.

## Reference comparison

| Region                           | Result                                                                    | Remaining gap                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full-viewport Brazzaville map    | Real MapLibre canvas; project-owned style over OpenFreeMap vector tiles   | Cartographic geometry and labels reflect live OpenStreetMap data, not the illustrative mockup. The initial camera was tuned toward the reference; further palette review remains possible.   |
| Floating search/filter chips     | Present and connected to the existing #4 API query                        | Voice search is not implemented, so the decorative microphone from the mockup is omitted. The narrower viewport scrolls filters horizontally; Poto-Poto URLs remain reflected in both views. |
| Pharmacy pins and selected label | Real API coordinates; keyboard-focusable buttons and selected-name bubble | Invalid coordinates stay in the list without creating pins. The current public contract requires coordinates; supporting a missing value needs a separately reviewed contract/API change.    |
| Floating location/layer controls | Visually placed                                                           | Disabled until geolocation and layer toggling are designed and tested; no fake interaction.                                                                                                  |
| Map/list and bottom navigation   | Functional map/list switch, with saved tab visibly unavailable            | Saved pharmacies belong to #40. Final pixel-level visual approval is still pending.                                                                                                          |
| Selected pharmacy sheet          | Real name, address, current duty end, callable number                     | No licensed pharmacy photo, user-location distance, route planner or saved-state contract exists. The matching controls are omitted or disabled, rather than fabricated.                     |

The local style is [`apps/web/public/maps/wanzila-style.json`](../../apps/web/public/maps/wanzila-style.json). It is the only map-style source in the application and may be replaced through `VITE_MAP_STYLE_URL`. MapLibre's worker is explicitly bundled through Vite's `?worker&url`; without that, pins appeared but vector tiles never loaded. OpenFreeMap tiles and OpenStreetMap data require visible attribution, retained in the MapLibre control. The map is not drawn from the reference PNG.

The comparison capture intentionally contains two fixture pharmacies, while the reference illustration shows more pins. Pin count and position are data-dependent and must not be copied from the artwork into production data.

Final baseline approval still requires human side-by-side review of the 390 px normal and selected captures, plus a decision on imagery, user distance, itinerary and saved pharmacies. Pilot integration into `dev` does not waive the visual gate in #38.
