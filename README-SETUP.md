# The AI layer — how to install and use this

Everything in this folder is the layer *around* the model: rules, specs, agents, skills, hooks, verification. It is not application code. Drop it into the repo root.

```
CLAUDE.md              project rules, loaded every session. Keep it short.
.claude/settings.json   permissions, hooks, subagent model
.claude/agents/         six subagents
.claude/skills/         five workflows
.claude/hooks/          secret guard, notification, cost log
specs/                  design system, contracts, ADRs, phase specs, roadmap, evolution ledger
refs/                   your screenshot corpus (you fill this)
docs/                   cost routing, measurement plan
```

## Day 1

```bash
# 1. install
cp -r ai-layer/. /path/to/your/repo/
cd /path/to/your/repo
chmod +x .claude/hooks/*.sh          # required — the zip does not preserve the bit
echo ".claude/settings.local.json"  >> .gitignore
echo ".claude/cost-log.csv"         >> .gitignore
git add -A && git commit -m "chore: AI layer"

# 2. restart Claude Code — hand-edited agent files need a fresh session
claude
```

Then, in order:

1. **Read `docs/COST-ROUTING.md` first.** It changes the parallelism plan for your Pro tier, and it is the difference between this working and burning a usage window in an afternoon.
2. **Fill `refs/`.** 24–32 screenshots per `refs/ANNOTATIONS.md`. Two hours of your time, and it is the highest-value two hours in this whole setup — it is the only way your design taste gets into the system.
3. **Read `specs/design-system.md` and change what you disagree with.** It is opinionated on purpose. It is frozen *after* you edit it, not before. Right now it is my proposal, and the type-pairing rationale in §2 is the part I would defend hardest.
4. **Answer the three open questions at the bottom of `specs/01-contracts.md`.** All three affect the schema and all three get expensive after launch. Read `specs/ADR-001-spaced-repetition.md` first — it decides the SRS algorithm and rewrites the `card_states` and `review_logs` tables.
5. **Run phase 00.** `Read specs/phase-00-foundation.md and CLAUDE.md. Plan the implementation. Do not write code yet.` — in plan mode.
6. **At the end of phase 00, run the design-critic calibration check** in `docs/MEASUREMENT.md`. Do not skip this. If the critic cannot catch deliberately planted violations, the UI verification story is decoration and you need to know before you rely on it for six phases.

## The loop, every phase

```
/clear
→ plan-phase          interrogate until 95%, produce the spec
→ implement           one worktree, one session, spec in hand
→ verify-ui           screenshots → design-critic → fix → repeat (max 3)
→ ship-phase          the gate: tests, design, code review, security
→ adversarial pass    a FRESH session, hostile prompt, ideally a different model
→ session-handoff     then /clear
→ evolve              one line in EVOLUTION.md
```

## Things that will bite you

- **Hand-edited agent files need a session restart.** Files created via `/agents` do not. If an agent "doesn't exist", restart before debugging.
- **Model names are lowercase.** `sonnet`, not `Sonnet`. The frontmatter key is `model`, not `Model`.
- **Subagents cannot ask you questions** and cannot call other subagents. Clarify before delegating; chain from the main session.
- **Subagents start blank.** They see `CLAUDE.md` and their task brief, nothing from your conversation. If a task needs the last 20 messages, use `/fork`, not a subagent.
- **Don't spawn a subagent for a 30-second job.** Startup overhead with no benefit is why people wrongly conclude subagents are slow.
- **`CLAUDE.md` growing is a smell, not progress.** Replace rules with lint rules and tests wherever you can.

## What I deliberately did not build

- **Phase specs 03–07.** Writing them now would be guessing at decisions phases 00–02 will make for you. Use `plan-phase` immediately before each.
- **An MCP server config.** Every connected server front-loads tool definitions into context before any work starts. Add Context7 when you hit a library-docs problem, code-graph around phase 04 when the repo is big enough to need it, and nothing "just in case".
- **Agent teams.** Expensive, token-heavy, and poor at building. Good for debate and adversarial review only — and a single hostile session gets you most of that for a fraction of the spend.
