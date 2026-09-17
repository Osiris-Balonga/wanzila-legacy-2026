# Design inventory

The `mockups` directory contains the supplied visual direction for the responsive public interface and desktop administration interface.

## Public interface

- `mobile-map.png`
- `mobile-map-selected.png`
- `mobile-pharmacy-detail.png`
- `mobile-route-preview.png`
- `mobile-navigation.png`
- `mobile-saved.png`
- `mobile-contribution-location.png`
- `mobile-contribution-form.png`

## Administration

- `admin-dashboard.png`
- `admin-pharmacies.png`
- `admin-pharmacy-detail.png`
- `admin-duty-periods.png`
- `admin-duty-create.png`
- `admin-duty-edit.png`
- `admin-contributions.png`
- `admin-contribution-review.png`
- `admin-reports.png`
- `admin-data-quality.png`

## Brand

- `brand-app-icon.png`

Mockups communicate hierarchy and intent. They are not permission to invent behavior absent from the product workflows or the relevant GitHub Issue.

## Layout acceptance contract

[`reference-manifest.json`](reference-manifest.json) inventories the supplied screens. Its `requiredRegions` describe the intended information architecture, not pixel-level specifications or a promise that every illustrated datum exists. `routeStatus` records historical planning state and must not be used alone to decide whether a current route is complete. The 19th PNG is the brand asset, not an extra screen. Release scope is set by the product issues; a deferred screen remains in the inventory but is not a V1 blocker.

Accept a screen when its major layout regions, navigation model, content hierarchy, primary actions and responsive behavior are recognizably aligned with the reference. For example, retain the desktop admin sidebar and the public map's floating search, controls and bottom navigation. Functional equivalents are welcome when required by real data or the chosen web tools. Do not demand identical pixels, map tiles/labels/zoom, marker count, illustration assets, photos, sample figures, exact spacing, typography or icon glyphs. Do not invent data or working controls to fill a mockup region. A major structural change or omitted core action needs a product reason and a tracked follow-up or explicit scope decision; minor stylistic differences do not.

The mobile images illustrate a phone; the bezel, operating-system bar and outer background are not web UI. Never use a reference PNG as a page background or crop pharmacy photos from it. Use 320, 390, 768 and 1440 CSS px as responsive smoke checks where relevant, but a screenshot at every width and at the mockup's exact source dimensions is not required. The `visual-evidence` Playwright scenario produces diagnostic CI captures with fixed data and clock. A screenshot regression baseline may be added for a stable component when useful, but it is not a prerequisite for layout acceptance or release; it cannot establish initial resemblance by itself.

Each screen-level UI PR must include:

1. The relevant reference, or `N/A` with a short explanation, and one representative browser capture (mobile for public UI, desktop for admin UI; add another only when the layout changes materially across breakpoints).
2. A short note on **material** differences in layout, action placement, behavior or available data. `None` is acceptable. Minor pixel, font, icon, map-tile and fixture differences need no inventory.
3. Responsive and interaction results for relevant widths/states, including keyboard, visible focus and no page-level overflow. Keep core flows and degraded states testable.

The Branch policy job checks these concise evidence fields for web UI changes. The lead reviews functional behavior and layout resemblance in the PR; no separate named visual approval or pixel-diff threshold is required. Semantic and interaction tests remain authoritative for a missing map, chart, action or other required region.
