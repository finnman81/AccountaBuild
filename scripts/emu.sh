#!/usr/bin/env bash
# Drive the Android emulator from a shell. Used for testing the app without a phone.
#
#   scripts/emu.sh boot              start the Pixel_6 emulator (leave it running)
#   scripts/emu.sh run               build the debug app, install it, start Metro
#   scripts/emu.sh open              open the installed app (Metro must be running)
#   scripts/emu.sh shot <file.png>   screenshot
#   scripts/emu.sh tap <x> <y>       tap (pixels of the 1080x2400 screen)
#   scripts/emu.sh swipe <x1> <y1> <x2> <y2> [ms]
#   scripts/emu.sh text "<words>"    type into the focused field
#   scripts/emu.sh key <BACK|ENTER|HOME>
#   scripts/emu.sh ui                dump the on-screen elements (text, bounds)
#   scripts/emu.sh log               recent app errors from logcat
#
# The debug app loads its code from Metro on this PC, so it shows the working
# tree, not what was published. Reload after an edit with: scripts/emu.sh reload
set -euo pipefail
SDK="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"
ADB="$SDK/platform-tools/adb.exe"
PKG=com.munitor.accountabuild
AVD="${AVD:-Pixel_6}"

case "${1:-}" in
  boot) "$SDK/emulator/emulator.exe" -avd "$AVD" -no-boot-anim ;; # snapshot saves on exit, so the installed app survives
  run) ANDROID_HOME="$SDK" npx expo run:android --device "$AVD" ;;
  install) "$ADB" install -r android/app/build/outputs/apk/debug/app-debug.apk ;;
  open) "$ADB" reverse tcp:8081 tcp:8081 && "$ADB" shell am start -a android.intent.action.VIEW -d "accountabuild://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" >/dev/null ;;
  reload) "$ADB" shell input keyevent 82 ;; # opens the dev menu; "Reload" is the first row
  shot) "$ADB" exec-out screencap -p > "${2:?file}" ;;
  tap) "$ADB" shell input tap "$2" "$3" ;;
  swipe) "$ADB" shell input swipe "$2" "$3" "$4" "$5" "${6:-300}" ;;
  text) "$ADB" shell input text "$(printf '%s' "$2" | sed 's/ /%s/g')" ;;
  key) "$ADB" shell input keyevent "KEYCODE_$2" ;;
  ui) "$ADB" exec-out uiautomator dump /dev/tty | tr '>' '>\n' | grep -oE '(text|content-desc)="[^"]+"[^>]*bounds="[^"]+"' | sed -E 's/ (resource-id|class|package|checkable|checked|clickable|enabled|focusable|focused|scrollable|long-clickable|password|selected)="[^"]*"//g' ;;
  log) "$ADB" logcat -d -t 400 | grep -E "ReactNativeJS|AndroidRuntime|FATAL" | tail -40 ;;
  *) sed -n 2,17p "$0" ;;
esac
