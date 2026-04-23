// ============================================================
// Snake / Tron – Google Sheets Edition
// ============================================================
// PLAYER SHEET SETUP:
//   • Sheet name  = player name
//   • Tab color   = snake color
//   • A2:A102     = movement sequence: UP / DOWN / LEFT / RIGHT
//   • B2          = TRUE to enable auto-pathfinding (leave blank for manual)
//
// Run simulateGame() to start.
// ============================================================

var GRID_ROWS        = 20;
var GRID_COLS        = 20;
var GRID_RANGE       = 'A1:T20';
var PELLET_COUNT     = 5;
var MAX_FRAMES       = 300;
var FRAME_DELAY_MS   = 800;
var INIT_SNAKE_LEN   = 1;

var COLOR_DEAD       = '#888888';
var COLOR_PELLET     = '#FFD700';
var COLOR_EMPTY      = null;
var PELLET_SYMBOL    = '●';

// ── Coordinate helpers ──────────────────────────────────────
// All internal positions are {r, c} with 1-based indices.

function pos(r, c) { return { r: r, c: c }; }

function inBounds(p) {
  return p.r >= 1 && p.r <= GRID_ROWS && p.c >= 1 && p.c <= GRID_COLS;
}

function posKey(p) { return p.r + ',' + p.c; }

function applyDir(p, dir) {
  switch (dir) {
    case 'UP':    return pos(p.r - 1, p.c);
    case 'DOWN':  return pos(p.r + 1, p.c);
    case 'LEFT':  return pos(p.r, p.c - 1);
    case 'RIGHT': return pos(p.r, p.c + 1);
  }
  return p;
}

var OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
var ALL_DIRS  = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

// ── Board map ───────────────────────────────────────────────
// board[r][c] is one of: null (empty), 'pellet', 'dead', or snakeIndex (number)

function makeBoard() {
  var b = [];
  for (var r = 0; r <= GRID_ROWS; r++) {
    b.push(new Array(GRID_COLS + 1).fill(null));
  }
  return b;
}

// ── BFS pathfinding ─────────────────────────────────────────

function bfsNextDir(head, board, pellets) {
  // Build pellet lookup
  var pelletSet = {};
  for (var i = 0; i < pellets.length; i++) {
    pelletSet[posKey(pellets[i])] = true;
  }

  var queue    = [{ p: head, first: null }];
  var visited  = {};
  visited[posKey(head)] = true;

  while (queue.length) {
    var cur = queue.shift();
    for (var d = 0; d < ALL_DIRS.length; d++) {
      var dir  = ALL_DIRS[d];
      var next = applyDir(cur.p, dir);
      if (!inBounds(next)) continue;
      var key = posKey(next);
      if (visited[key]) continue;
      var cell = board[next.r][next.c];
      if (cell !== null && cell !== 'pellet') continue; // obstacle

      var first = cur.first || dir;
      if (pelletSet[key]) return first; // found a pellet

      visited[key] = true;
      queue.push({ p: next, first: first });
    }
  }

  // No path to any pellet — move to any safe adjacent cell
  for (var d = 0; d < ALL_DIRS.length; d++) {
    var next = applyDir(head, ALL_DIRS[d]);
    if (!inBounds(next)) continue;
    var cell = board[next.r][next.c];
    if (cell === null || cell === 'pellet') return ALL_DIRS[d];
  }

  return null; // cornered — will die
}

// ── Pellet helpers ──────────────────────────────────────────

function respawnPellet(board) {
  // Collect all free cells then pick randomly (avoids hot-loop on dense boards)
  var free = [];
  for (var r = 1; r <= GRID_ROWS; r++) {
    for (var c = 1; c <= GRID_COLS; c++) {
      if (board[r][c] === null) free.push(pos(r, c));
    }
  }
  if (!free.length) return null;
  return free[Math.floor(Math.random() * free.length)];
}

// ── Grid setup ──────────────────────────────────────────────

function setupGrid(mainSheet) {
  for (var c = 1; c <= GRID_COLS; c++) mainSheet.setColumnWidth(c, 36);
  for (var r = 1; r <= GRID_ROWS; r++) mainSheet.setRowHeight(r, 22);
  var rng = mainSheet.getRange(GRID_RANGE);
  rng.clear();
  rng.setBackground(null);
  rng.setBorder(true, true, true, true, null, null);
  rng.setFontSize(8);
  rng.setHorizontalAlignment('center');
  rng.setVerticalAlignment('middle');
  // Clear any previous status line
  mainSheet.getRange(GRID_ROWS + 2, 1, 1, GRID_COLS).clearContent();
}

// ── Rendering ───────────────────────────────────────────────

function renderFrame(mainSheet, snakes, pellets, board, statusMsg) {
  var vals    = [];
  var bgs     = [];
  var weights = [];

  for (var r = 1; r <= GRID_ROWS; r++) {
    var vRow = [], bRow = [], wRow = [];
    for (var c = 1; c <= GRID_COLS; c++) {
      var cell = board[r][c];
      if (cell === null) {
        vRow.push(''); bRow.push(COLOR_EMPTY); wRow.push('normal');
      } else if (cell === 'pellet') {
        vRow.push(PELLET_SYMBOL); bRow.push(COLOR_PELLET); wRow.push('normal');
      } else if (cell === 'dead') {
        vRow.push(''); bRow.push(COLOR_DEAD); wRow.push('normal');
      } else {
        // Living snake segment — cell value is snakeIndex
        var s = snakes[cell];
        var isHead = (r === s.body[0].r && c === s.body[0].c);
        vRow.push(isHead ? s.name : '');
        bRow.push(s.color);
        wRow.push(isHead ? 'bold' : 'normal');
      }
    }
    vals.push(vRow); bgs.push(bRow); weights.push(wRow);
  }

  var rng = mainSheet.getRange(GRID_RANGE);
  rng.setValues(vals);
  rng.setBackgrounds(bgs);
  rng.setFontWeights(weights);

  if (statusMsg) {
    mainSheet.getRange(GRID_ROWS + 2, 1)
      .setValue(statusMsg)
      .setFontSize(14)
      .setFontWeight('bold');
  }
}

// ── Game initialisation ─────────────────────────────────────

function initGameState(ss, mainSheet) {
  var board   = makeBoard();
  var snakes  = [];
  var pellets = [];

  // Load player sheets
  var playerSheets = ss.getSheets().filter(function(s) { return s.getName() !== 'Main'; });

  playerSheets.forEach(function(sheet, idx) {
    var actions  = sheet.getRange('A2:A102').getValues().flat()
                       .filter(function(a) { return a !== ''; });
    var autoVal  = sheet.getRange('B2').getValue();
    var autoMove = (String(autoVal).toUpperCase() === 'TRUE');

    // Find non-overlapping start position
    var start = respawnPellet(board); // reuses free-cell logic
    if (!start) start = pos(1, idx + 1); // fallback

    // Place initial body (length INIT_SNAKE_LEN, grows downward from start)
    var body = [];
    for (var i = 0; i < INIT_SNAKE_LEN; i++) {
      var seg = pos(Math.min(start.r + i, GRID_ROWS), start.c);
      body.push(seg);
      board[seg.r][seg.c] = idx;
    }

    snakes.push({
      name:     sheet.getName(),
      color:    sheet.getTabColor() || '#4285F4',
      body:     body,
      alive:    true,
      autoMove: autoMove,
      actions:  actions,
      lastDir:  null  // tracks last direction to prevent reversal
    });
  });

  // Spawn pellets
  for (var i = 0; i < PELLET_COUNT; i++) {
    var p = respawnPellet(board);
    if (p) { pellets.push(p); board[p.r][p.c] = 'pellet'; }
  }

  return { board: board, snakes: snakes, pellets: pellets };
}

// ── Game tick ───────────────────────────────────────────────

function tick(frame, snakes, pellets, board) {
  var alive = snakes.filter(function(s) { return s.alive; });

  // 1. Compute desired direction per snake
  var dirs = alive.map(function(s) {
    var dir;
    if (s.autoMove) {
      dir = bfsNextDir(s.body[0], board, pellets);
    } else {
      dir = s.actions.length ? s.actions[frame % s.actions.length] : null;
    }
    // Prevent reversal into own neck
    if (dir && s.lastDir && dir === OPPOSITE[s.lastDir]) {
      dir = s.lastDir; // keep going the same way instead of reversing
    }
    return dir;
  });

  // 2. Compute new head positions
  var newHeads = alive.map(function(s, i) {
    var dir = dirs[i];
    if (!dir) return null;
    var nh = applyDir(s.body[0], dir);
    return inBounds(nh) ? nh : null; // null = out of bounds = death
  });

  // 3. Detect collisions (before any movement)
  var dying = alive.map(function(s, i) {
    var nh = newHeads[i];
    if (!nh) return true; // out of bounds or no action
    var cell = board[nh.r][nh.c];
    // Hits an obstacle: another snake body, dead trail, or its own body
    // (pellets are safe — that's the goal)
    if (cell !== null && cell !== 'pellet') return true;
    return false;
  });

  // Detect head-on and swap collisions between pairs
  for (var i = 0; i < alive.length; i++) {
    for (var j = i + 1; j < alive.length; j++) {
      var hi = newHeads[i], hj = newHeads[j];
      if (!hi || !hj) continue;
      // Head-on: both move to same cell
      if (hi.r === hj.r && hi.c === hj.c) {
        dying[i] = dying[j] = true;
      }
      // Swap: snake i moves to snake j's current head and vice versa
      var iHead = alive[i].body[0], jHead = alive[j].body[0];
      if (hi.r === jHead.r && hi.c === jHead.c &&
          hj.r === iHead.r && hj.c === iHead.c) {
        dying[i] = dying[j] = true;
      }
    }
  }

  // 4. Kill dying snakes — convert body to dead trail
  alive.forEach(function(s, i) {
    if (!dying[i]) return;
    s.alive = false;
    s.body.forEach(function(seg) { board[seg.r][seg.c] = 'dead'; });
  });

  // 5. Move surviving snakes
  alive.forEach(function(s, i) {
    if (dying[i]) return;
    var nh  = newHeads[i];
    var dir = dirs[i];
    var idx = snakes.indexOf(s);

    // Check pellet before moving (head about to enter pellet cell)
    var pelletIdx = -1;
    for (var p = 0; p < pellets.length; p++) {
      if (pellets[p].r === nh.r && pellets[p].c === nh.c) { pelletIdx = p; break; }
    }

    // Vacate tail cell (unless growing from pellet)
    if (pelletIdx === -1) {
      var tail = s.body[s.body.length - 1];
      board[tail.r][tail.c] = null;
      s.body.pop();
    } else {
      // Eat pellet, grow, respawn a new pellet
      pellets.splice(pelletIdx, 1);
      var newPellet = respawnPellet(board);
      if (newPellet) { pellets.push(newPellet); board[newPellet.r][newPellet.c] = 'pellet'; }
    }

    // Place new head
    s.body.unshift(nh);
    board[nh.r][nh.c] = idx;
    s.lastDir = dir;
  });
}

// ── Entry point ─────────────────────────────────────────────

function simulateGame() {
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var mainSheet = ss.getSheetByName('Main');

  setupGrid(mainSheet);
  var state  = initGameState(ss, mainSheet);
  var snakes = state.snakes;
  var pellets = state.pellets;
  var board  = state.board;
  var frame  = 0;

  renderFrame(mainSheet, snakes, pellets, board);
  Utilities.sleep(FRAME_DELAY_MS);

  while (snakes.filter(function(s) { return s.alive; }).length > 1 && frame < MAX_FRAMES) {
    tick(frame, snakes, pellets, board);
    renderFrame(mainSheet, snakes, pellets, board);
    frame++;
    Utilities.sleep(FRAME_DELAY_MS);
  }

  var survivors = snakes.filter(function(s) { return s.alive; });
  var msg;
  if (survivors.length === 1) {
    msg = '🏆 ' + survivors[0].name + ' wins! (length: ' + survivors[0].body.length + ')';
  } else if (survivors.length === 0) {
    msg = '💀 Draw — all snakes eliminated!';
  } else {
    msg = '⏱ Time limit! Survivors: ' + survivors.map(function(s) { return s.name; }).join(', ');
  }
  renderFrame(mainSheet, snakes, pellets, board, msg);
}
