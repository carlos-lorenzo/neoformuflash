# Phase NN — <name>

## Goal and why
<What a user can do after this that they could not before. Include the "why" — intent shapes implementation more than instructions do.>

## Not in this phase
<Explicit exclusions. This section prevents more waste than any other.>

## Contract changes
<Exact migration SQL, Zod schemas, TS types. Or "none".>

## Routes and server actions
| Path | Method | Input type | Output type | Auth |
|---|---|---|---|---|

## Component inventory
| Component | File | Props | Client/Server | States it must handle |
|---|---|---|---|---|
<States means: loading, empty, error, dense-realistic-content, 390px. All five, for every component that renders data.>

## Acceptance criteria
1. <Observable user-facing behaviour. Independently testable. Never "function X exists".>

## Verification
- Commands: `...`
- Playwright flows to add: `<names>`
- Reviewers: test-runner, design-critic, code-reviewer, [security-auditor if auth/keys/payments/public data]

## Files I may touch
<Explicit paths or globs. Anything else: stop and ask.>

## Risks and open questions
