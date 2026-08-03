#!/usr/bin/env bash
# SessionEnd hook. Appends one row per session so you can measure whether this whole
# setup is actually earning its keep. See docs/MEASUREMENT.md.
set -uo pipefail
log="${CLAUDE_PROJECT_DIR:-.}/.claude/cost-log.csv"
[ -f "$log" ] || echo "timestamp,branch,phase,note" > "$log"
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "-")
phase=$(printf '%s' "$branch" | grep -oE 'phase-[0-9]+' || echo "-")
printf '%s,%s,%s,%s\n' "$(date -u +%FT%TZ)" "$branch" "$phase" "session end" >> "$log"
exit 0
