#!/usr/bin/env python3
"""Production WSGI entry point.

Waitress only trusts X-Forwarded-* from a local reverse proxy. That
lets Flask see the original HTTPS scheme (for the HTTP→HTTPS redirect and
secure-cookie logic) while keeping direct spoofed headers untrusted.
"""

import os

from waitress import serve

from app import app

if __name__ == "__main__":
    serve(
        app,
        host="127.0.0.1",
        port=int(os.environ.get("MATH_PORT", "8787")),
        threads=8,
        channel_timeout=300,
        trusted_proxy="127.0.0.1",
        trusted_proxy_headers={"x-forwarded-for", "x-forwarded-proto"},
    )
