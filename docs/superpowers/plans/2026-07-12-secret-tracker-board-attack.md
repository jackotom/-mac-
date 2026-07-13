# Secret Tracker And Board Attack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Firestone-style opponent-secret deduction and live friendly/opponent board-attack totals.

**Architecture:** Extend the shared tracker state with independent secret slots and board entities. Parse the minimum additional Power.log records needed for action boundaries and attack values, keep deduction in a focused shared module, then render the resulting view model in the existing opponent overlay.

**Tech Stack:** Electron 33, React 18, TypeScript 5, CSS, Vitest, Testing Library.

## Global Constraints

- Never infer eliminated secrets in React; the shared tracker owns deductions.
- Never eliminate a candidate without an explicit supported rule.
- Keep multiple secret entities independent.
- Automatic display must use a no-focus path.
- Keep existing overlay, Arena, collection-deck, and card-preview behavior intact.
- Do not create a git commit.

---

### Task 1: Shared secret and board state

**Files:**
- Create: `src/shared/secretTracker.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/cardDatabase.ts`
- Modify: `src/shared/powerLogParser.ts`
- Modify: `src/shared/trackerEngine.ts`
- Test: `tests/secretTracker.test.ts`
- Test: `tests/trackerEngine.test.ts`

**Interfaces:**
- Produces `OpponentSecretSlot`, `SecretCandidate`, and `BoardAttackSummary` on `PublicTrackerState`.
- Produces parser events for attack changes and supported action boundaries.

- [ ] Write focused failing tests for independent secret slots, conservative candidate filtering, supported non-trigger elimination, reveal/removal, reset, and live two-sided attack totals.
- [ ] Run `npm test -- tests/secretTracker.test.ts tests/trackerEngine.test.ts` and confirm the new assertions fail for missing behavior.
- [ ] Implement the smallest typed state and rule engine that passes those tests, preserving unknown candidates.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Renderer view model and interaction

**Files:**
- Modify: `src/renderer/types.ts`
- Modify: `src/renderer/overlayView.ts`
- Modify: `src/renderer/components/OpponentOverlayPanel.tsx`
- Modify: `tests/overlayView.test.ts`
- Modify: `tests/opponentOverlayPanel.test.tsx`

**Interfaces:**
- Consumes `PublicTrackerState.opponentSecrets` and `PublicTrackerState.boardAttack`.
- Produces clickable secret slots, candidate disclosure, and friendly/opponent attack controls.

- [ ] Add failing view/component tests for `?` slots, independent slot selection, disclosure, possible/excluded labels, and both attack totals.
- [ ] Run `npm test -- tests/overlayView.test.ts tests/opponentOverlayPanel.test.tsx` and confirm failure is caused by the missing feature.
- [ ] Add the minimum view mapping and accessible React interaction.
- [ ] Re-run the focused tests and confirm they pass.

### Task 3: Overlay layout and automatic display

**Files:**
- Modify: `src/renderer/opponentOverlayStyles.css`
- Modify: `src/main/main.ts`
- Create: `src/main/opponentSecretOverlayVisibility.ts`
- Create: `tests/opponentSecretOverlayVisibility.test.ts`
- Modify: `docs/frontend.md`
- Modify: `docs/backend.md`

**Interfaces:**
- Consumes the count of active secret slots.
- Produces a one-shot, no-focus auto-show decision for a newly added secret.

- [ ] Add failing tests proving `0→1` and `1→2` are new-secret transitions while candidate-only updates are not.
- [ ] Implement the pure visibility transition helper and wire it to `showInactive()`.
- [ ] Add compact styles for attack controls, secret tabs, scrolling candidates, and white excluded rows at `360×260` and `240×160`.
- [ ] Record the durable project behavior in frontend/backend docs.
- [ ] Run `npm test -- tests/opponentSecretOverlayVisibility.test.ts tests/opponentOverlayPanel.test.tsx`.

### Task 4: Controller acceptance

**Files:**
- Verify all files touched above.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Launch the opponent-overlay QA view with representative secrets and board attack, click every control, and inspect the rendered screenshot at normal and minimum size.
- [ ] Fix any failure or visual overlap, then repeat the failed check.
- [ ] Update project docs only if the final behavior differs from the design.
