# Working in Lật lại

Read `AGENTS.md` first; it is the canonical repository instruction file for all
coding agents. This file is an entry point, not a replacement or a second set of
business rules.

For the current handoff, read in this order:

1. `docs/handoff/SESSION_STATE.md` — saved state, unresolved Android launch and source.
2. `docs/handoff/START_HERE.md` — setup, implemented scope and code map.
3. `docs/handoff/READINESS.md` — evidence and still-open release gates.
4. `docs/handoff/CONTINUATION_PLAN.md` — ordered work packages and acceptance criteria.
5. `docs/handoff/NEXT_SESSION_PROMPT.md` — starting instructions and progress template.

Start at the first unmet dependency. Preserve existing work and closed evidence.
Finish the F2h handoff gates before implementing new transaction behavior. Longer
agent runtime is not approval to skip review, fabricate test evidence, change
business rules or merge to main. Use one feature per branch and small checkpoints.
Update SESSION_STATE and the relevant evidence after each completed work package.
