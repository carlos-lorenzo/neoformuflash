---
name: ship-phase
description: Use when a phase's implementation is complete and the user says "ship it", "close the phase", "ready to merge", or asks for the pre-merge gate. Runs the full quality gate in order and refuses to merge on any blocking finding.
---

# Ship a phase

The gate. Run it in this order. Stop at the first hard failure and report — do not attempt to push through.

1. **Self-check.** Reread the phase spec's acceptance criteria. For each, state met / partial / missing with the evidence. Anything not met: stop here.
2. **`test-runner`** — typecheck, lint, build, unit, e2e. Must be PASS.
3. **`verify-ui` skill** — screenshots at 390/768/1440, design-critic clean or taste-only findings.
4. **`code-reviewer`** — zero blocking findings.
5. **`security-auditor`** — required if the phase touched auth, RLS, keys, payments, or any publicly rendered surface. Otherwise skip and say you skipped it and why.
6. **Adversarial pass.** Tell the user to open a *fresh* session and run:
   `Read specs/phase-NN.md and the diff on this branch. Your job is to find what is wrong with it. Be hostile. Assume the previous agent cut corners. Report the three most likely ways this breaks in production.`
   Do not run this in the current session — the point is a context that never saw the reasoning.
7. **`doc-syncer`** — specs and contracts README reflect what shipped.
8. **Handoff.** Run the `session-handoff` skill.
9. **Evolve.** Run the `evolve` skill.

Only then: propose the merge command. Never run `git merge` or `git push` yourself.

## Report format

```
Phase NN gate — PASS / BLOCKED
1. Acceptance criteria   n/n met
2. Build + tests         PASS / FAIL (n failures)
3. UI verification       clean / n findings
4. Code review           n blocking, n should-fix
5. Security audit        run / skipped (reason)
6. Adversarial           <user runs this>
7. Docs synced           yes
Blocking items: ...
```
