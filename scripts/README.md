# `scripts/*` — structure guards, not the full test suite

This directory holds **source-level regression scripts** (`*-regression.mjs` and related helpers).
They are useful as lightweight checks, but they are **not** a complete behavior test suite.

## Classification (cognitive labels)

| Kind | What it proves | What it does **not** prove |
|---|---|---|
| **dependency guard** | Import edges / inventory / direction constraints | Runtime call order, partial commit, adapter I/O |
| **protocol marker guard** | Tagged protocol strings / field names still exist in source | Correct parse/reduce/commit of live responses |
| **source-shape check** | A file still contains an expected snippet/API surface | Async timing, failure rollback, persistence |
| **migration guard** | Legacy paths/fields remain for save compatibility | That migrated data still behaves correctly |

Many existing `pnpm test:*` package scripts point at these guards. Treat them as **migration / structure** evidence only.

## Phase Gate rule (IKernel refactor)

For IKernel Phase Gates (see `IKernelRefac.md`):

- Structure scripts **must not** be the sole Exit Gate evidence.
- Behavior must be proven by TypeScript tests under `tests/` that **call an Interface**
  (async `execute` → `ExecutionFrame` stream), not by searching source strings.
- **Some existing regression scripts may be incorrect, stale, over-asserting, or testing the wrong thing.**
  If a guard disagrees with real runtime code, trust the real code; do not rewrite production to satisfy a wrong string match.

## Where real behavior tests live

```text
tests/kernel/contract/           # IKernel frame semantics (progress / commit / reject)
tests/kernel/characterization/   # Pure-module behavior plus provisional model checks
tests/kernel/harness/            # Proposed IKernel semantics / Phase-0 CAS harness
tests/kernel/phase1/             # Production contract, LegacyAdapter, KernelClient, createKernel
```

Run with:

```bash
pnpm test:kernel
pnpm test:kernel:contract
pnpm test:kernel:characterization
pnpm test:kernel:phase1
```

## Current Phase-0 limitation

The current in-memory harness deliberately does **not** execute
`hooks/useGame/sendWorkflow.ts`. Its passing tests prove only the proposed
`IKernel` frame and CAS model, not the legacy workflow's observable behavior.
It is therefore insufficient for the Phase 0 Exit Gate. That gate remains
blocked until a production-driven harness can exercise the real workflow with
controlled model, persistence, and state ports.

## Inventory note

`scripts/lib/` helpers and inventory scripts (for example path-auf-calls) are still structure/dependency guards.
They document call graphs; they do not execute turns.
