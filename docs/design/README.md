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

## Visual acceptance contract

[`reference-manifest.json`](reference-manifest.json) is the screen-by-screen inventory. Its `requiredRegions` are acceptance obligations, not a description of the current implementation. `routeStatus` distinguishes live routes from proposed routes and placeholders. Every owner issue must update its entry when the route, data contract, supported state or an approved deviation changes. The 19th PNG is the brand asset, not an extra screen.

The mobile images are illustrations of a phone. Compare the web content inside the documented crop; the phone border, operating-system bar and outer background are not part of the responsive website. Compare the real desktop/admin screenshots at their source size and at 1440 CSS px. Use browser screenshots at 320, 390, 768 and 1440 CSS px for reflow. Never use the reference PNG as a page background or crop pharmacy photos from it.

The `visual-evidence` Playwright scenario uses fixed API responses and a fixed clock to produce CI artifacts for the public discovery route and admin directory. These are **diagnostic captures, not approved baselines**: both routes still have major reference gaps. Run `pnpm test:e2e --grep "visual evidence"` after `pnpm --filter @wanzila/web build`, then open the `visual-evidence` artifact from the Browser job. The evidence captures are not committed. A screenshot baseline may only be added in an owning feature PR after manual reference/capture comparison and a recorded reviewer approval. Once approved, `toHaveScreenshot` should prevent drift; it cannot establish initial fidelity by itself.

Each UI PR must include:

1. A link to every owning reference and to actual browser captures (CI artifact or stable PR attachment), side by side at the reference width.
2. An annotated list of visible mismatches and of missing source data/assets. `None` is acceptable only after inspection. A missing major region requires a tracked dependency and explicit lead approval; CI green is not approval.
3. Responsive 320/390/768/1440 results, keyboard/focus/overflow checks, and degraded-state evidence.
4. The name of the visual approver and the exact approved commit. Until then write `Pending`; do not call a screenshot a baseline.

The Branch policy job enforces completion of the evidence fields for PRs that change web TSX/CSS or web public assets. Semantic/interaction tests are separate from pixel comparison: a map or chart missing entirely must fail a region assertion, even if a newly recorded screenshot would otherwise pass.
