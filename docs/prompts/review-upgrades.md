# Cross-workstream upgrade review

Review these upgrades as a senior maintainer.

Check correctness, regression resistance, good taste, overall complexity, code clarity, real behavioral tests, and whether the work is an upgrade rather than a port of origin/main.

Look for duplicated sources of truth; compatibility code with no live callers; tests that assert localized text or implementation details; missing edge cases around persistence, migration, identity, and referential integrity; silent CSS token failures; responsive behavior that jsdom tests cannot verify; unrelated scope expansion; and architecture copied from main despite a better current design.

Fix concrete issues you find. Strengthen weak tests. Do not perform speculative redesign.

Run the relevant focused tests plus full suite, TypeScript, ESLint, and build. Finish with severity-ordered findings, fixes, remaining risks, exact validation, commit hashes, and working-tree status.
