# Issue #40 — pharmacies enregistrées

Reference: [`mobile-saved.png`](../../mockups/mobile-saved.png), cropped according to [`reference-manifest.json`](../../reference-manifest.json). The phone frame, OS status bar and lavender surround are not web UI.

Implementation: [`saved-390.png`](saved-390.png) at 390 × 844, with the real MapLibre style and three deterministic API fixtures. Additional live-map captures: [`320`](saved-320.png), [`768`](saved-768.png), [`1440`](saved-1440.png).

![Reference mobile saved screen](../../mockups/mobile-saved.png)

![Implementation at 390px](saved-390.png)

## Annotated differences

| Region            | Reference                                                                  | Implementation and reason                                                                                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Map               | Brazzaville streets, three pharmacy pins, search and location control      | The existing #22 MapLibre component and OpenFreeMap style render real streets and three keyboard-operable pins. Search filters the saved list and map; location control is visibly unavailable because #40 does not request browser location. |
| Sheet             | Three pharmacy cards with photos, guard state, detail/route/remove actions | Cards use fresh public detail responses, with an explicit local-only notice and 44px minimum action targets. Original pharmacy photos are not supplied; each photo area uses a pharmacy pictogram, not an invented photograph.                |
| Search            | Search field with microphone affordance                                    | Text search works. No nonfunctional voice-search affordance is shown because no voice-search contract exists.                                                                                                                                 |
| Guard state       | Two active guards, one without an active guard                             | The demo fixture shows those states. In the real app, each saved ID is fetched from the API; an expired duty stops claiming it is active without a reload.                                                                                    |
| Bottom navigation | Carte, Enregistrées, Contribuer                                            | Three destinations and active saved state match the reference.                                                                                                                                                                                |

The [`before marker fix`](saved-390-before-marker-fix.png) capture shows the inherited #22 markers stacked in document flow. The [`after`](saved-390.png) capture shows the one-line `position: absolute` correction, with markers positioned by MapLibre coordinates. The before capture predates minor #40 spacing changes, so compare it specifically for marker placement. The shared public map was rechecked at [`390`](map-pilot-390.png) and [`1440`](map-pilot-1440.png), plus its [`selected state`](map-pilot-selected-390.png).

The mobile composition remains an approximation rather than a pixel-identical reproduction: the map tiles are live and can change; the reference's pharmacy photos and microphone asset/behavior are absent; the saved-local notice is additional product disclosure. Visual approval remains pending lead review.

## Behavior proof

- Playwright covers 320/390/768/1440px, zero horizontal overflow, real MapLibre canvas, distinct marker x-positions, keyboard removal and undo, detail/route links, persistence across reload, 404 cleanup, offline retry and storage-write failures.
- Vitest covers ID-only storage normalization, fresh public-detail parsing, missing/failed responses and duty-expiry transition.
- Default CI tests mock the map style and API; the screenshots above were captured separately with `WANZILA_LIVE_MAP=1`, not from a static mock map.
