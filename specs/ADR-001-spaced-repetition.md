# ADR-001 — Spaced repetition algorithm

**Status:** accepted · supersedes the SM-2 assumption in the original PRD
**Input:** `Spaced_Repetition_Schema_Optimization.pdf` (Carlos's research)

## Decision

Adopt **FSRS-6** as the scheduling algorithm, with the state and logging schema the research document proposes — but **do not hand-implement the maths**. Use the reference implementation (`ts-fsrs`, MIT) in TypeScript, and use Postgres only to persist the result atomically.

---

## What the research got right

These are adopted as-is and the reasoning is sound:

1. **FSRS over SM-2.** Correct, and the argument is the real one. SM-2 collapses intrinsic difficulty and current memory strength into a single `ease_factor`, so repeated "Hard" ratings permanently depress it and cards get stuck in short-interval loops after the concept is understood. For derivation-heavy material where early ratings are harsh and later ones are not, this is not a corner case — it is the normal trajectory.
2. **SM-2 ignores actual elapsed time.** A card reviewed 30 days late is treated identically to one reviewed on schedule. Students cram before exams and clear backlogs after them, so off-schedule review is the common case, not the exception. FSRS computes retrievability from real elapsed time.
3. **Separating stability from difficulty.** The DSR split is the whole point and the schema reflects it correctly.
4. **Rich review logs.** Storing `state`, `elapsed_days`, `scheduled_days`, and the stability/difficulty *at review time* is essential and easy to get wrong by omission. Without these, the official optimizer cannot be run later and the logs are archaeologically useless. Adopted in full.
5. **Per-user/deck `desired_retention`.** Correct feature, wrong location — see below.
6. **`edited_during_review` flag.** Good instinct. An inline edit changes the prompt mid-session, so that review's latency and outcome are not evidence about the memory being modelled. Adopted, and extended: also exclude reviews where `elapsed_ms` is implausible (the user walked away).
7. **Global defaults first, per-user optimisation later.** Correct sequencing and correct for a lean budget.

## What is wrong in the document

These are concrete errors, not preferences. They are the reason for the "use the library" decision.

**1. The forgetting curve is wrong.**
The document gives `R(t,S) = (1 + w₂₀·t/S)^(−1)`. <cite index="10-1">FSRS-6 uses R(t,S) = (1 + factor·t/S)^(−w₂₀), where factor = 0.9^(−1/w₂₀) − 1</cite>. The document has fixed the exponent at −1 (that is the FSRS v1–v4 curve) while also misusing w₂₀ as the factor. <cite index="14-1">The v4.5-through-v6 family uses a learnable decay; the fixed −1 exponent belongs to v1–v4</cite>. Both roles of w₂₀ are wrong simultaneously.

**2. The interval formula inherits the same error.**
Document: `S/w₂₀ · (R⁻¹ − 1)`. <cite index="9-1">Correct: next_interval = stability / FACTOR × (request_retention^(1/DECAY) − 1)</cite>. With the document's version, every interval the product ever schedules is wrong — plausibly wrong, which is worse than obviously wrong.

**3. Weight indexing is off by two in the difficulty block.**
The PL/pgSQL mixes 0-indexed maths with 1-indexed Postgres arrays inconsistently. Initial stability (`v_weights[v_g]`) and the stability-increase block are correct; the initial-difficulty and difficulty-update terms reach for `v_weights[3..6]` where they need `[5..8]`. <cite index="13-1">Mean reversion reverts D toward w₄, the value corresponding to the Easy button</cite> — so `D₀` depends on w₄/w₅, not w₂/w₃. Also, the document's linear `D₀(G) = w₂ − (G−1)·w₃` is the FSRS-4 form; FSRS-6 uses an exponential term.

**4. The default weight vector is not the FSRS-6 default.**
The document lists a vector beginning 0.4025, 1.1838, 3.1730, 15.6910. <cite index="15-1">The FSRS-6 defaults are [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]</cite>. Twenty-one hand-transcribed floats is a place where a single typo produces subtly bad scheduling that no test will catch.

**5. Two mechanisms are silently missing.**
<cite index="15-1">FSRS-6 changed the same-day review formula to S′ = S·e^(w₁₇·(G−3+w₁₈))·S^(−w₁₉)</cite> — the document has no same-day path at all, despite defining Learning and Relearning states that require one. And <cite index="12-1">post-lapse stability is capped by a minimum against S/e^(w₁₇·w₁₈)</cite>; the document omits the cap, so a lapse on a highly stable card can produce a larger post-lapse stability than the algorithm permits.

**6. `fsrs_parameters` cannot hold its own default row.**
`primary key (user_id)` then `insert ... values (null, ARRAY[...])`. A primary key column is NOT NULL. The seed statement fails.

**7. `desired_retention` is on the wrong table.**
Placed on `card_states`, i.e. one row per (user, card). Changing your target retention would mean rewriting every row you own, and it is not a per-card property. It belongs on `profiles` with a nullable override on `decks`.

**8. The queue index does not serve the queue query.**
`(user_id, due_at)` assumes you review everything due across all decks. Study sessions are per-deck, so the real query filters by deck and the index forces a fetch-then-filter. Worse: **new cards have no `card_states` row at all**, so the queue is actually a union of "due states" and "cards with no state", which the document does not address.

**9. The PL/pgSQL cost argument does not hold.**
"Zero serverless invocation overhead" — you are already inside a serverless function when the request arrives. Calling an RPC does not remove an invocation; it moves computation into the least testable, least type-safe, hardest-to-upgrade layer you have. There is a real atomicity argument for an RPC, and it survives; the performance argument does not.

## The one change I would push back on hardest

**Latency-driven difficulty adjustment and STEM complexity normalisation are inventions, not FSRS.**

The document proposes normalising `elapsed_ms` by a card-complexity score (`length + 3 × LaTeX symbol count`) and nudging difficulty by +0.15 when normalised latency exceeds the user's 90th percentile.

The underlying observation is real and good: a card containing a multivariable proof costs ten seconds of *reading* before recall even begins, so raw latency means something different across cards. But FSRS deliberately does not use response time as a scheduling input. If you add a term the reference model does not have, your `review_logs` no longer describe an FSRS process — and **the official optimizer, which is the single largest benefit of adopting FSRS, can no longer be run against your data.** You would be trading a validated, community-tuned, continuously-improved model for an untested heuristic with a magic constant.

**Decision: record, do not act.** Capture `elapsed_ms` and store a precomputed `complexity` score on the `cards` row. Do not let either influence scheduling in MVP. In V2, with real data, you can test whether latency predicts recall in your population — and if it does, that is a genuinely interesting result you could contribute upstream rather than fork away from. This is the same reasoning as capturing institution and degree at signup: the data is nearly free now and expensive to recover later, but acting on it prematurely is what costs you.

## Why the library, not the RPC

The maths above is not obscure — it is published, referenced, and I still found four errors in one document. That is the signal. FSRS is a moving target (v4 → v4.5 → v5 → v6, with v7 in the benchmark repo already), the formulas carry version-specific subtleties, and **wrong scheduling is invisible**: intervals look reasonable, nothing throws, no test fails, and you find out in a year from retention data you cannot un-collect.

`ts-fsrs` is MIT, dependency-light, runs in a server action, and is maintained by the people who define the algorithm. Adopting it costs nothing you value and removes an entire class of silent failure.

**The shape:**

```
server action
  ├─ load card_states row + resolved desired_retention
  ├─ ts-fsrs: compute next state and interval        ← library, unit-tested against its own fixtures
  └─ single RPC: apply_review(...)                    ← writes card_states + review_logs in one transaction
```

The RPC receives *computed* values and does no maths. That keeps the atomicity the document was right to want, and keeps the algorithm somewhere you can test, type, and upgrade.

## Also add, which the document does not mention

- **Interval fuzz.** Without it, everything learned on one day comes due on one day, forever. `ts-fsrs` supports it; enable it.
- **Maximum interval.** Cap at 365 days for MVP. A course ends; a 4-year interval is meaningless.
- **Learning steps.** The `state` enum implies them. Define them explicitly (1m / 10m is the usual starting point) or new cards behave strangely on day one.
- **Daily new-card limit.** Per deck, default 20. Without it, a student subscribing to a 500-card shared deck gets 500 new cards on day one and never returns.

## Cost check

FSRS costs nothing extra to run. No training infrastructure, no background workers, no per-review inference. Global default parameters are what the published benchmarks use and they already beat SM-2 substantially. **Per-user optimisation is explicitly V2** — it is a real training job, and it needs roughly a thousand reviews per user before it means anything. Do not build it for launch.
