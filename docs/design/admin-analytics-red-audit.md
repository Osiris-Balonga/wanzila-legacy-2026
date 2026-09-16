# #55 — RED visual/technical audit

Reference: `admin-dashboard.png` (1536×1024, full crop) and
`admin-data-quality.png` (1586×992), with required regions and states in
`reference-manifest.json`. This is an inventory for implementation review, not
visual approval. Both routes currently show the generic `AdminShell` placeholder;
no analytics request is made. The manifest records no approved deviation.

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

| Dimension     | Score / 4 | Evidence                                                                                                                                                                              |
| ------------- | --------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accessibility |         2 | Existing shell has a skip link and named navigation, but no #55 charts, period control or state announcements.                                                                        |
| Performance   |         2 | No dashboard data path exists to measure yet; the current web build reports large shared bundles, so chart/map imports must stay lightweight.                                         |
| Theming       |         3 | Existing `styles.css` has semantic brand and state tokens. New surfaces must retain white text/≥4.5:1 contrast on purple primary actions through hover/focus/pressed/disabled states. |
| Responsive    |         2 | Shell has mobile breakpoints; #55 content has no 320/390/768 implementation yet. RED tests cover all four widths, overflow and region order.                                          |
| Anti-patterns |         3 | Placeholder avoids fabricated data; copying the mockup's trends, photos, notification counts or heatmap would not.                                                                    |
| **Total**     | **12/20** | **Acceptable baseline, but #55 itself is P0 incomplete.**                                                                                                                             |

Findings: **P0** — both routes lack every requested feature region and true API
request (`AdminShell.tsx`). **P1** — copied reference-only trends, photos,
global quality percentage, source/anomaly rows or heatmap would misstate the
available data. **P1** — charts/maps without a text equivalent or mobile
reflow would block use. **P2** — the current quality-navigation icon is outline
only, unlike its selected reference treatment; leave shell ownership to #49
until the branch is synchronized. Positive baseline: named navigation, skip
link, brand tokens and shadcn primitives already exist.

Next: review this RED contract, synchronize merged #54 and any subsequently
merged #49 shell changes, then implement only the mapped regions. Run
`pnpm validate`, Playwright on reserved port 4189, and side-by-side 390/1440
captures after GREEN. Visual approval remains pending #38/lead.
