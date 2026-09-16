# Pilot comparison — 16 September 2026

This records the first deterministic browser captures against the supplied references. The captures are available from the Browser job's `visual-evidence` artifact for the exact PR commit. They are diagnostic, **not approved visual baselines**. Data below is fixture-only; it is not application data.

| Pilot | Supplied reference | Browser capture | Verdict |
| --- | --- | --- | --- |
| Public, 390 CSS px | [`mobile-map.png`](mockups/mobile-map.png) — compare inner web crop, not phone bezel/status bar | `public-discovery-390.png` | Not acceptable: no map, markers, map controls, map/list switch or saved tab. Search/filter geometry and navigation hierarchy differ. #22 owns the interactive map; #40 owns saved pharmacies. |
| Admin directory, 1440 CSS px | [`admin-pharmacies.png`](mockups/admin-pharmacies.png), original 1586×992 | `admin-pharmacies-1440.png` | Not acceptable: shell geometry, toolbar and density differ; pharmacy thumbnails, source and verification column, period control, account treatment and row menu are absent. #39 owns the rebuild. |

## Data and asset decisions required for the pilots

- The mockup's pharmacy photos are not supplied as individual licensed assets and are not in the current API. Do not extract them from the PNG. #39 needs a legitimate source or a reviewed placeholder treatment.
- The admin mockup distinguishes `Active`, `À vérifier`, `Masquée` and source provenance. The current API exposes `DRAFT`, `PUBLISHED`, `ARCHIVED` and no per-pharmacy verification/source field. #39 must propose an explicit mapping or a separately reviewed schema/contract change; do not mislabel states in the UI.
- The public map must use #22's real MapLibre rendering and owned style. Test fixtures must intercept tiles; the production UI must not paint the mockup image as a map.
- The old admin table caused page-level horizontal overflow at 768 px. #38 constrains the grid and scrolls the table within its own region, so responsive smoke tests pass. This is a temporary usability repair, not a claim of layout parity; #39 still owns the tablet adaptation.
- No screenshot baseline can be approved until each required region is implemented, visually compared with the reference and explicitly signed off by the lead and user. Semantic tests for the missing major regions must be added by #22 and #39 before their PRs are accepted.
