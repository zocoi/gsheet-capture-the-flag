# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Google Sheets-based Snake/Tron hybrid game built with Google Apps Script (GAS). Multiple players compete on a 20×20 grid — grow by eating pellets, eliminate others by forcing them into trails or walls. Last snake standing wins.

## Development

No local build system, package manager, or test runner. Code runs exclusively inside Google Sheets.

**To deploy changes:**
1. Open the linked Google Sheet
2. Extensions → Apps Script → paste/edit `Game.gs`
3. Save and run `simulateGame()`

## Sheet Structure (required)

- **`Main` sheet** — the 20×20 visual game board (columns A–T, rows 1–20). Row 22 is used for the win/status message.
- **One sheet per player** (any name except `Main`):
  - **Tab color** → snake color on the board
  - **`A2:A102`** → movement sequence (`UP` / `DOWN` / `LEFT` / `RIGHT`, one per row)
  - **`B2`** → `TRUE` to enable auto-pathfinding; blank or `FALSE` for manual control

## Architecture

All game state lives as local variables inside `simulateGame()` — no module-level mutable state.

**Core data structures:**
- `board[r][c]` — 2D occupancy map (1-indexed). Values: `null` (empty), `'pellet'`, `'dead'` (Tron trail), or a snake index (`number`).
- `snakes[]` — array of `{name, color, body: [{r,c},...], alive, autoMove, actions, lastDir}`. `body[0]` is the head.
- `pellets[]` — array of `{r, c}` positions.

**Game loop (`simulateGame`):**
1. `setupGrid()` — size cells, draw border, clear formatting
2. `initGameState()` — load player sheets (reads actions + auto flag once), place snakes at non-overlapping random positions, spawn pellets
3. Loop until one snake remains or `MAX_FRAMES` (300):
   - `tick()` → compute new heads, detect collisions, move snakes, eat pellets
   - `renderFrame()` → batch-write `setValues` / `setBackgrounds` / `setFontWeights` on the full 20×20 range
   - `Utilities.sleep(FRAME_DELAY_MS)`

**`tick()` collision order (important):**
1. Compute all new head positions first (no movement yet)
2. Check each head against the current board state
3. Detect head-on (two snakes moving to the same cell) and swap collisions (snakes crossing)
4. Kill losing snakes — body converts to `'dead'` trail on board
5. Move survivors: vacate tail → place new head; eat pellet if applicable → grow + respawn pellet

**Direction locking:** reversing into your own neck (`UP`↔`DOWN`, `LEFT`↔`RIGHT`) is prevented — the snake continues its last direction instead.

**`bfsNextDir()`:** BFS from the snake's head toward the nearest pellet, treating all non-null, non-pellet board cells as obstacles. Falls back to any safe adjacent cell if no pellet is reachable. Returns `null` if cornered (snake will die next frame).

**`renderFrame()`:** builds three 20×20 arrays (values, backgrounds, fontWeights) in a single pass over the board, then makes 3 batch API calls. Head cells show the player name in bold; body cells are empty with the snake's color.

## Key Constants

| Constant | Default | Purpose |
|---|---|---|
| `PELLET_COUNT` | 5 | Pellets on board at once |
| `MAX_FRAMES` | 300 | Frame cap before time-limit draw |
| `FRAME_DELAY_MS` | 800 | ms between frames |
| `INIT_SNAKE_LEN` | 1 | Starting body length |
| `COLOR_DEAD` | `#888888` | Dead trail color |

## GAS Constraints

- Script execution times out after 6 minutes. At 800ms/frame × 300 frames ≈ 4 min minimum — stay within this budget.
- Each `SpreadsheetApp` API call is slow (~100ms). Minimize calls per frame; the batch render design is intentional.
- Player action data is read **once** at game start, not per frame.
