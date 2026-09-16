# Visual pilot captures

These are browser captures of fixture pharmacy records over live OpenFreeMap tiles at 390 and 1440 CSS px. They document the integrated #22 map pilot and the #47 default-entry framing, and are **not approved visual baselines**. The supplied reference remains in [`../mockups`](../mockups).

To regenerate from an isolated worktree after a web build, set `WANZILA_LIVE_MAP=1`, `WANZILA_MAP_CAPTURE_DIR=docs/design/captures`, and a worktree-specific `WANZILA_E2E_PORT`, then run `pnpm exec playwright test tests/e2e/pharmacy-map-pilot.spec.ts --project=desktop --grep "mobile map presents|map controls remain"`. External map data can change; the default CI test uses intercepted empty vector tiles instead.

## Admin pharmacy detail (#39)

`admin-pharmacy-detail-1440.png`, `-390.png` and `-1586.png` are deterministic captures of the detail with a fixture record and a tile-free MapLibre style. `admin-pharmacy-detail-live-map-1440.png` and `-390.png` use the production style and live OpenFreeMap tiles. Both sets include explicit unavailable states for activity and statistics; neither is an approved baseline. See the [side-by-side comparison and data decisions](../admin-pharmacy-detail-comparison.md).

After a web build, run `pnpm exec playwright test tests/e2e/admin-pharmacy-detail.spec.ts --project=desktop --grep "detail fits"` for deterministic captures in `test-results`. Set `WANZILA_LIVE_MAP=1` for the separate live-cartography capture; this optional run needs network access and waits for the map to load before taking screenshots. Set a worktree-specific `WANZILA_E2E_PORT` when another preview is active.
