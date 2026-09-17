# #73 edit screen — RED audit

Reference: `docs/design/mockups/admin-duty-edit.png` (1586 × 992) and its
`reference-manifest.json` entry. This document records unapproved differences;
it does not mark any manifest deviation as approved.

## Visual acceptance regions

- Existing light Wanzila admin shell, violet primary action, back link and
  published status at the top.
- Desktop two-column layout: editable proposal card on the left; real pharmacy
  identity/location and revision history on the right. At 390/320 px, reflow
  these regions without clipping; verify 768 and 1440 px too.
- Dates/times, source, reason note, save area, pharmacy card, MapLibre map only
  when actual coordinates exist, history and complementary period details.
- Existing shadcn controls and Phosphor fill icons where the reference uses
  filled glyphs; visible focus and at least 44 px primary/review targets.

## Contract-driven differences awaiting visual approval

- The pharmacy is immutable under #72: show its identity and fiche link, not
  the reference's editable pharmacy selector.
- The APPROVED status is published canonical state, not an editable select.
- The primary action creates an immutable PENDING revision; it does not save
  directly to the public guard. Explain that the published version remains live.
- Do not render the reference's delete action: no deletion policy exists.
- No supplied pharmacy photograph or pre-migration actor/note/time is usable.
  Use the existing honest placeholder, and say “Historique antérieur
  indisponible” for older duties.

## PENDING route boundary

The current web app has no PENDING edit screen, despite a PENDING PATCH API.
The lead confirmed that #73 GREEN covers the APPROVED→revision path only. A
PENDING duty at the edit URL must get an honest accessible non-editor state and
a return link; its editor will be a separate issue if needed.

The #72 route names and ledger fields are announced in its issue. Its exact
response schema is not yet merged into this branch, so the deterministic e2e
fixtures reflect the announced before/after/version/audit shape and may need
field-name alignment after the reviewed contract lands. The tests must retain
their behavioral assertions when that alignment happens.
