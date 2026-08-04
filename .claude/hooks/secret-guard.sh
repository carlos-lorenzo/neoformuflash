#!/usr/bin/env bash
# PreToolUse hook on Write|Edit. Blocks writes that look like committed secrets.
# Exit 2 = block the tool call and show stderr to the agent.
set -uo pipefail
payload=$(cat)
content=$(printf '%s' "$payload" | python3 -c 'import sys,json;d=json.load(sys.stdin);i=d.get("tool_input",{});print(i.get("content","")+i.get("new_string",""))' 2>/dev/null || true)
path=$(printf '%s' "$payload" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)

case "$path" in
  *.env|*.env.*) echo "Refusing to write $path. Env files are managed by hand." >&2; exit 2 ;;
esac

if printf '%s' "$content" | grep -Eq 'sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|eyJhbGciOi[A-Za-z0-9._-]{40,}|sb_secret_[A-Za-z0-9_-]{10,}|SUPABASE_SERVICE_ROLE_KEY\s*=\s*["'\'']?ey'; then
  echo "Blocked: this write contains something shaped like a live API key or service-role token. Use an env var reference instead." >&2
  exit 2
fi

# Name-side check: the variable is named for something server-only.
if printf '%s' "$content" | grep -Eq 'NEXT_PUBLIC_[A-Z_]*(SERVICE_ROLE|SECRET|PRIVATE)'; then
  echo "Blocked: NEXT_PUBLIC_ prefix on a server-only secret. This would ship the key to the browser." >&2
  exit 2
fi

# Value-side check. The phase 00 audit found NEXT_PUBLIC_SUPABASE_ANON_KEY set to
# the RLS-bypassing `sb_secret_` key: a perfectly legitimate NAME with a secret
# VALUE, which the rule above sails straight past. Any check keyed on naming
# alone will miss the version of this bug that actually happened.
if printf '%s' "$content" | grep -Eq 'NEXT_PUBLIC_[A-Z_]*\s*=\s*["'\'']?(sb_secret_|eyJ[A-Za-z0-9_-]*cm9sZSI6InNlcnZpY2Vfcm9sZS)'; then
  echo "Blocked: a NEXT_PUBLIC_ variable is being set to a secret VALUE (sb_secret_ or a service_role JWT)." >&2
  echo "The name is fine; the value is not. NEXT_PUBLIC_* is inlined into client JS and served to every visitor." >&2
  echo "Use the PUBLISHABLE key from \`pnpm exec supabase status -o env\`." >&2
  exit 2
fi
exit 0
