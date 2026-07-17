# PR #4 Low-Risk Interaction Fixes

## Goal

Add three contained fixes to `earmer/refactor/ikernel` without changing kernel contracts, phone wallpaper behavior, save migration, or global button infrastructure.

## Scope

### Closed system drawer keyboard isolation

`SystemDrawer` stays mounted for its slide animation, but a closed drawer must not expose descendants to keyboard focus. Keep the current animation and apply the platform `inert` state to the drawer while it is closed. Retain `aria-hidden` for accessibility semantics.

Do not add global Tab handlers, force focus with `blur()`, or intercept keyboard events.

### Opening preset persistence

Treat save and delete as mutations of the same preference resource:

- Track one local pending mutation (`save`, `delete`, or idle).
- Ignore a new mutation while one is pending.
- Disable the save and delete controls while persistence is pending and expose an action-specific busy label.
- Write normalized presets to preferences before publishing the new list to React state.
- Preserve the existing success and failure status messages.

Applying a preset remains synchronous and is not part of the mutation lock. No shared debounce utility or global button policy will be introduced.

### Mobile skill save action

Keep the existing desktop action row. Hide its primary save action below the desktop breakpoint, then render the same action after `SkillEditor` on mobile. Both controls call the existing `saveSkill` function and use the same disabled state and label.

The mobile action stays in normal document flow. It must not be fixed over the chat input or duplicate save logic.

## Error Handling

- Preset persistence failures leave the previously persisted preset list visible and show the existing failure status.
- The pending mutation always resets in `finally`.
- Skill validation continues to use the existing name/description checks and does not add fallback writes.

## Verification

1. Add a focused regression script for the three source contracts and expose it through `package.json`.
2. Run the new regression plus the existing skill, settings-navigation, and API-error regression scripts.
3. Run the TypeScript/Vite production build.
4. In a browser, verify that a closed drawer cannot receive Tab focus and an open drawer can.
5. At a mobile viewport, verify the skill save action appears after the final editor field without overlap; at desktop width, verify only the header action is visible.
6. Independently review the final diff for global key interception, duplicated save logic, timer-based debounce, swallowed errors, and unrelated changes.

The pre-existing `scripts/opening-preset-regression.mjs` migration failure is recorded but is not part of this change; the focused regression avoids expanding this patch into a rewrite of that legacy script.

## Non-Goals

- Phone wallpaper fixes.
- iKernel boundary or API-profile migration work.
- Global button debouncing or notification infrastructure.
- Reworking the entire opening-preset regression suite.
- Updating already resolved findings at the top of `findings.md`.
