# Album gap analysis and rewrite

Analyze and upgrade the Album feature against these origin/main commits:

- 985d894
- 671ab45
- e30d06b
- 123e1ef
- 50d9f17
- 93bee34

This is a rewrite assessment, not a port. Do not cherry-pick, copy patches mechanically, or recreate main’s file layout. Read AGENTS.md, CONTEXT.md, ideal_design.md, kernelization.md, current Album code, and the six commit diffs.

For every commit, classify its behavior as already covered, obsolete or superseded, worth rewriting, or dependent on another behavior. Produce a concrete gap matrix before editing.

Then implement only meaningful missing behavior using this branch’s architecture. Keep domain logic in Album services, models, hooks, or utilities. Preserve existing public behavior unless the main feature clearly fixes a bug or completes an incomplete contract.

Good-taste requirements:

- One authoritative model for album entries, references, tasks, projections, and archive identity.
- Keep UI components focused on rendering and interaction.
- Prefer pure projection and normalization functions over duplicated filtering logic.
- Preserve referential integrity across import, export, task attachment, and asset resolution.
- Avoid speculative abstractions, broad renames, and unrelated cleanup.
- Do not introduce compatibility code for paths that no longer have callers.
- Do not port main’s architecture when the current branch has a clearer design.
- Make intentional breaking behavior explicit and test it.

Add behavior tests for each accepted gap, especially reference injection and target ownership; task-feed visibility, attachment, ordering, and orphan diagnosis; gallery projection scope, deduplication, built-ins, and asset mounting; and archive round-trip, remapping, duplicate handling, hashes, and dangling references.

Tests must avoid localized message assertions and implementation details. Run focused Album tests, full tests, TypeScript, ESLint, and build. Commit in coherent rewrite slices and include the gap matrix, design decisions, risks, and validation results.
