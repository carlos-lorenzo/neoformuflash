---
name: session-handoff
description: Use when the user says "session handoff", "wrap up", "hand off", "summarize before I clear", or is about to /clear. Produces a chat-only handoff so a fresh agent can continue with no loss of continuity.
---

# Session handoff

A context-handoff artifact. The audience is a future instance of you, not a stakeholder.

Review the **whole** conversation, not the last few turns. Pull from: the phase spec that drove the session, TodoWrite state, background shell ids, files you touched, and questions that never got answered.

Do not audit the filesystem. No `git log`, no broad globs. If you did not touch it this session, it does not belong here.

Output in chat only. Never write it to a file.

```
# Session Handoff — <one-line title>

## Where it started
## Decisions locked + what shipped
- <decision> — <why, absolute path>
## Key files for next session
- Phase spec: <absolute path>   (name this first if a spec drove the session)
## Running state
- Background shells: <id + what + kill command> — or "none"
- Dev servers / ports: — or "none"
- Worktrees / branches: — or "none"
## Verification — how to confirm things still work
- `<command>` — <expected outcome>
## Deferred + open questions
## Pick up here
<one or two sentences: the single most likely next action>
```

Hard rules: absolute paths always · every section present even if "none" · no emojis, no praise, no retrospective · exactly one "pick up here" line.
