# Analytics event privacy boundary

Analytics uses one anonymous UUID per browser tab. The identifier is held only
in `sessionStorage`; it is not a cookie, account identifier, fingerprint, or
cross-session profile.

The v1 event contract accepts a fixed set of public activity events with
bounded derived properties: query length, selected administrative filters,
zero-result counts, a pharmacy identifier, and controlled failure codes. It
rejects raw search text, exact coordinates, route traces, free-form errors,
and unknown keys.

The API records its receipt time in UTC and keeps events for 30 days. Cleanup is
a separately callable, idempotent service so public requests never perform
retention deletion. Pharmacy correlation is stored only in the indexed
`AnalyticsEvent.pharmacyId` column, never duplicated in JSON properties.

Browser delivery is best-effort: Beacon is preferred and a keepalive fetch is
used when Beacon is unavailable, rejects the payload, or throws. Delivery
failures never delay public discovery, call, route, or arrival actions.

## Route attempts and outcomes (#100)

Starting arrival tracking creates one `RouteAttempt` with a random UUID and the
anonymous tab session ID. The API records `route_started` in the same database
transaction; the browser does not send that event separately. A retry with the
same attempt ID returns the existing record. GPS arrival records
`arrival_confirmed` in the outcome transaction, once per attempt. These legacy
events remain available to the existing dashboard without double counting new
attempts.

An attempt begins as `UNKNOWN`. The first terminal outcome wins atomically:
`GPS_CONFIRMED`, `USER_DECLARED`, `STOPPED`, or `ALREADY_NEARBY`. A subsequent
identical outcome is idempotent; a different one is rejected. `UNKNOWN` includes
page abandonment and failed outcome delivery. It is not counted as failure.
`ALREADY_NEARBY` means the first reliable GPS fix was inside the arrival radius,
so no completed journey is inferred. GPS confirmation requires a reliable fix
outside the radius before a reliable fix inside it. The phone evaluates the
position locally using the accuracy-aware 50 m rule; the API receives no GPS
coordinates or route trace.

The administration panel groups attempts started in its selected 7 or 30 day
window by these separate outcomes. It shows counts only, with no conversion
rate. Route attempts are removed by the same 30 day retention job as analytics
events. Neither the API nor browser stores a location history.
