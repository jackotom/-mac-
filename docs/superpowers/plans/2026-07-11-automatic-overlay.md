# Automatic Hearthstone Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically show the tracker overlay as soon as a Standard or Wild deck is selected, switch it to Arena when Arena becomes active, and hide it whenever Hearthstone is not frontmost.

**Architecture:** Keep deck and Arena detection inside `TrackerService`. Add an explicit constructed-screen state for the brief period where the mode is known but the deck is not. Add a small main-process overlay controller that derives one overlay context from tracker state and foreground app state, then creates, shows, hides, or suppresses the existing overlay window without duplicating tracker logic.

**Tech Stack:** Electron 33, TypeScript 5.7, React 18, Vitest.

## Global Constraints

- Standard or Wild selection opens the overlay before the match starts.
- Standard, Wild, and Arena are mutually exclusive overlay contexts.
- The overlay never steals focus from Hearthstone.
- Leaving Hearthstone hides the overlay; returning restores it.
- Uncertain recognition must not display the previously selected deck.
- The project is not a Git repository, so implementation steps do not create commits.

---

### Task 1: Constructed Screen State

**Files:**
- Modify: `src/main/constructedScreenRecognition.ts`
- Modify: `src/main/trackerService.ts`
- Modify: `src/shared/trackerEngine.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/constructedScreenRecognition.test.ts`
- Test: `tests/trackerService.test.ts`

**Interfaces:**
- Produces: `inspectConstructedDeckScreen(observations, decks)` returning `{ mode, selectedName, selectedDeck }`.
- Produces: `PublicTrackerState.constructedScreenMode?: "standard" | "wild"`.
- Produces: `TrackerEngine.clearCollectionDeckPreview(): boolean`.

- [ ] **Step 1: Add failing recognition tests**

Add cases proving that a Standard or Wild title is returned even when the selected deck name is missing or ambiguous, and that an exact mode-filtered deck is returned when available.

- [ ] **Step 2: Run the focused recognition tests**

Run: `npm test -- --run tests/constructedScreenRecognition.test.ts`

Expected: FAIL because `inspectConstructedDeckScreen` does not exist.

- [ ] **Step 3: Implement structured screen inspection**

Keep `findScreenSelectedCollectionDeck` as a compatibility wrapper. Export the mode and selected name through the new inspector so `TrackerService` can distinguish “not on a constructed screen” from “constructed screen, deck still unknown”.

- [ ] **Step 4: Add failing tracker service tests**

Add cases proving that an identified constructed deck sets `constructedScreenMode`, and that a constructed title with no unique deck clears an old Arena or constructed preview instead of retaining stale cards.

- [ ] **Step 5: Implement waiting-state publication**

Add `clearCollectionDeckPreview()` to clear only a non-active preview. Set and clear `constructedScreenMode` in `TrackerService` as screen state changes. Reset Arena state as soon as a constructed mode is confirmed. Publish state only when the public state actually changes.

- [ ] **Step 6: Run focused backend tests**

Run: `npm test -- --run tests/constructedScreenRecognition.test.ts tests/trackerService.test.ts tests/trackerEngine.test.ts`

Expected: all selected test files pass.

---

### Task 2: Automatic Overlay Controller

**Files:**
- Create: `src/main/automaticOverlayController.ts`
- Create: `tests/automaticOverlayController.test.ts`

**Interfaces:**
- Consumes: `PublicTrackerState`, `getFrontmostAppName()`, and an injected window host.
- Produces: `AutomaticOverlayController.start()`, `.stop()`, `.refresh()`, `.suppressCurrentContext()`, and `.clearSuppression()`.

- [ ] **Step 1: Add failing controller tests**

Cover these exact transitions: no state keeps the window hidden; a selected constructed deck creates and shows the window; Arena replaces the constructed context; another frontmost app hides the window; returning to Hearthstone shows it; manual close remains suppressed until mode or deck changes.

- [ ] **Step 2: Run the controller test**

Run: `npm test -- --run tests/automaticOverlayController.test.ts`

Expected: FAIL because the controller module does not exist.

- [ ] **Step 3: Implement the controller**

Derive context keys as `constructed:<deckId>`, `constructed:<mode>:waiting`, or `arena`. Poll every 350 ms, serialize refreshes, call `showInactive` through the host, and clear manual suppression only when the selected deck or mode truly changes. Dropping the deck-select screen marker at game start must not reopen a manually closed overlay for the same deck.

- [ ] **Step 4: Run the controller test again**

Run: `npm test -- --run tests/automaticOverlayController.test.ts`

Expected: PASS.

---

### Task 3: Main Process and Overlay UI Integration

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/renderer/overlayView.ts`
- Test: `tests/overlayView.test.ts`

**Interfaces:**
- Consumes: `AutomaticOverlayController` and `PublicTrackerState.constructedScreenMode`.
- Produces: automatic creation/show/hide of the existing `overlayWindow`; waiting copy in the existing overlay panel.

- [ ] **Step 1: Add failing overlay view tests**

Add Standard and Wild waiting-state cases expecting the title `正在识别套牌` and mode-specific detail without old deck rows.

- [ ] **Step 2: Run the overlay view tests**

Run: `npm test -- --run tests/overlayView.test.ts`

Expected: FAIL because waiting screen mode is not rendered.

- [ ] **Step 3: Integrate the automatic controller**

Start it only in normal application runs, stop it before quit, and adapt the existing overlay window functions as the controller host. Manual close calls `suppressCurrentContext`; manual open clears suppression. Keep QA screenshot modes isolated from automatic polling.

- [ ] **Step 4: Render the waiting state**

When `constructedScreenMode` is set without `autoMatchedDeckId`, return deck identity `正在识别套牌` with detail `标准套牌识别中` or `狂野套牌识别中` and no stale card rows.

- [ ] **Step 5: Run integration-focused tests**

Run: `npm test -- --run tests/automaticOverlayController.test.ts tests/overlayView.test.ts tests/overlayPanel.test.tsx tests/arenaChoiceOverlayVisibility.test.ts`

Expected: all selected test files pass.

---

### Task 4: Acceptance and Documentation

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/backend.md`
- Modify: `docs/ux.md`

- [ ] **Step 1: Update project documentation**

Document that the main overlay is automatic, mode-exclusive, foreground-gated, and manually suppressible until the context changes.

- [ ] **Step 2: Run all automated checks**

Run: `npm run typecheck && npm test && npm run build`

Expected: type checking, the full Vitest suite, and the production build all pass.

- [ ] **Step 3: Package the Mac app**

Run: `npm run package:mac-arm64`

Expected: `outputs/炉石记牌器.app` and `outputs/炉石记牌器-mac-arm64.zip` are regenerated.

- [ ] **Step 4: Verify the packaged app**

Run: `codesign --verify --deep --strict --verbose=2 outputs/炉石记牌器.app`

Expected: the app is valid on disk and satisfies its designated requirement. Use the QA overlay launch path to capture and inspect the packaged overlay without requiring a live Hearthstone match; report live-game verification separately if Hearthstone is unavailable.
