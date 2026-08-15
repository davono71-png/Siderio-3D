#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -d node_modules ]]; then
  echo "Prima installazione: scarico i componenti. Serve Node.js, non Docker."
  npm install
fi
echo "Siderio 3D sta partendo. Dalle altre postazioni apri http://$(hostname):3000"
export SIDERIO_SERVE_WEB=1
export NODE_ENV=production
npm run build
npm start
