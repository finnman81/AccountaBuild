#!/usr/bin/env bash
# Sign the emulator app in as the throwaway test account (scripts/_seed-test-account.js).
# Reads the login from .emu-test-account.json, so it is never typed or printed by hand.
# Run it with the app on its sign-in screen.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .emu-test-account.json ] || { echo "no .emu-test-account.json: run node scripts/_seed-test-account.js <admin-key.json>"; exit 1; }
field() { node -e "process.stdout.write(require('./.emu-test-account.json')[process.argv[1]])" "$1"; }
bash scripts/emu.sh tap 540 680
bash scripts/emu.sh text "$(field email)"
bash scripts/emu.sh tap 500 848
bash scripts/emu.sh text "$(field password)"
bash scripts/emu.sh key BACK
sleep 1
bash scripts/emu.sh tap 540 2135
echo "signed in as the emulator test account"
