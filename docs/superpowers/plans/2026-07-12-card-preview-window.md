# Card Preview Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the card detail preview visually match the compact tracker and ensure it never remains above unrelated applications.

**Architecture:** Keep the existing external Electron preview window, but gate its visibility on Hearthstone being the active application and clear it on application/window focus loss. Restyle the renderer shell without changing card data or tracker behavior.

**Tech Stack:** Electron, React, TypeScript, Vitest, CSS.

## Global Constraints

- The preview is visible only while Hearthstone is frontmost and a card is actively hovered.
- Switching to another application hides the preview immediately.
- Returning to Hearthstone does not restore the preview until the user hovers a card again.
- The preview remains an external window and does not resize the tracker.
- The visual style must match the compact tracker: square compact shell, restrained border, dense spacing, clear hierarchy.
- Do not commit changes.

---

### Task 1: Preview window visibility guard

**Files:**
- Modify: `src/main/main.ts`
- Test: existing main-process tests or a focused new test under `tests/`

**Interfaces:**
- Consumes: existing frontmost-app helper and card preview IPC request.
- Produces: preview visibility limited to active Hearthstone hover sessions.

- [ ] Write a failing regression test for rejecting or hiding preview display when Hearthstone is not frontmost.
- [ ] Run the focused test and confirm the expected failure.
- [ ] Add the smallest visibility guard and focus-loss hide path.
- [ ] Run the focused test and the full test suite.

### Task 2: Renderer hover lifecycle

**Files:**
- Modify: `src/renderer/components/CardHoverPreview.tsx`
- Test: corresponding renderer component test.

**Interfaces:**
- Consumes: `showCardPreview` and `hideCardPreview` bridge calls.
- Produces: a fresh hover is required after renderer/window focus is lost.

- [ ] Write a failing test proving blur/visibility loss clears the active hover preview.
- [ ] Run the focused test and confirm the expected failure.
- [ ] Add lifecycle cleanup without changing normal hover positioning.
- [ ] Run the focused test and the full test suite.

### Task 3: Compact tracker-matched detail styling

**Files:**
- Modify: `src/renderer/cardHoverStyles.css`
- Modify only if required: `src/renderer/components/CardDetailBody.tsx`
- Test: existing QA preview route and build output.

**Interfaces:**
- Consumes: existing card detail markup.
- Produces: compact external preview styled consistently with the tracker overlay.

- [ ] Tighten shell radius, spacing, typography, borders, image size, and related-card rows.
- [ ] Keep long content internally scrollable and preserve narrow-window behavior.
- [ ] Run typecheck/tests and render the QA preview route for visual inspection.

### Task 4: Controller acceptance

**Files:**
- Update: `docs/ux.md` only if behavior documentation needs correction.

- [ ] Review all changes against the approved behavior.
- [ ] Run the full test suite and production build.
- [ ] Launch the application and inspect the preview visually.
- [ ] Verify switching away from Hearthstone hides the preview and returning does not resurrect it.
- [ ] Perform the memory compounding check and update only durable project documentation if needed.
