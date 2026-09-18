#!/bin/sh
set -e

# Default to env var or fallback
: "${VITE_API_URL:=https://plotmio.com/api}"
: "${VITE_WS_URL:=wss://plotmio.com}"

# Create env.js for runtime configuration
cat <<EOT > /usr/share/nginx/html/env.js
window.RUNTIME_CONFIG = {
  VITE_API_URL: "${VITE_API_URL}"
  ,VITE_WS_URL: "${VITE_WS_URL}"
};
EOT

exec "$@"
