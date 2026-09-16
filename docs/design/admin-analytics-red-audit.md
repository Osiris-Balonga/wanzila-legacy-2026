# #55 — RED visual/technical audit

Reference: `admin-dashboard.png` (1536×1024, full crop) and
`admin-data-quality.png` (1586×992), with required regions and states in
`reference-manifest.json`. The inventory below records the pre-implementation
RED baseline: both routes then showed the generic `AdminShell` placeholder and
made no analytics request. It is not visual approval. The manifest records no
approved deviation.

| Reference region             | Honest source in #54                                                             | RED acceptance / visible gap                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin shell + period control | Existing shell; `window=7d\|30d`                                                 | Keep shell, named keyboard-focusable period control, true query on both routes. Sync #49 before changing `AdminShell`. Selected solid icons where shown. |
| Six dashboard KPI cards      | Totals for discovery, search, detail, call, route and arrival events             | Show exact event counts, not people or verified arrivals. Daily event counts may supply real chart shapes, but no invented trends/sparklines.            |
| Funnel + daily charts        | Seven event totals and daily series                                              | Semantic table/text equivalents and readable axes/labels. No unqualified conversion percentages. Include `empty_results_shown`.                          |
| Top pharmacies               | Up to five detail-event counts, name/coordinates nullable                        | Rank with counts; no stock pharmacy photos or ratings. Name absence is explicit.                                                                         |
| Filter usage                 | District/arrondissement _filter applications_                                    | Bars may show these counts, never “search geography”.                                                                                                    |
| Activity map                 | Coordinates only for top-five pharmacies, if present                             | Mark only those actual coordinates; partial/empty state is labelled. Full activity heatmap and user position are unavailable.                            |
| Alert panel                  | Pending contributions, unresolved reports; source/duty aggregates                | Aggregate actions only. Per-item ages, priorities, notification badges and “pharmacies sans garde récente” are unavailable in #54.                       |
| Dashboard quality summary    | Published pharmacies, duty and freshness aggregates                              | Show explicit counts/distribution. Global “87% quality” and arbitrary doughnut percentages are unavailable.                                              |
| Quality KPIs + source health | Registered-source fresh/stale, current-duty fresh/stale/unknown, duty exceptions | Show counts with defined denominators; per-source names, update timestamps and frequencies are unavailable.                                              |
| Coverage + anomalies         | Published and current-duty period totals; pending/unresolved counts              | No per-arrondissement coverage or anomaly rows from #54. Retain named regions with explicit unavailable states.                                          |

## Baseline audit of current placeholder (not a score for the future feature)

| Dimension     | Score / 4 | Evidence                                                                                                                                                                                            |
| ------------- | --------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accessibility |         2 | Existing shell has a skip link and named navigation, but no #55 charts, period control or state announcements.                                                                                      |
| Performance   |         2 | No dashboard data path exists to measure yet; the current web build reports large shared bundles, so chart/map imports must stay lightweight.                                                       |
| Theming       |         3 | Existing `styles.css` has semantic brand and state tokens. New surfaces must retain white text/≥4.5:1 contrast on enabled purple primary actions; disabled labels must also remain visibly legible. |
| Responsive    |         2 | Shell has mobile breakpoints; #55 content has no 320/390/768 implementation yet. RED tests cover all four widths, overflow and region order.                                                        |
| Anti-patterns |         3 | Placeholder avoids fabricated data; copying the mockup's trends, photos, notification counts or heatmap would not.                                                                                  |
| **Total**     | **12/20** | **Placeholder baseline only; #55 implementation remains pending at its P1 issue priority.**                                                                                                         |

Findings: **P1** — both routes lack every requested feature region and true API
request (`AdminShell.tsx`). **P1** — copied reference-only trends, photos,
global quality percentage, source/anomaly rows or heatmap would misstate the
available data. **P1** — charts/maps without a text equivalent or mobile
reflow would block use. **P2** — the current quality-navigation icon is outline
only, unlike its selected reference treatment; leave shell ownership to #49
until the branch is synchronized. Positive baseline: named navigation, skip
link, brand tokens and shadcn primitives already exist.

## GREEN comparison pending lead visual approval

The implementation now uses merged #54 only, with the real 7d/30d query,
loading/empty/error/401/403 states, semantic event tables, responsive regions and
top-five coordinate markers. Playwright captures for both routes at
320/390/768/1440 are uploaded under `visual-evidence` in Browser CI. The
deterministic capture style contains a neutral map background; production uses
the existing MapLibre style. Relative to the mockups:

- Trend percentages, conversion percentages, notification badges, pharmacy
  photos, a global quality score and user-position/heatmap dots are omitted
  because #54 supplies none of those facts. Mini-series use actual daily event
  counts, not invented trends.
- The map shows only geocoded top-five pharmacies and says coverage is partial.
  Its decorative markers have a textual legend and are not dead keyboard
  controls.
- Filter bars represent top-five filter applications, not search-location
  distributions. The accessible table is labelled “Principales applications”.
- Contributions and unresolved reports are aggregate actions in waiting, not
  detected anomalies. Their target admin management routes are placeholders,
  so these counts are not clickable. The anomalies region explicitly states
  detection is unavailable.
- Per-source rows, timestamps, update frequency, per-arrondissement coverage,
  anomaly details and alert priority/age remain unavailable in #54. Quality
  cards expose source and duty counts instead of a fabricated percentage.

`pnpm validate` and 20 dedicated desktop Playwright scenarios on port 4189
pass locally. Visual approval is pending lead review of the draft PR captures.
