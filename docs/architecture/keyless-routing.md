# Keyless road routing for the demonstration

Issue #98 replaces the fixed route artwork in #8 with a real road route. The
first API slice exposes `POST /api/v1/routes` with a published `pharmacyId`,
validated origin, `car` or `walk`, and `locationConsent: true`. The browser must
obtain explicit consent before making this call. A true field is a contract
guard, not proof that a human consented. The destination comes from Wanzila's
published pharmacy record, never from an arbitrary client coordinate.

The API calls the FOSSGIS OSRM public server without a key. It sends the exact
origin and destination in the provider URL. FOSSGIS [states that it logs route
requests](https://routing.openstreetmap.de/about.html); the browser consent
copy must disclose this before sending the origin. Wanzila does not store the
origin, route, or GPS trace. The Wanzila endpoint uses POST and `no-store`, so
its own URL and normal access logs contain no coordinates. Do not log request
bodies, provider URLs, or raw provider errors.

FOSSGIS requires attribution, a "fix the map" link, an identifying User-Agent,
and no more than one request per second. The API returns the required links with
every route and rejects excess requests with 429. This limit is shared within
one Fastify process; **the public service may run on only one API instance**.
Scaling requires a shared limiter or a Wanzila-owned OSRM instance first. This
public service has no availability guarantee and is only suitable for the
controlled demo. `ROUTING_BASE_URL` supports a future Wanzila instance, but
deployment must also review attribution and rate limits for that instance.

The response uses the provider's road geometry, metres, seconds, step
maneuvers and road names. It also includes both waypoint snap distances, so
the UI can warn when a pharmacy coordinate is far from the road. It does not
claim live traffic or motorcycle routing. No route, provider failure, malformed
response, or timeout returns an explicit error; none falls back to fictional
measurements. The UI retains address, call and external-map hand-off.
