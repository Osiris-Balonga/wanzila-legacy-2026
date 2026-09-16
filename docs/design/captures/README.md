# Visual pilot captures

These are browser captures of fixture pharmacy records over live OpenFreeMap tiles at 390 CSS px. They document the candidate state of the #22 map PR and are **not approved visual baselines**. The supplied reference remains in [`../mockups`](../mockups).

To regenerate from the #22 worktree after a web build, set `WANZILA_LIVE_MAP=1` and `WANZILA_MAP_CAPTURE_DIR=docs/design/captures`, then run `pnpm exec playwright test tests/e2e/pharmacy-map-pilot.spec.ts --project=desktop --grep "mobile map presents"`. External map data can change; the default CI test uses intercepted empty vector tiles instead.
