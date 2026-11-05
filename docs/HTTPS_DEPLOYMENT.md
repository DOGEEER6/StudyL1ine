# HTTPS deployments

Run `python serve.py` behind a local reverse proxy. The WSGI server binds only
to `127.0.0.1`; `MATH_PORT` selects the internal port (default `8787`).

Keep the existing `MATH_DATA_DIR` and secret source when promoting a deployment.
Set `MATH_COOKIE_SECURE=1` for HTTPS. When hosting multiple applications on the
same hostname, use a distinct `MATH_SESSION_COOKIE_NAME` (for example,
`studyl1ne_session`); cookies are shared across ports. The default remains
`session` for existing installations.

The reverse proxy must preserve the host and port, overwrite forwarded headers,
accept requests up to 24 MiB, and allow at least 120 seconds for AI responses.
Only localhost is trusted for forwarded client addresses and protocol.

Use a process supervisor with restart-on-failure and startup dependencies for
the data volume. Verify the existing database is present before starting, so
an unavailable volume cannot silently create an empty database.

Before switching the public listener, back up the database consistently and
retain the previous launcher/environment. Avoid running two app processes
against the same database during the switch because startup recovers AI jobs.
Validate TLS with certificate verification enabled, login cookies, CSRF,
authenticated pages, and administrator access restrictions after the switch.

Keep machine-specific proxy, systemd, certificate and environment files outside
this repository. Tag the verified release and retain a documented rollback.
