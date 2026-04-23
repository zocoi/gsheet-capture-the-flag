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

var GRID_ROWS      = 20;
var GRID_COLS      = 20;
var GRID_RANGE     = 'A1:T20';
var PELLET_COUNT   = 5;
var MAX_FRAMES     = 300;
var FRAME_DELAY_MS = 500;
var INIT_SNAKE_LEN = 1;

// ── Colors & symbols ────────────────────────────────────────
var BG_EMPTY     = '#FFFFFF';  // white arena
var BG_DEAD      = '#9E9E9E';  // medium gray — clearly visible dead trail
var BG_PELLET    = '#FFF176';  // bright yellow pellet
var BG_SCORE     = '#F6F8FA';  // light scoreboard panel
var PELLET_SYMBOL = '★';
var DIR_ARROW    = { UP: '▲', DOWN: '▼', LEFT: '◄', RIGHT: '►' };

// ── Scoreboard layout ────────────────────────────────────────
var SCORE_COL    = GRID_COLS + 2;  // column V (22), skip U as gap

// ── Coordinate helpers ───────────────────────────────────────
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

// ── Color helpers ────────────────────────────────────────────

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(function(v) {
    return Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2,'0');
  }).join('');
}

function lightenColor(hex, t) {  // t: 0–1, blend toward white
  if (!hex || hex[0] !== '#' || hex.length !== 7) return hex;
  var c = hexToRgb(hex);
  return rgbToHex(c[0]+(255-c[0])*t, c[1]+(255-c[1])*t, c[2]+(255-c[2])*t);
}

function darkenColor(hex, t) {  // t: 0–1, blend toward black
  if (!hex || hex[0] !== '#' || hex.length !== 7) return hex;
  var c = hexToRgb(hex);
  return rgbToHex(c[0]*(1-t), c[1]*(1-t), c[2]*(1-t));
}

// ── Board map ────────────────────────────────────────────────
// board[r][c]: null | 'pellet' | 'dead' | snakeIndex (number)

function makeBoard() {
  var b = [];
  for (var r = 0; r <= GRID_ROWS; r++) {
    b.push(new Array(GRID_COLS + 1).fill(null));
  }
  return b;
}

// ── BFS pathfinding ──────────────────────────────────────────

function bfsNextDir(head, board, pellets) {
  var pelletSet = {};
  for (var i = 0; i < pellets.length; i++) pelletSet[posKey(pellets[i])] = true;

  var queue   = [{ p: head, first: null }];
  var visited = {};
  visited[posKey(head)] = true;

  while (queue.length) {
    var cur = queue.shift();
    for (var d = 0; d < ALL_DIRS.length; d++) {
      var dir  = ALL_DIRS[d];
      var next = applyDir(cur.p, dir);
      if (!inBounds(next)) continue;
      var key  = posKey(next);
      if (visited[key]) continue;
      var cell = board[next.r][next.c];
      if (cell !== null && cell !== 'pellet') continue;

      var first = cur.first || dir;
      if (pelletSet[key]) return first;

      visited[key] = true;
      queue.push({ p: next, first: first });
    }
  }

  // No path to pellet — pick any safe direction
  for (var d = 0; d < ALL_DIRS.length; d++) {
    var next = applyDir(head, ALL_DIRS[d]);
    if (!inBounds(next)) continue;
    var cell = board[next.r][next.c];
    if (cell === null || cell === 'pellet') return ALL_DIRS[d];
  }
  return null;
}

// ── Pellet helpers ───────────────────────────────────────────

function respawnPellet(board) {
  var free = [];
  for (var r = 1; r <= GRID_ROWS; r++)
    for (var c = 1; c <= GRID_COLS; c++)
      if (board[r][c] === null) free.push(pos(r, c));
  if (!free.length) return null;
  return free[Math.floor(Math.random() * free.length)];
}

// ── Grid setup ───────────────────────────────────────────────

function setupGrid(mainSheet) {
  // Game grid — square cells (30×30 px)
  for (var c = 1; c <= GRID_COLS; c++) mainSheet.setColumnWidth(c, 30);
  for (var r = 1; r <= GRID_ROWS; r++) mainSheet.setRowHeight(r, 30);

  var grid = mainSheet.getRange(GRID_RANGE);
  grid.clear();
  grid.setBackground(BG_EMPTY);
  grid.setFontSize(9);
  grid.setHorizontalAlignment('center');
  grid.setVerticalAlignment('middle');
  grid.setFontColor('#9E9E9E');

  // Light inner grid lines, dark outer border
  grid.setBorder(null, null, null, null, true, true, '#E0E0E0', SpreadsheetApp.BorderStyle.SOLID);
  grid.setBorder(true, true, true, true, null, null, '#424242', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // Spacer column U
  mainSheet.setColumnWidth(GRID_COLS + 1, 10);

  // Scoreboard columns V (swatch), W (name), X (length)
  mainSheet.setColumnWidth(SCORE_COL,     14);
  mainSheet.setColumnWidth(SCORE_COL + 1, 96);
  mainSheet.setColumnWidth(SCORE_COL + 2, 36);

  // Scoreboard area base style
  mainSheet.getRange(1, SCORE_COL, GRID_ROWS, 3)
    .setBackground(BG_SCORE)
    .setFontColor('#757575')
    .setFontSize(9)
    .setVerticalAlignment('middle')
    .setBorder(null, true, null, true, false, false, '#E0E0E0', SpreadsheetApp.BorderStyle.SOLID);

  // Clear status row
  mainSheet.getRange(GRID_ROWS + 2, 1, 1, GRID_COLS)
    .clearContent()
    .setBackground(null);
}

// ── Grid renderer ────────────────────────────────────────────

function renderFrame(mainSheet, snakes, board, statusMsg) {
  var vals = [], bgs = [], weights = [], fontColors = [];

  for (var r = 1; r <= GRID_ROWS; r++) {
    var vRow = [], bRow = [], wRow = [], fRow = [];
    for (var c = 1; c <= GRID_COLS; c++) {
      var cell = board[r][c];

      if (cell === null) {
        vRow.push('');            bRow.push(BG_EMPTY);  wRow.push('normal'); fRow.push('#E0E0E0');

      } else if (cell === 'pellet') {
        vRow.push(PELLET_SYMBOL); bRow.push(BG_PELLET); wRow.push('bold');   fRow.push('#F57F17');

      } else if (cell === 'dead') {
        vRow.push('');            bRow.push(BG_DEAD);   wRow.push('normal'); fRow.push(BG_DEAD);

      } else {
        var s      = snakes[cell];
        var isHead = (r === s.body[0].r && c === s.body[0].c);
        if (isHead) {
          vRow.push(s.lastDir ? DIR_ARROW[s.lastDir] : '◉');
          bRow.push(darkenColor(s.color, 0.15));
          wRow.push('bold');
          fRow.push('#FFFFFF');
        } else {
          vRow.push('');
          bRow.push(lightenColor(s.color, 0.45));  // lighter body, still visible on white
          wRow.push('normal');
          fRow.push('#FFFFFF');
        }
      }
    }
    vals.push(vRow); bgs.push(bRow); weights.push(wRow); fontColors.push(fRow);
  }

  var rng = mainSheet.getRange(GRID_RANGE);
  rng.setValues(vals);
  rng.setBackgrounds(bgs);
  rng.setFontWeights(weights);
  rng.setFontColors(fontColors);

  if (statusMsg) {
    mainSheet.getRange(GRID_ROWS + 2, 1, 1, GRID_COLS)
      .merge()
      .setValue(statusMsg)
      .setBackground('#F6F8FA')
      .setFontColor('#24292E')
      .setFontSize(13)
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
  }
}

// ── Scoreboard renderer ──────────────────────────────────────

function renderScoreboard(mainSheet, snakes, frame) {
  var vals = [], bgs = [], fontColors = [], weights = [];

  // Title
  vals.push(['', '🐍 SNAKE TRON', '']);
  bgs.push([BG_SCORE, BG_SCORE, BG_SCORE]);
  fontColors.push([BG_SCORE, '#1565C0', BG_SCORE]);
  weights.push(['normal', 'bold', 'normal']);

  // Frame counter
  vals.push(['', 'Frame ' + frame + ' / ' + MAX_FRAMES, '']);
  bgs.push([BG_SCORE, BG_SCORE, BG_SCORE]);
  fontColors.push([BG_SCORE, '#757575', BG_SCORE]);
  weights.push(['normal', 'normal', 'normal']);

  // Spacer
  vals.push(['', '', '']); bgs.push([BG_SCORE, BG_SCORE, BG_SCORE]);
  fontColors.push([BG_SCORE, BG_SCORE, BG_SCORE]); weights.push(['normal', 'normal', 'normal']);

  // Alive header
  vals.push(['', 'PLAYER', 'LEN']);
  bgs.push([BG_SCORE, BG_SCORE, BG_SCORE]);
  fontColors.push([BG_SCORE, '#9E9E9E', '#9E9E9E']);
  weights.push(['normal', 'normal', 'normal']);

  // Player rows
  snakes.forEach(function(s) {
    var alive     = s.alive;
    var swatch    = alive ? s.color : '#BDBDBD';
    var nameColor = alive ? '#212121' : '#9E9E9E';
    var lenColor  = alive ? '#1565C0' : '#9E9E9E';
    var label     = alive ? s.name : '✕ ' + s.name;
    var length    = alive ? s.body.length : '';
    vals.push(['', label, length]);
    bgs.push([swatch, BG_SCORE, BG_SCORE]);
    fontColors.push([swatch, nameColor, lenColor]);
    weights.push(['normal', alive ? 'bold' : 'normal', 'normal']);
  });

  // Pad to GRID_ROWS
  while (vals.length < GRID_ROWS) {
    vals.push(['', '', '']); bgs.push([BG_SCORE, BG_SCORE, BG_SCORE]);
    fontColors.push([BG_SCORE, BG_SCORE, BG_SCORE]); weights.push(['normal', 'normal', 'normal']);
  }

  var rng = mainSheet.getRange(1, SCORE_COL, GRID_ROWS, 3);
  rng.setValues(vals);
  rng.setBackgrounds(bgs);
  rng.setFontColors(fontColors);
  rng.setFontWeights(weights);
}

// ── Game initialisation ──────────────────────────────────────

function initGameState(ss, mainSheet) {
  var board   = makeBoard();
  var snakes  = [];
  var pellets = [];

  var playerSheets = ss.getSheets().filter(function(s) { return s.getName() !== 'Main'; });

  playerSheets.forEach(function(sheet, idx) {
    var actions  = sheet.getRange('A2:A102').getValues().flat()
                       .filter(function(a) { return a !== ''; });
    var autoVal  = sheet.getRange('B2').getValue();
    var autoMove = (String(autoVal).toUpperCase() === 'TRUE');

    var start = respawnPellet(board);
    if (!start) start = pos(1, idx + 1);

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
      lastDir:  null
    });
  });

  for (var i = 0; i < PELLET_COUNT; i++) {
    var p = respawnPellet(board);
    if (p) { pellets.push(p); board[p.r][p.c] = 'pellet'; }
  }

  return { board: board, snakes: snakes, pellets: pellets };
}

// ── Game tick ────────────────────────────────────────────────

function tick(frame, snakes, pellets, board) {
  var alive = snakes.filter(function(s) { return s.alive; });

  var dirs = alive.map(function(s) {
    var dir = s.autoMove
      ? bfsNextDir(s.body[0], board, pellets)
      : (s.actions.length ? s.actions[frame % s.actions.length] : null);
    if (dir && s.lastDir && dir === OPPOSITE[s.lastDir]) dir = s.lastDir;
    return dir;
  });

  var newHeads = alive.map(function(s, i) {
    var dir = dirs[i];
    if (!dir) return null;
    var nh = applyDir(s.body[0], dir);
    return inBounds(nh) ? nh : null;
  });

  var dying = alive.map(function(s, i) {
    var nh = newHeads[i];
    if (!nh) return true;
    var cell = board[nh.r][nh.c];
    return cell !== null && cell !== 'pellet';
  });

  for (var i = 0; i < alive.length; i++) {
    for (var j = i + 1; j < alive.length; j++) {
      var hi = newHeads[i], hj = newHeads[j];
      if (!hi || !hj) continue;
      if (hi.r === hj.r && hi.c === hj.c) { dying[i] = dying[j] = true; }
      var iHead = alive[i].body[0], jHead = alive[j].body[0];
      if (hi.r === jHead.r && hi.c === jHead.c &&
          hj.r === iHead.r && hj.c === iHead.c) { dying[i] = dying[j] = true; }
    }
  }

  alive.forEach(function(s, i) {
    if (!dying[i]) return;
    s.alive = false;
    s.body.forEach(function(seg) { board[seg.r][seg.c] = 'dead'; });
  });

  alive.forEach(function(s, i) {
    if (dying[i]) return;
    var nh  = newHeads[i];
    var dir = dirs[i];
    var idx = snakes.indexOf(s);

    var pelletIdx = -1;
    for (var p = 0; p < pellets.length; p++) {
      if (pellets[p].r === nh.r && pellets[p].c === nh.c) { pelletIdx = p; break; }
    }

    if (pelletIdx === -1) {
      var tail = s.body[s.body.length - 1];
      board[tail.r][tail.c] = null;
      s.body.pop();
    } else {
      pellets.splice(pelletIdx, 1);
      var newPellet = respawnPellet(board);
      if (newPellet) { pellets.push(newPellet); board[newPellet.r][newPellet.c] = 'pellet'; }
    }

    s.body.unshift(nh);
    board[nh.r][nh.c] = idx;
    s.lastDir = dir;
  });
}

// ── Entry point ──────────────────────────────────────────────

function simulateGame() {
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var mainSheet = ss.getSheetByName('Main');

  setupGrid(mainSheet);
  var state   = initGameState(ss, mainSheet);
  var snakes  = state.snakes;
  var pellets = state.pellets;
  var board   = state.board;
  var frame   = 0;

  renderFrame(mainSheet, snakes, board);
  renderScoreboard(mainSheet, snakes, frame);
  SpreadsheetApp.flush();
  Utilities.sleep(FRAME_DELAY_MS);

  while (snakes.filter(function(s) { return s.alive; }).length > 1 && frame < MAX_FRAMES) {
    tick(frame, snakes, pellets, board);
    frame++;
    renderFrame(mainSheet, snakes, board);
    renderScoreboard(mainSheet, snakes, frame);
    SpreadsheetApp.flush();
    Utilities.sleep(FRAME_DELAY_MS);
  }

  var survivors = snakes.filter(function(s) { return s.alive; });
  var msg = survivors.length === 1
    ? '🏆  ' + survivors[0].name + ' wins!  (length: ' + survivors[0].body.length + ')'
    : survivors.length === 0
    ? '💀  Draw — all snakes eliminated!'
    : '⏱  Time limit!  Survivors: ' + survivors.map(function(s) { return s.name; }).join(', ');

  renderFrame(mainSheet, snakes, board, msg);
  renderScoreboard(mainSheet, snakes, frame);
  SpreadsheetApp.flush();
}
