var frame = 0;
var maxFrames = 100; // Adjust the number of frames as needed
var flagPosition = 'J10'
var gridRange = 'A1:T20'
var hasWon = false

var mainSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Main');
var players = SpreadsheetApp.getActiveSpreadsheet().getSheets().filter(sheet => sheet.getName() !== 'Main');

function movePlayers() {
  
  players.forEach(function(playerSheet) {
    var name = playerSheet.getName()
    var color = playerSheet.getTabColor()
    var actions = playerSheet.getRange('A2:A102').getValues().flat();
    actions = actions.filter(function(action) {
      return action !== '';
    });
    var index = frame % actions.length; // Calculate the current index considering the length of actions
    var currentAction = actions[index]
    var currentPosition = playerSheet.getRange('B2').getValue();
    var newPosition = move(currentPosition, currentAction);
    playerSheet.getRange('B2').setValue(newPosition);

    // console.log(name, actions, frame, index, currentAction, currentPosition, newPosition)
    // console.log(color)
    
    // Update player position on the main sheet
    mainSheet.getRange(currentPosition).setValue(null);

    var newPositionRange = mainSheet.getRange(newPosition)
    newPositionRange.setValue(name);
    newPositionRange.setBackground(color)
    
    // Check if the player caught the dot
    if (newPosition === 'J10') {
      mainSheet.getRange('J10').setValue(name + ' won!');
      hasWon = true
    }
  });

}


function move(currentPosition, action) {
  var row = parseInt(currentPosition.substring(1));
  var col = currentPosition.charCodeAt(0) - 64;
  
  switch (action) {
    case 'UP':
      if (row > 1) row--;
      break;
    case 'DOWN':
      if (row < 20) row++;
      break;
    case 'LEFT':
      if (col > 1) col--;
      break;
    case 'RIGHT':
      if (col < 20) col++;
      break;
  }
  
  return String.fromCharCode(col + 64) + row;
}

function setupGrid() {
  var range = mainSheet.getRange(gridRange);
  
  // Set column width to make each cell a square
  for (var col = 1; col <= range.getNumColumns(); col++) {
    mainSheet.setColumnWidth(col, 36);
  }
  
  // Set row height to make each cell a square
  for (var row = 1; row <= range.getNumRows(); row++) {
    mainSheet.setRowHeight(row, 22);
  }
    // Draw solid border around the grid
  var range = mainSheet.getRange(gridRange);
  range.setBorder(true, true, true, true, null, null)
  range.setBackground(null)
}

function randomizePosition() {
  // Define grid dimensions
  var numRows = 20;
  var numCols = 20;
  
  // Generate random row and column indices
  var randomRow = Math.floor(Math.random() * numRows) + 1;
  var randomCol = Math.floor(Math.random() * numCols) + 1;
  
  // Convert indices to cell reference
  var randomPosition = String.fromCharCode(64 + randomCol) + randomRow;
  return randomPosition
}

function setupPlayerPositions() {
  
  // Clear previous player positions on the main sheet
  mainSheet.getRange(gridRange).clearContent();
  
  players.forEach(function(playerSheet) {
    var position = randomizePosition()
    playerSheet.getRange('B2').setValue(position);
    var name = playerSheet.getName()
    mainSheet.getRange(position).setValue(name);
  })

}

function simulateGame() {  
  setupGrid();
  setupPlayerPositions()
  mainSheet.getRange(flagPosition).setValue('🚩')
  Utilities.sleep(1000);
  while (frame < maxFrames && !hasWon) {
    movePlayers();
    frame++;
    Utilities.sleep(1000); // Delay 1 second between frames
  }
}
