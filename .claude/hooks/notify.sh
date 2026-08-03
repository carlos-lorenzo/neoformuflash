#!/usr/bin/env bash
# Stop hook. Audible ping when the agent finishes or needs you.
# macOS:
command -v afplay >/dev/null && afplay /System/Library/Sounds/Glass.aiff 2>/dev/null &
# Linux:
command -v paplay >/dev/null && paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null &
# Windows (Git Bash): powershell.exe -c '[console]::beep(880,200)'
exit 0
