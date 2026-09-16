# Issue #55 — analytics UI comparison evidence

These are real Playwright browser captures of the implementation using the
schema-valid #54 fixture, not mockup exports. Compare with
`docs/design/mockups/admin-dashboard.png` and
`docs/design/mockups/admin-data-quality.png`.

| Surface      | 390 px                       | 1440 px                       |
| ------------ | ---------------------------- | ----------------------------- |
| Dashboard    | [capture](dashboard-390.png) | [capture](dashboard-1440.png) |
| Data quality | [capture](quality-390.png)   | [capture](quality-1440.png)   |

[Dashboard with real MapLibre/OpenFreeMap vector tiles at 1440 px](dashboard-live-map-1440.png)
is a separate opt-in network-backed capture. Its Playwright check waits for the
map to report ready and at least one successful `.pbf` tile response. The
deterministic CI captures use a neutral map style so external network timing
does not affect layout evidence. Both captures use the same single real
top-pharmacy coordinate from the fixture; neither claims a full heatmap.

The 390 px funnel changes to six labelled horizontal bars because the mockup's
six vertical labels become crowded in a narrow column. Playwright checks
labels are at least 11 px and do not collide with bars or values at 320 and
390 px. Other intentional data-limited differences are itemized in
`docs/design/admin-analytics-red-audit.md`.
