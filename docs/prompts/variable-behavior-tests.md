# Variable behavior tests

Finish the remaining variable-system regression coverage in this repository.

Read AGENTS.md, CONTEXT.md, ideal_design.md, and the current implementation. The old regression scripts are rejected because they grep source text and obsolete file paths. Replace them with focused Vitest behavior tests against public domain functions.

Add tests for:

1. Traveler profile guard
   - Variable commands cannot overwrite player-authored name, appearance, or backstory.
   - Unrelated variable updates still apply.
   - Repeated application is stable.

2. Phone seed deduplication
   - Duplicate seeds are removed according to the domain’s canonical identity.
   - Cooldown behavior is respected.
   - `maxSeedsPerTurn` is enforced deterministically.
   - Existing user data is preserved.

3. Inventory quantity deduction
   - Deducting less than available quantity.
   - Deducting exactly the available quantity.
   - Deducting more than available.
   - Missing items and empty inventories.
   - No negative quantities or accidental unrelated mutations.

Good-taste constraints:

- Test observable behavior, not source strings, private helpers, implementation names, or localized reason messages.
- Use realistic domain fixtures.
- Prefer one test per invariant with clear setup and outcome.
- Do not change production code unless a test exposes a real behavioral bug.
- If production code must change, refactor the smallest domain module that owns the invariant.
- Do not add compatibility branches merely to make old tests pass.
- Avoid snapshot tests and broad integration fixtures.

Run focused tests, the full suite, TypeScript, and ESLint. Commit tests and any justified production fix separately. Report weak or untestable contracts instead of papering over them.
