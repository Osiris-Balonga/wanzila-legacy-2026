# Visual pilot captures

These are browser captures of fixture pharmacy records over live OpenFreeMap tiles at 390 and 1440 CSS px. They document the integrated #22 map pilot and the #47 default-entry framing, and are **not approved visual baselines**. The supplied reference remains in [`../mockups`](../mockups).

To regenerate from an isolated worktree after a web build, set `WANZILA_LIVE_MAP=1`, `WANZILA_MAP_CAPTURE_DIR=docs/design/captures`, and a worktree-specific `WANZILA_E2E_PORT`, then run `pnpm exec playwright test tests/e2e/pharmacy-map-pilot.spec.ts --project=desktop --grep "mobile map presents|map controls remain"`. External map data can change; the default CI test uses intercepted empty vector tiles instead.
