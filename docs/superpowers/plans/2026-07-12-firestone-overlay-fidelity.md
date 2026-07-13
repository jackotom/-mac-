# Firestone-Style Overlay Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the normal in-game tracker overlay faithfully match the reference window's compact structure, density, palette, and card-row presentation while preserving existing tracker behavior.

**Architecture:** Keep the existing overlay view model and tracker backend unchanged because they already expose deck, hand, other-zone, cost, art, and count data. Limit implementation to the normal overlay React markup, its scoped CSS, focused component tests, and rendered QA at the supported window sizes.

**Tech Stack:** Electron 33, React 18, TypeScript 5, CSS, Vitest, Testing Library.

## Global Constraints

- Preserve automatic deck recognition, Arena mode, missing-log/error states, hover preview, drag, resize, and close behavior.
- Do not invent win rate, matchup, or historical statistics that are absent from the state model.
- Do not copy Firestone branding or proprietary logo assets; reproduce only layout, density, information order, and interaction.
- Default overlay remains `210x500`; minimum remains `190x400`.
- Do not commit changes unless the user explicitly asks.

---

### Task 1: Lock the compact normal-overlay contract

**Files:**
- Modify: `tests/overlayPanel.test.tsx`
- Test: `tests/overlayPanel.test.tsx`

- [ ] Add assertions for the exact visible order: toolbar, deck summary, deck group, hand group, other group.
- [ ] Assert each card row exposes cost, art/name, and quantity columns and each group remains independently collapsible.
- [ ] Run `npm test -- tests/overlayPanel.test.tsx` and confirm the new contract fails before implementation when appropriate.

### Task 2: Refine the normal overlay to the accepted reference

**Files:**
- Modify: `src/renderer/components/OverlayPanel.tsx`
- Modify: `src/renderer/overlayStyles.css`

- [ ] Keep the toolbar and summary fixed while the grouped list area consumes remaining height.
- [ ] Match the reference hierarchy: narrow dark toolbar, single-row deck identity and counters, 23px group headers, 24px card rows, square blue-black separators, mana block, darkened horizontal card art, right quantity cell.
- [ ] Keep long names on one line with ellipsis and preserve readable contrast on bright card art.
- [ ] Keep Arena and error-state selectors isolated from the normal overlay changes.
- [ ] Run `npm test -- tests/overlayPanel.test.tsx tests/overlayView.test.ts tests/overlayWindowBounds.test.ts` and confirm all pass.

### Task 3: Verify behavior and rendered fidelity

**Files:**
- Modify if needed: `docs/frontend.md`

- [ ] Run `npm run typecheck`, `npm test`, and `npm run build`.
- [ ] Render representative deck, hand, and other data at `210x500` and `190x400`.
- [ ] Verify independent collapse, internal scrolling, hover preview, close behavior, no horizontal overflow, and no whole-window scroll.
- [ ] Compare screenshots with `IMG_0092.PNG` and `IMG_0093.PNG`; fix mismatches in density, hierarchy, palette, clipping, and contrast.
- [ ] Record durable project-only layout facts in `docs/frontend.md` only if the implementation changes them.
