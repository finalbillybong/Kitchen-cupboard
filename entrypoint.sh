#!/bin/sh
set -e

# Ensure data directory and its contents are writable by appuser.
# This handles the case where a host-mounted volume is owned by root
# (e.g., first deploy or upgrade from a non-rootless image).
chown -R appuser:appuser /app/data 2>/dev/null || true

exec gosu appuser "$@"
