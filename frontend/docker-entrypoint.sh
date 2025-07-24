#!/bin/sh
set -e

# Default to env var or fallback
: "${VITE_API_URL:=http://localhost:9000/api}"

# Create env.js for runtime configuration
cat <<EOT > /usr/share/nginx/html/env.js
window.RUNTIME_CONFIG = {
  VITE_API_URL: "${VITE_API_URL}"
};
EOT

exec "$@"
