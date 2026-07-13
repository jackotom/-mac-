# Compact Card Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the card detail preview as a compact deep-blue companion to the tracker overlay without changing hover behavior.

**Architecture:** Keep `CardHoverPreview` and Electron preview-window messaging unchanged. Update the shared preview markup only if needed for stable styling, then scope the visual work to `cardHoverStyles.css` and verify both in-page and external preview modes.

**Tech Stack:** Electron, React, TypeScript, CSS, Vitest, Testing Library.

## Global Constraints

- Preserve hover show/hide, delayed hide, external preview ownership, and no-focus behavior.
- Target about 280px width with small radius, thin blue-gray borders, and compact spacing.
- Preserve all real card data and related-card scrolling; do not invent fields.
- Do not change tracker state or overlay grouping.
- Do not commit changes unless explicitly requested.

---

### Task 1: Preview visual contract

**Files:**
- Modify: `tests/cardHoverPreview.test.tsx`
- Modify: `src/renderer/cardHoverStyles.css`
- Modify if required: `src/renderer/components/CardDetailBody.tsx`

- [ ] Add focused assertions that preview content and related-card content remain present in both preview modes.
- [ ] Apply the compact deep-blue table styling to `.card-hover-preview` and `.card-preview-window-shell`.
- [ ] Keep long text and related cards internally scrollable with no horizontal overflow.
- [ ] Run `npm test -- tests/cardHoverPreview.test.tsx`.

### Task 2: Behavior and visual verification

**Files:**
- Modify if needed: `docs/ux.md`

- [ ] Run `npm run typecheck`, `npm test`, and `npm run build`.
- [ ] Open `?card-preview=1&qa-card-preview=1`, capture the real rendered preview, and inspect it against the accepted design and tracker window.
- [ ] Verify hover entry, delayed exit, continuous target switching, text readability, related-card scrolling, and absence of console errors.
- [ ] Package the Mac app, restart it, and verify the new process uses the rebuilt app.
