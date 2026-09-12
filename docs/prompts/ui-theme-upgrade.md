# UI and theme gap upgrade

Upgrade the remaining UI/theme behavior from origin/main:

- 7f59c41 — chat bubble colors
- 01ee654 — UI polish
- e46bfc7 — mobile Save/Load modal
- b225ed7 — theme isolation and color cleanup

Inspect the current branch and each commit before editing. This is a refactoring upgrade, not a port. Do not cherry-pick commits or reproduce diverged component structures.

Work in dependency order: theme token correctness and chat bubble behavior; small UI polish using those tokens; mobile Save/Load layout and interaction behavior; theme isolation and cleanup across affected surfaces.

Good-taste requirements:

- Define semantic theme tokens once and consume them consistently.
- Remove silent fallbacks caused by undefined variables.
- Keep responsive behavior in the component or style boundary that owns it.
- Preserve accessibility: labels, focus order, keyboard operation, and usable touch targets.
- Avoid scattering one-off inline colors or breakpoint exceptions.
- Do not rewrite unrelated components.
- Do not preserve obsolete compatibility paths just because main had them.
- Treat visual changes as behavior changes only when they affect interaction, contrast, layout, or state visibility.

Add focused tests for theme token resolution and both theme variants; Save/Load modal mobile navigation, focus, and persistence; responsive visibility and interaction states; theme isolation from global leakage; and active, focus, disabled, error, and loading states.

Use browser or visual verification where jsdom cannot establish layout or overflow correctness. Run focused tests, full tests, TypeScript, ESLint, and build. Commit each coherent slice separately and report anything that remains browser-unverified.
