# Model routing — OmniRoute + Claude Pro

You run OmniRoute locally as a single Anthropic-compatible endpoint (`http://localhost:20128/v1`) fronting every provider key you own. That is a materially better position than the one I assumed, and it changes the plan in your favour.

## What it unlocks that a Pro-only setup cannot do

Claude Code maps the three model tiers to environment variables. Point those at different providers and **each subagent's `model:` field becomes a routing instruction**:

```jsonc
// .claude/settings.local.json  (gitignored — this is yours, not the project's)
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:20128/v1",
    "ANTHROPIC_AUTH_TOKEN": "<your omniroute local key>",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL":  "<cheap, fast — explorer, test-runner, doc-syncer>",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "<mid — implementation, code-reviewer, design-critic>",
    "ANTHROPIC_DEFAULT_OPUS_MODEL":   "<strongest — security-auditor, hard planning>"
  }
}
```

The six agents in `.claude/agents/` already declare `haiku` / `sonnet` / `opus`. With the mapping above, they route to three different models — potentially three different vendors — with no change to the agent files. That is the "cheap workers, smart lead" architecture working properly, per-agent rather than per-session.

Set `CLAUDE_CODE_SUBAGENT_MODEL` only if you want to override *everything* down to the cheap tier (useful for a bulk audit run, wrong for normal work since it would demote the security auditor).

## Two launchers, and when to use which

`ANTHROPIC_BASE_URL` is snapshotted when the process starts, so the choice is per-terminal:

```bash
# ~/.zshrc or ~/.bashrc
alias ccx='ANTHROPIC_BASE_URL="http://localhost:20128/v1" \
           ANTHROPIC_AUTH_TOKEN="$OMNIROUTE_KEY" claude'
```

Plain `claude` uses your Pro subscription. `ccx` uses OmniRoute.

| Use | Launcher | Why |
|---|---|---|
| `plan-phase` interrogation | `claude` (Pro) | Highest-leverage tokens in the project; subscription pricing makes long planning sessions free at the margin |
| Implementation | `claude` (Pro) | Same reason. Fall back to `ccx` when you hit a usage window. |
| Anything spawning many subagents (`ship-phase`, codebase audits) | `ccx` | This is where per-agent tier routing pays, and where Pro limits get eaten |
| Adversarial pass | `ccx`, pointed at a **non-Claude** model | The whole value is a reviewer that does not share the builder's failure modes. A second Claude agrees with the first too often. |
| Research, doc sync, changelog | `ccx` on the cheap tier | Volume work, low judgement |

**Pro is your quality budget; OmniRoute is your volume budget.** Spend Pro on thinking, OmniRoute on grinding.

## Health check before you start

A dead router fails as an auth error mid-session, which reads like a Claude Code bug and wastes twenty minutes. Add to `.claude/hooks/`:

```bash
#!/usr/bin/env bash
# router-check.sh — SessionStart hook, only meaningful in ccx sessions
[ -z "${ANTHROPIC_BASE_URL:-}" ] && exit 0
curl -sf -m 2 "${ANTHROPIC_BASE_URL%/v1}/health" >/dev/null \
  || { echo "OmniRoute is not responding at $ANTHROPIC_BASE_URL. Start it before continuing." >&2; exit 1; }
exit 0
```

Adjust the health path to whatever OmniRoute exposes.

## Caveats worth knowing

- **Non-Claude models behave differently under the Claude Code harness.** Tool-calling reliability varies a lot by model. Test each mapping on a throwaway task before trusting it with `security-auditor`.
- **Prompt caching may not survive the proxy.** If your cheap-tier costs come in far above expectation, this is the first thing to check — cache misses on a large `CLAUDE.md` add up fast.
- **Keep the Pro path working.** If an update breaks the proxy integration, you should be able to keep building on `claude` alone that day.

## Parallelism, revised

My earlier "two worktrees maximum on Pro" was a limit imposed by your subscription window. With OmniRoute absorbing the read-only and review work, **three parallel worktrees are viable** — run implementation in `claude` sessions and every reviewer in `ccx`. The real ceiling is now you: three concurrent branches is about what one person can review and merge without losing the thread.
