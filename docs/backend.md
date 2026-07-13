# Backend and parsing layer

## Safety boundary

This layer only reads Hearthstone log files from disk. It does not read process memory, inject code into the game, patch files, or call any game process APIs.

## Files

- `src/main/logDiscovery.ts`: finds readable Hearthstone log sessions on macOS, including `Arena.log`.
- `src/main/collectionDeckService.ts`: scans `Decks.log`, imports collection deck records, and writes them to the local JSON database.
- `src/main/collectionDeckStore.ts`: reads and writes the local collection deck JSON database under Electron `userData`.
- `src/main/cardDataService.ts`: imports the full constructed-card list from the official Blizzard card browser API, merges the full HearthstoneJSON mirror so generated/upgraded cards can be resolved, and stores versioned local snapshots. Fresh snapshots are used directly; stale snapshots check the official page build version before downloading all pages again. A snapshot with missing related cards is upgraded once.
- `src/main/arenaRatingService.ts`: loads versioned HearthArena ratings, HearthArena official zh-cn/zh-tw tierlist pages, and Firestone public Arena/Underground statistics into a local cache, preserving source versions, winrates, played winrates, pick-rate buckets and sample sizes.
- `src/main/arenaScreenRecognition.ts`: invokes the bundled macOS visual recognizer for Arena candidate fallback and constructed deck-select text recognition.
- `src/main/frontmostApp.ts`: reads the bundled macOS frontmost-app helper and gates Arena visual recognition/choice overlay visibility to Hearthstone.
- `src/main/opponentSecretOverlayVisibility.ts`: detects increases in independent opponent-secret slot count so the opponent overlay is shown once without taking focus.
- `src/main/boardAttackOverlay.ts`: owns the confirmed HDT attack-icon placement ratios and the active-game/frontmost-app visibility rule.
- `src/main/opponentOverlayWindowState.ts`: preserves expanded opponent-window bounds while switching to and from the compact folded entry.
- `src/main/hearthstoneInstallation.ts`: reads the local Hearthstone app version and cross-checks Battle.net product records before publishing a verified CN patch.
- `src/main/ladderDeckRecommendationService.ts`: validates CN-only current-patch deck statistics, applies the minimum-games threshold, and maintains version-and-mode isolated caches. The trusted feed is configured through `HEARTHSTONE_CN_LADDER_DECK_SOURCE_URL`; the current patch is detected from the local installation instead of a manual environment variable. Without a verified feed, recommendations remain unavailable. Global data must never be relabeled as Chinese-server data.
- `src/main/ladderDeckOverlayController.ts`: shows the left recommendation window only for Standard/Wild while Hearthstone is frontmost, rejects stale mode refreshes, and preserves a manual close until the mode changes.
- `src/main/logParsers.ts`: parses `Power.log` and `Player.log` into typed log events.
- `src/main/trackerBackend.ts`: reads discovered logs and builds a match state.
- `src/main/trackerService.ts`: Electron-facing watcher service that tails the chosen log file.
- `src/main/main.ts` and `src/main/preload.ts`: IPC boundary for renderer calls.
- `src/shared/deck.ts`: UI-facing deck parser used by the current tracker engine; it supports manual lists and deck strings when a card database is available.
- `src/shared/deckImport.ts`: parses manual deck lists and preserves Hearthstone deck strings as raw text.
- `src/shared/deckstring.ts`: wraps the existing `deckstrings` package and maps decoded dbfIds through the local card database.
- `src/shared/collectionDeckParser.ts`: parses `Decks.log` or similar local text into collection deck blocks while preserving unknown raw blocks with warnings.
- `src/shared/arenaLogParser.ts`: parses Arena draft mode, hero, selected cards, and completed draft records from `Arena.log`.
- `src/shared/arenaChoiceParser.ts`: parses candidate and chosen entities from `Power.log` choice blocks.
- `src/shared/arenaDraftEngine.ts`: merges Arena and Power events, scores candidates, aggregates the selected cards, and exposes the current Arena state.
- `src/shared/cardDatabase.ts`: typed local dbfId/cardId-to-card-info dictionary helpers, including image URLs, mana/attack/health, cleaned card text, card type and related-card links; no network access is performed.
- `src/shared/powerLogParser.ts`: UI-facing Power.log line parser used by the current tracker engine.
- `src/shared/trackerEngine.ts`: UI-facing in-memory tracker engine.
- `src/shared/matchState.ts`: applies parsed events to the match state.
- `src/shared/types.ts`: shared contracts for renderer/main/tests.

## Log discovery

Candidate roots are checked in this order:

1. Caller-provided `extraCandidates`
2. `HEARTHSTONE_LOG_DIR`
3. `~/Library/Logs/Blizzard Entertainment/Hearthstone`
4. `/Applications/Hearthstone/Logs`
5. `~/Library/Logs/Hearthstone`
6. `~/Library/Logs/Blizzard/Hearthstone`
7. `~/Library/Application Support/Blizzard/Hearthstone/Logs`

A session is any readable directory containing `Power.log`, `Player.log`, `Decks.log`, `Arena.log`, or `LoadingScreen.log`. If multiple sessions exist, the newest modified one is selected. A newer Hearthstone session without `Power.log` or `Player.log` still wins over an older card-tracking session, so the UI reports the missing `Power.log` instead of replaying stale deck counts. While tracking, `TrackerService` checks for a newer session every second and follows that session; a paused or disposed tracker ignores any delayed discovery result.

`TrackerService` requires `Power.log` for live card tracking. If a user-selected or auto-discovered path is `Player.log`, the service first switches to a sibling `Power.log` in the same directory. If no sibling `Power.log` exists, it reports an error telling the user to repair log config and restart Hearthstone, because `Player.log` alone cannot show card names. If the newest session only has `Decks.log`, `LoadingScreen.log`, or a non-drafting `Arena.log`, it clears any previous game state, reports missing `Power.log`, and keeps checking that session once per second. A later `Power.log` is adopted automatically without restarting the tracker. When a usable Arena session is active without `Power.log`, the service also watches sibling `Decks.log`; a later `Finding Game With Deck` entry immediately previews the constructed deck so a completed Arena deck does not remain on the overlay after queuing Standard or Wild.

When the newest session only has `Decks.log`, the service keeps the missing-`Power.log` guidance for live match tracking but still loads collection decks and starts constructed-screen recognition. This allows a cold launch directly into Standard or Wild deck selection to publish an overlay context before Arena has ever been opened.

Live log reads are framed on complete newline boundaries. A trailing partial UTF-8 line is kept until the next append, so `SHOW_ENTITY` details written across multiple filesystem notifications cannot drop mulligan replacements or other revealed cards.

Friendly hand totals are based on distinct friendly entities currently in the `HAND` zone. An entity whose card identity has not been resolved yet is retained as `未识别手牌` instead of being dropped, so restarting the tracker during a game restores the real hand size immediately; a later reveal replaces the placeholder without changing the total.

Collection deck import requires `Decks.log`. The service does not read memory, account servers, or game APIs. If `Decks.log` is missing, `CollectionDeckService.scanAndImportDecks()` returns `missing-log` with this user action: repair log config, restart Hearthstone, then open the in-game collection/deck page.

## Parsed events

`Power.log` currently emits:

- `game-started` from `CREATE_GAME`
- `zone-change` from `TAG_CHANGE`
- `card-played` from `BLOCK_START BlockType=PLAY`
- `entity-revealed` from `SHOW_ENTITY` and `FULL_ENTITY`

`Player.log` currently emits:

- `player-info` from player id/name lines
- local-player markers when a line identifies the local player id

## Deck import

Manual card lists are supported, including:

```text
2x Fireball
1x (2) Frostbolt
Fireball
```

Hearthstone export text with `###`, `# Class:`, `# Format:`, and commented card rows is also supported.

When a Hearthstone deck string is present, `TrackerService` loads the cached official card database or refreshes it from the Blizzard card browser, then passes it into `parseDeckText()`. HearthstoneJSON remains a fallback/enrichment source for card IDs and historical cards. If the database cannot be loaded, the raw code is still preserved and manual card rows remain usable.

When a valid `Power.log` is available, `TrackerService` also loads the same zhCN database before replaying log lines. `TrackerEngine` resolves card names by `cardId` first, so `UNKNOWN ENTITY` log lines and English entity names can still map to the localized card names from the deck string or card database.

## Collection deck import

`ensureLogConfig()` now enables the `[Decks]` log section with file printing. `inspectLogConfig()` reports whether Power, Zone, and Decks file logging are enabled.

`CollectionDeckService.scanAndImportDecks()` resolves the best local `Decks.log`, parses deck blocks, decodes each deck string into card rows using the local card database, writes the result to `collection-decks.json` under Electron `userData`, and returns the imported deck list through IPC channel `tracker:scan-import-collection-decks`. When Hearthstone appends `Finding Game With Deck`, the selected deck is returned separately and activated immediately after the game starts.

The collection parser supports the current macOS log format emitted after opening the in-game collection deck page:

```text
I 20:56:52.9687400 Deck Contents Received:
I 20:56:52.9687400 ### Deck Name
I 20:56:52.9687400 # Deck ID: 9222863564
I 20:56:52.9687400 AAE...
```

`Deck ID` is stored for de-duplication, but it is not passed into the normal deck importer as a card row. Repeated `Finished Editing Deck` blocks with the same ID replace the earlier copy.

Stored deck records include:

- deck name, class, format, and mode when present
- Hearthstone deck ID when present
- parsed card rows
- raw deck string when present
- full raw source block
- source path and update time
- parser warnings for unknown or partial formats

Unknown `Decks.log` formats are not discarded. The raw block is stored with a warning so future parser improvements can use the original evidence.

The main process syncs collection decks on app startup and starts tracking automatically. Automatic startup always uses the local card cache immediately, even when the cache is old; network version checks are reserved for an explicit card-library load so overlay recognition is not blocked by an update request. `TrackerEngine` gives the `Finding Game With Deck` result priority over heuristic matches. If that record is unavailable, it scores friendly draw/play observations against the decoded collection decks and waits for a confident match instead of requiring manual deck selection.

## Arena draft flow

When `Arena.log` exists beside `Power.log`, `TrackerService` reads both files from the same session. `Arena.log` is the source of final picks; `Power.log` supplies the live candidate cards and is also used as a fallback when the Arena log has not been enabled yet. If the current Hearthstone session only writes `Arena.log` while the player is drafting or has just completed the draft, the service still follows that newest Arena session so screen recognition, the choice overlay, and the completed arena deck can start instead of staying attached to an older `Power.log`. The parser keeps the current `OnChoicesAndContents` block around the latest `SetDraftMode`, so restart/reopen restores the Arena hero and drafted deck instead of resetting to zero.

Recent macOS clients can omit the three currently offered Arena cards from every log. While the draft is waiting for a choice and no logged candidates are available, the Electron main process captures the Hearthstone display after macOS screen-recording permission is granted, then passes a short-lived local image to the bundled `arena-ocr` helper. Apple Vision reads text locally, the service accepts only exactly three recognized names that exist in the local card database, and the temporary image is deleted immediately after recognition and never sent over the network. This Arena fallback does not infer a card when recognition is incomplete.

The same local recognizer is also used on Standard/Wild deck-select screens before a constructed game starts. It only activates a collection deck when the screen contains a constructed mode title and the selected deck name maps to exactly one stored deck after mode filtering. This keeps a completed Arena deck from staying on the overlay when the player returns to Standard or Wild deck selection.
Constructed deck-select recognition is allowed to run whenever the tracker is not inside an active game. A verified Standard/Wild screen deck immediately resets the Arena state and previews the constructed collection deck, so leaving Arena or switching between constructed decks on the deck-select screen does not require a fresh `Power.log` write before the overlay switches.

Some CN client matches stop writing `Power.log` before emitting `PLAYSTATE` or `FINAL_GAMEOVER`. While a constructed game is still marked active, the service therefore keeps checking for the constructed deck-select screen. Two consecutive confirmations end the stale match, clear all old match zones and events, and preview the selected collection deck. A single observation is ignored, and an active Arena match remains excluded from this fallback.

`AutomaticOverlayController` polls the tracker state and the macOS frontmost application every 350 ms. A confirmed Standard/Wild deck, any active constructed game, a confirmed constructed screen waiting for an exact deck, or any active Arena state creates and shows the existing tracker overlay with `showInactive()`. Leaving Hearthstone hides the window without destroying it, and returning restores it. Moving or resizing the overlay keeps it visible through brief focus changes. Manual close suppresses only the current deck/mode context; a real deck or Standard/Wild/Arena change clears that suppression. The main-window toggle restores an existing hidden overlay instead of closing it. Waiting for an exact constructed deck publishes `constructedScreenMode` and clears stale deck statistics and event rows instead of retaining the previous deck.

The main process separately watches the number of active opponent-secret slots. Every increase, including `0→1` and `1→2`, displays the existing opponent overlay with `showInactive()`; candidate updates, reveals, and removals do not reopen it. Automatic display never focuses the overlay or steals input from Hearthstone. A manual user toggle still opens and focuses the window normally.

The opponent window is retained when its close control is used. It stores the expanded bounds under Electron `userData`, folds to a `52×38` draggable entry, and restores the saved bounds on the next manual toggle. Secret updates may show the folded entry inactive but never expand it automatically. The main process is the single source of truth for folded state: only the opponent window may call the set-state IPC, every fold/restore publishes `tracker:opponent-overlay-collapsed:update`, and the main-window toggle uses the same controller so the renderer cannot get out of sync.

The board-attack window covers the selected Hearthstone display with a frameless transparent BrowserWindow. It is non-focusable, always on top, and uses `setIgnoreMouseEvents`, so game input passes through. A 250 ms visibility monitor shows it with `showInactive()` only while an actual game is active and Hearthstone is the frontmost macOS app; otherwise it is hidden. `QA_OPEN_BOARD_ATTACK_OVERLAY=1` opens this full-display layer with deterministic demo values, and can be combined with `QA_SCREENSHOT_PATH` / `QA_INSPECT_PATH` plus `QA_EXIT_AFTER_SCREENSHOT=1` for automated rendering acceptance.

Board attack is the total attack shown by heroes and minions in `PLAY`. Weapons are excluded because their attack is already reflected on the hero; locations and other non-combat entities are also excluded. Card type comes from live `CARDTYPE` tags when available, with the local card database as a fallback.

An active `Arena.log` draft is authoritative: constructed OCR is paused for the whole drafting state, so a delayed frame from the previous Standard/Wild screen cannot reset Arena progress. If constructed OCR later fails or screen-recording permission is removed, the service clears only a non-game constructed preview, keeps the last confirmed constructed mode as a waiting context, and publishes the recognition error instead of showing stale cards. The automatic overlay controller re-reads tracker state after every asynchronous foreground/window operation so an older refresh cannot reopen a newly closed context.

The main overlay bounds are stored as `overlay-window-bounds.json` under Electron `userData`. Saved bounds are validated against current display work areas before window creation; invalid data falls back to `300x500`, undersized widths are repaired to `300px`, and off-screen coordinates are clamped back into a visible display.

The main process captures the largest available Hearthstone window and falls back to the relevant display when needed, then applies the same strict local-database validation. Screen capture belongs to the signed main application, while `arena-ocr` only performs local text recognition and never requests permission itself. A denied permission opens System Settings at most once per run; transient capture failures only retry and do not produce a false permission prompt.

The bundled `frontmost-app` helper uses `NSWorkspace` to read the current frontmost macOS application. Arena OCR and the three-choice overlay only run when that helper reports `Hearthstone`; switching to ChatGPT or any other app hides the overlay and pauses visual recognition. This avoids Apple Events/System Events automation prompts.

Some Arena sessions write the saved draft contents (`DraftManager.OnChoicesAndContents` and `Draft deck contains card`) before the following mode marker. That marker can be `DRAFTING` during an active draft, `ACTIVE_DRAFT_DECK` after completion, or `REDRAFTING` while five replacement cards are being selected. The draft engine restores the retained cards, keeps the remaining slots visible, and re-enables local screen recognition and the three-card quality overlay during `REDRAFTING`. Two consecutive frames showing an exact constructed mode and selected deck are required before leaving this Arena state, preventing one stale frame from clearing a real draft while still allowing Standard/Wild to take over promptly.

The local card database resolves card IDs to Chinese names. The Arena rating cache stores the Arena Tracker HearthArena JSON table, HearthArena official zh-cn/zh-tw tierlist pages, and Firestone global Arena/Underground statistics under Electron `userData`; a fresh cache is used without a network request, and a stale or legacy cache checks upstream versions before downloading changed sources. HearthArena official pages are parsed as score sources only, using the card ID in `data-card-image` and the adjacent score cell, then preferred over the GitHub JSON table when available. They are never treated as winrate data. Firestone's `decksWithCardThenWin / decksWithCard` is stored as included winrate, while `playedThenWin / played` is stored as played winrate. Firestone draft stats are cached by win bucket: `0` is overall pick rate, `6` is the preferred high-win bucket, and the raw buckets are preserved. If Firestone later publishes a real `12` bucket, it is stored as `twelveWinRate`; current public Underground data exposes `0/4/6/8`, so no 12-win value is synthesized. Each HearthArena score is mapped to a readable quality tier (`顶级`, `优秀`, `良好`, `一般`, `偏弱`, `不推荐`) for the renderer. If a source does not publish a pick rate but has a real Firestone win rate, the overlay labels it `胜率`; ordinary Firestone winrates are never relabeled as 12-win rates. A completed draft is aggregated into a 30-card deck and loaded into `TrackerEngine` as `竞技场牌库`, so the normal draw/play tracker continues automatically after the draft.

Constructed-deck tracking is gated by `CREATE_GAME`. The selected collection preview is carried into the live game instead of being cleared by the first `CREATE_GAME`; duplicate `CREATE_GAME` blocks are treated as the same start. The preferred local-player source is `Player.log`; on current macOS sessions where that file is separate from `Power.log`, the service instead reads the real player name in the current `Power.log` game header and does not treat `UNKNOWN HUMAN PLAYER` as local. Player slots can swap between games, so a current-game identity always takes precedence; only clients that announce identities before `CREATE_GAME` use the immediately preceding header as a fallback. Friendly draw/play observations are scored against every stored collection deck; the engine waits for a confident match before activating a deck, so collection browsing and opponent draws cannot select a deck.

Before activating a heuristic deck match, the service counts the local deck entities in the current Power.log setup snapshot. A guessed collection deck with a different base total is rejected as stale or incompatible. A deck explicitly written by Hearthstone as `Finding Game With Deck` is trusted for identity even when the local deck code decodes fewer cards than the live 30-card snapshot; the missing portion is shown as `日志缺失的收藏牌`. Some modes add cards into the deck during setup; those entities carry a `DISPLAYED_CREATOR` marker, so they are excluded from guessed-deck comparison but retained in the live total and remaining counts as `对局生成的未知牌`. When there is no explicit or matching base deck, it preserves the real counts under `等待精确识别` rather than presenting a false named deck.

If `Player.log` reports `SERVER_GAME_STARTED` while `Power.log` is stalled, the service enters an active waiting state and publishes an explicit recovery message. This keeps the overlay visible without inventing deck or card data; live tracking resumes only when `Power.log` writes again.

When switching from a constructed screen into Arena, a confirmed Arena draft or active Arena deck replaces the constructed preview. A collection deck found during startup cannot overwrite an active Arena state; a later explicit `Finding Game With Deck` event can still switch back to constructed mode.

## Deck string decoding

`parseDeckStringToCards(deckCode, cardDb)` delegates Hearthstone deck string decoding to the existing `deckstrings` package, then maps card dbfIds through the supplied local card database.

Supported card groups:

- one-copy cards
- two-copy cards
- multi-copy cards with explicit counts

The decoder itself does not fetch card data. Missing dbfIds are returned as `Unknown card <dbfId>` with warnings so callers can keep the deck import flow usable while surfacing incomplete local data.

## Match state

The state model tracks:

- friendly deck remaining
- friendly drawn cards
- opponent played cards
- parsed players
- event stream

Draw detection currently uses a `ZONE` change from `DECK` to `HAND` for the friendly player. Opponent played cards currently use `ZONE` changes to `PLAY`, with card names resolved by `cardId` when possible.

## Current risks

- Hearthstone log formats vary across game versions and languages; parser coverage should grow with real logs.
- Deck string decoding depends on the cached/downloaded HearthstoneJSON card database matching current card dbfIds.
- Friendly player detection prefers `Player.log` local-player markers, then the named local player in the complete `Power.log` header. If neither source is present, matching waits rather than guessing a controller.
