# Admin duty directory API

`GET /api/v1/admin/duties` accepts optional `q` alongside the existing list
filters and pagination. The server trims `q`, collapses whitespace, and searches
pharmacy name, district, or arrondissement case-insensitively. SQL LIKE pattern
characters (`%`, `_`, `\`) are literal search text. Filtering precedes the
`startsAt`, `id` sort, page slice, and total count. An empty normalized term,
more than 180 characters, repeated or unknown parameters return `BAD_REQUEST`.

`GET /api/v1/admin/duties/summary` requires an administrator session, accepts
no query parameters, and returns `{ data: { asOf, active, upcoming, expired,
withoutRecentDuty } }`. The four counts are calculated from one database
snapshot at an injected `asOf` instant; none is a trend or estimate.

- `active`: APPROVED periods with `startsAt <= asOf < endsAt`, excluding any
  period with a CANCELLED or UNAVAILABLE exception covering `asOf`.
- `upcoming`: APPROVED periods with `startsAt > asOf`.
- `expired`: APPROVED periods with `endsAt <= asOf`.
- `withoutRecentDuty`: PUBLISHED pharmacies with no APPROVED period satisfying
  `startsAt <= asOf` and `endsAt > asOf - 30 days`. This is the presence of an
  approved period during the preceding 30 days **or at `asOf`**, not an active
  service count. A period beginning exactly at `asOf` counts as recent presence,
  even when an exception covers that instant; future periods do not count.

All intervals use half-open `[startsAt, endsAt)` boundaries. Source freshness
and PENDING/REJECTED periods do not affect these counts.
