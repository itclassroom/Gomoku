const assert = require("assert");
const { createGame, BLACK, WHITE } = require("../js/engine.js");

function playAll(game, moves) {
  for (const [r, c] of moves) {
    const res = game.play(r, c, false);
    assert.equal(res.ok, true, "play " + r + "," + c + " " + res.reason);
  }
}

function testHorizontalWin() {
  const game = createGame();
  playAll(game, [
    [7, 0],
    [8, 0],
    [7, 1],
    [8, 1],
    [7, 2],
    [8, 2],
    [7, 3],
    [8, 3],
    [7, 4],
  ]);
  const state = game.getState();
  assert.equal(state.winner, BLACK);
  assert.equal(state.scores.black, 1);
  assert.equal(state.segments.length, 1);
  assert.equal(state.segments[0].length, 5);
  assert.equal(game.play(7, 5, false).ok, false);
}

function testDiagonalWinAndUndoScore() {
  const game = createGame();
  playAll(game, [
    [0, 0],
    [0, 1],
    [1, 1],
    [0, 2],
    [2, 2],
    [0, 3],
    [3, 3],
    [0, 4],
    [4, 4],
  ]);
  assert.equal(game.getState().winner, BLACK);
  assert.equal(game.undo().ok, true);
  const state = game.getState();
  assert.equal(state.winner, 0);
  assert.equal(state.scores.black, 0);
  assert.equal(state.board[4][4], 0);
  assert.equal(state.turn, BLACK);
  assert.equal(state.moveCount, 8);
}

function testDraw() {
  const game = createGame({ size: 3, winLength: 5 });
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      assert.equal(game.play(r, c, false).ok, true);
    }
  }
  const state = game.getState();
  assert.equal(state.draw, true);
  assert.equal(state.winner, 0);
  assert.equal(state.scores.draw, 1);
  game.undo();
  assert.equal(game.getState().draw, false);
  assert.equal(game.getState().scores.draw, 0);
  assert.equal(game.getState().moveCount, 8);
}

function testAiBlocksAndPrefersWin() {
  const block = createGame();
  playAll(block, [
    [7, 2],
    [0, 0],
    [7, 3],
    [0, 1],
    [7, 4],
    [0, 2],
    [7, 5],
  ]);
  const blockMove = block.pickMove(WHITE);
  assert.ok(
    (blockMove.r === 7 && blockMove.c === 1) || (blockMove.r === 7 && blockMove.c === 6),
    "expected a block, got " + blockMove.r + "," + blockMove.c
  );

  const win = createGame();
  playAll(win, [
    [14, 14],
    [8, 2],
    [14, 13],
    [8, 3],
    [14, 12],
    [8, 4],
    [14, 11],
    [8, 5],
    [7, 2],
    [0, 0],
    [7, 3],
    [0, 1],
    [7, 4],
    [0, 2],
    [7, 5],
  ]);
  const before = JSON.stringify(win.getState().board);
  const winMove = win.pickMove(WHITE);
  assert.ok(
    (winMove.r === 8 && winMove.c === 1) || (winMove.r === 8 && winMove.c === 6),
    "expected the winning move, got " + winMove.r + "," + winMove.c
  );
  assert.equal(JSON.stringify(win.getState().board), before);
}

function testAiTurnGuardAndUndoPair() {
  const game = createGame({ mode: "ai", human: BLACK });
  assert.equal(game.play(7, 7, false).ok, true);
  assert.equal(game.play(7, 8, false).reason, "turn");
  assert.equal(game.play(7, 8, true).ok, true);
  assert.equal(game.play(8, 8, false).ok, true);
  assert.equal(game.play(8, 7, true).ok, true);
  assert.equal(game.undo().ok, true);
  assert.equal(game.getState().moveCount, 2);
  assert.equal(game.getState().turn, BLACK);
  assert.equal(game.getState().board[8][8], 0);
  assert.equal(game.getState().board[8][7], 0);
}

function testOpeningUndoLockedWhenAiMovedFirst() {
  const game = createGame({ mode: "ai", human: WHITE });
  assert.equal(game.play(7, 7, true).ok, true);
  assert.equal(game.canUndo(), false);
  assert.equal(game.undo().ok, false);
}

function testRestoreDoesNotDoubleScore() {
  const moves = [
    [7, 0],
    [8, 0],
    [7, 1],
    [8, 1],
    [7, 2],
    [8, 2],
    [7, 3],
    [8, 3],
    [7, 4],
  ].map(([r, c]) => ({ r, c }));
  const game = createGame({
    scores: { black: 3, white: 1, draw: 2 },
    moves,
    scored: true,
  });
  const state = game.getState();
  assert.equal(state.winner, BLACK);
  assert.equal(state.scores.black, 3);
  assert.equal(state.scores.white, 1);
  game.undo();
  assert.equal(game.getState().scores.black, 2);
  assert.equal(game.getState().winner, 0);
}

function testModeSwitchKeepsScoreAndClearsBoard() {
  const game = createGame();
  playAll(game, [
    [7, 0],
    [8, 0],
    [7, 1],
    [8, 1],
    [7, 2],
    [8, 2],
    [7, 3],
    [8, 3],
    [7, 4],
  ]);
  game.setMode("ai");
  const state = game.getState();
  assert.equal(state.mode, "ai");
  assert.equal(state.moveCount, 0);
  assert.equal(state.scores.black, 1);
  assert.equal(state.winner, 0);
}

testHorizontalWin();
testDiagonalWinAndUndoScore();
testDraw();
testAiBlocksAndPrefersWin();
testAiTurnGuardAndUndoPair();
testOpeningUndoLockedWhenAiMovedFirst();
testRestoreDoesNotDoubleScore();
testModeSwitchKeepsScoreAndClearsBoard();
console.log("engine tests passed");
