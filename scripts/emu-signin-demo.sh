#!/usr/bin/env bash
# Sign the emulator app in as the demo reviewer (the account scripts/_seed-demo-group.js seeds).
# Reads the email and password from that script, so they are never typed or printed by hand.
# Run it with the app on its sign-in screen.
set -euo pipefail
cd "$(dirname "$0")/.."
get() { node -e "const s=require('fs').readFileSync('scripts/_seed-demo-group.js','utf8');const m=s.match(new RegExp('const '+process.argv[1]+'\\\\s*=\\\\s*[\\'\"]([^\\'\"]+)[\\'\"]'));if(!m)process.exit(1);process.stdout.write(m[1])" "$1"; }
EMAIL="$(get DEMO_EMAIL)"
PASS="$(get DEMO_PASSWORD)"
bash scripts/emu.sh tap 540 680
bash scripts/emu.sh text "$EMAIL"
bash scripts/emu.sh tap 500 848
bash scripts/emu.sh text "$PASS"
bash scripts/emu.sh key BACK
bash scripts/emu.sh tap 540 2135
echo "signed in as the demo reviewer"
