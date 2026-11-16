/* Freestyle gomoku: five or more in a row wins, no forbidden moves. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.GomokuEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;
  const DIRS = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];

  function createGame(options) {
    const opts = options || {};
    const size = clampSize(opts.size);
    const winLength =
      Number.isInteger(opts.winLength) && opts.winLength >= 3 ? opts.winLength : 5;
    let mode = opts.mode === "ai" ? "ai" : "pvp";
    let human = opts.human === WHITE ? WHITE : BLACK;
    let scores = sanitizeScores(opts.scores);
    let board = emptyBoard();
    let moves = [];
    let turn = BLACK;
    let winner = 0;
    let draw = false;
    let winSegments = [];
    let scored = false;
    let suppressScore = false;

    function emptyBoard() {
      const next = [];
      for (let r = 0; r < size; r++) next.push(new Array(size).fill(EMPTY));
      return next;
    }

    function inBounds(r, c) {
      return r >= 0 && c >= 0 && r < size && c < size;
    }

    function opponent(player) {
      return player === BLACK ? WHITE : BLACK;
    }

    function resetPosition() {
      board = emptyBoard();
      moves = [];
      turn = BLACK;
      winner = 0;
      draw = false;
      winSegments = [];
      scored = false;
    }

    function ray(r, c, dr, dc, player) {
      const cells = [];
      let rr = r + dr;
      let cc = c + dc;
      while (inBounds(rr, cc) && board[rr][cc] === player) {
        cells.push({ r: rr, c: cc });
        rr += dr;
        cc += dc;
      }
      return cells;
    }

    function collectSegments(r, c, player) {
      const segments = [];
      for (let i = 0; i < DIRS.length; i++) {
        const dr = DIRS[i][0];
        const dc = DIRS[i][1];
        const behind = ray(r, c, -dr, -dc, player);
        const ahead = ray(r, c, dr, dc, player);
        if (behind.length + ahead.length + 1 < winLength) continue;
        const segment = [];
        for (let k = behind.length - 1; k >= 0; k--) segment.push(behind[k]);
        segment.push({ r: r, c: c });
        for (let k = 0; k < ahead.length; k++) segment.push(ahead[k]);
        segments.push(segment);
      }
      return segments;
    }

    function hasFive(r, c, player) {
      for (let i = 0; i < DIRS.length; i++) {
        const dr = DIRS[i][0];
        const dc = DIRS[i][1];
        let count = 1;
        for (let sign = -1; sign <= 1; sign += 2) {
          let rr = r + dr * sign;
          let cc = c + dc * sign;
          while (inBounds(rr, cc) && board[rr][cc] === player) {
            count++;
            rr += dr * sign;
            cc += dc * sign;
          }
        }
        if (count >= winLength) return true;
      }
      return false;
    }

    function directionScore(r, c, dr, dc, player) {
      const opp = opponent(player);
      let pattern = "";
      for (let k = -5; k <= 5; k++) {
        const rr = r + dr * k;
        const cc = c + dc * k;
        if (!inBounds(rr, cc)) pattern += "O";
        else if (board[rr][cc] === player) pattern += "X";
        else if (board[rr][cc] === opp) pattern += "O";
        else pattern += ".";
      }

      let left = 5;
      let right = 5;
      while (left > 0 && pattern[left - 1] === "X") left--;
      while (right < pattern.length - 1 && pattern[right + 1] === "X") right++;
      const len = right - left + 1;
      const leftOpen = left > 0 && pattern[left - 1] === ".";
      const rightOpen = right < pattern.length - 1 && pattern[right + 1] === ".";
      const opens = (leftOpen ? 1 : 0) + (rightOpen ? 1 : 0);

      let run = 0;
      if (len >= 5) run = 100000;
      else if (len === 4) run = opens === 2 ? 15000 : opens === 1 ? 1800 : 0;
      else if (len === 3) run = opens === 2 ? 1000 : opens === 1 ? 120 : 0;
      else if (len === 2) run = opens === 2 ? 120 : opens === 1 ? 18 : 0;
      else if (len === 1) run = opens === 2 ? 8 : 0;

      const shapes = [
        ["XX.XX", 2200],
        ["X.XXX", 2200],
        ["XXX.X", 2200],
        [".XX.X.", 480],
        [".X.XX.", 480],
      ];
      let broken = 0;
      for (let s = 0; s < shapes.length; s++) {
        const pat = shapes[s][0];
        const val = shapes[s][1];
        let from = 0;
        while (from < pattern.length) {
          const at = pattern.indexOf(pat, from);
          if (at < 0) break;
          if (at <= 5 && at + pat.length > 5 && val > broken) broken = val;
          from = at + 1;
        }
      }
      return Math.max(run, broken);
    }

    function patternScore(r, c, player) {
      const dirScores = [];
      for (let i = 0; i < DIRS.length; i++) {
        dirScores.push(directionScore(r, c, DIRS[i][0], DIRS[i][1], player));
      }
      let total = 0;
      let strong = 0;
      for (let i = 0; i < dirScores.length; i++) {
        total += dirScores[i];
        if (dirScores[i] >= 900 && dirScores[i] < 100000) strong++;
      }
      // Two live threats at once (double three / double four) are usually decisive.
      if (strong >= 2) total += 9000;
      return total;
    }

    function evaluate(r, c, player) {
      board[r][c] = player;
      try {
        if (hasFive(r, c, player)) return 100000;
        return patternScore(r, c, player);
      } finally {
        board[r][c] = EMPTY;
      }
    }

    function centerBias(r, c) {
      const mid = (size - 1) / 2;
      const dist = Math.abs(r - mid) + Math.abs(c - mid);
      return (size - dist) * 0.04;
    }

    function scoreMove(r, c, player) {
      const attack = evaluate(r, c, player);
      if (attack >= 100000) return 1000000 + centerBias(r, c);
      const defense = evaluate(r, c, opponent(player));
      return attack + defense * 0.96 + centerBias(r, c);
    }

    function candidates() {
      const found = new Set();
      let stones = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (board[r][c] === EMPTY) continue;
          stones++;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const rr = r + dr;
              const cc = c + dc;
              if (!inBounds(rr, cc) || board[rr][cc] !== EMPTY) continue;
              found.add(rr * size + cc);
            }
          }
        }
      }
      if (stones === 0) {
        const mid = (size - 1) >> 1;
        return [[mid, mid]];
      }
      if (found.size === 0) {
        const all = [];
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            if (board[r][c] === EMPTY) all.push([r, c]);
          }
        }
        return all;
      }
      const list = [];
      found.forEach(function (key) {
        list.push([Math.floor(key / size), key % size]);
      });
      return list;
    }

    function manhattan(r, c) {
      const mid = (size - 1) / 2;
      return Math.abs(r - mid) + Math.abs(c - mid);
    }

    function addScore(winPlayer, isDraw) {
      if (suppressScore) return;
      if (winPlayer === BLACK) scores.black++;
      else if (winPlayer === WHITE) scores.white++;
      else if (isDraw) scores.draw++;
      scored = true;
    }

    function snapshot(ok, reason) {
      return {
        ok: ok,
        reason: reason || "",
        winner: winner,
        draw: draw,
        turn: turn,
        moveCount: moves.length,
        segments: winSegments.map(function (seg) {
          return seg.map(function (cell) {
            return { r: cell.r, c: cell.c };
          });
        }),
      };
    }

    function play(r, c, byAi) {
      r = +r;
      c = +c;
      if (!Number.isInteger(r) || !Number.isInteger(c) || !inBounds(r, c)) {
        return snapshot(false, "illegal");
      }
      if (winner || draw) return snapshot(false, "over");
      if (board[r][c] !== EMPTY) return snapshot(false, "illegal");
      if (mode === "ai" && !!byAi !== (turn !== human)) return snapshot(false, "turn");

      const player = turn;
      board[r][c] = player;
      moves.push({ r: r, c: c, player: player });
      const segments = collectSegments(r, c, player);
      if (segments.length) {
        winner = player;
        winSegments = segments;
        addScore(player, false);
      } else if (moves.length === size * size) {
        draw = true;
        winSegments = [];
        addScore(0, true);
      } else {
        turn = opponent(player);
        winSegments = [];
      }
      return snapshot(true);
    }

    function canUndo() {
      if (!moves.length) return false;
      if (
        mode === "ai" &&
        !winner &&
        !draw &&
        moves.length === 1 &&
        moves[0].player !== human
      ) {
        return false;
      }
      return true;
    }

    function undo() {
      if (!canUndo()) return snapshot(false, "empty");
      const removeTwo = mode === "ai" && moves[moves.length - 1].player !== human;
      if (scored) {
        if (winner === BLACK) scores.black = Math.max(0, scores.black - 1);
        else if (winner === WHITE) scores.white = Math.max(0, scores.white - 1);
        else if (draw) scores.draw = Math.max(0, scores.draw - 1);
      }
      winner = 0;
      draw = false;
      winSegments = [];
      scored = false;
      const count = removeTwo ? 2 : 1;
      for (let i = 0; i < count && moves.length; i++) {
        const move = moves.pop();
        board[move.r][move.c] = EMPTY;
        turn = move.player;
      }
      return snapshot(true);
    }

    function pickMove(player) {
      const list = candidates();
      let bestScore = -Infinity;
      let best = [];
      for (let i = 0; i < list.length; i++) {
        const r = list[i][0];
        const c = list[i][1];
        const score = scoreMove(r, c, player);
        if (score > bestScore + 1e-9) {
          bestScore = score;
          best = [{ r: r, c: c, score: score }];
        } else if (Math.abs(score - bestScore) <= 1e-9) {
          best.push({ r: r, c: c, score: score });
        }
      }
      if (!best.length) return null;
      if (moves.length <= 2 && best.length > 1) {
        const minDist = best.reduce(function (min, cell) {
          return Math.min(min, manhattan(cell.r, cell.c));
        }, Infinity);
        const close = best.filter(function (cell) {
          return manhattan(cell.r, cell.c) <= minDist + 1;
        });
        return close[Math.floor(Math.random() * close.length)];
      }
      best.sort(function (a, b) {
        return manhattan(a.r, a.c) - manhattan(b.r, b.c) || a.r - b.r || a.c - b.c;
      });
      return { r: best[0].r, c: best[0].c };
    }

    function setMode(next) {
      if (next !== "pvp" && next !== "ai") return getState();
      if (next === mode) return getState();
      mode = next;
      resetPosition();
      return getState();
    }

    function setHuman(color) {
      if (color !== BLACK && color !== WHITE) return getState();
      if (color === human) return getState();
      human = color;
      resetPosition();
      return getState();
    }

    function restart() {
      resetPosition();
      return getState();
    }

    function resetScores() {
      scores = { black: 0, white: 0, draw: 0 };
      scored = false;
      return getState();
    }

    function getMoves() {
      return moves.map(function (move) {
        return { r: move.r, c: move.c };
      });
    }

    function getState() {
      let last = null;
      if (moves.length) {
        const tail = moves[moves.length - 1];
        last = { r: tail.r, c: tail.c };
      }
      return {
        size: size,
        board: board.map(function (row) {
          return row.slice();
        }),
        turn: turn,
        winner: winner,
        draw: draw,
        over: !!(winner || draw),
        segments: winSegments.map(function (seg) {
          return seg.map(function (cell) {
            return { r: cell.r, c: cell.c };
          });
        }),
        last: last,
        mode: mode,
        human: human,
        scores: { black: scores.black, white: scores.white, draw: scores.draw },
        moveCount: moves.length,
        canUndo: canUndo(),
        scored: scored && !!(winner || draw),
      };
    }

    if (Array.isArray(opts.moves) && opts.moves.length) {
      suppressScore = true;
      for (let i = 0; i < opts.moves.length; i++) {
        const move = opts.moves[i];
        if (!move) break;
        const byAi = mode === "ai" && turn !== human;
        const res = play(move.r, move.c, byAi);
        if (!res.ok) break;
      }
      suppressScore = false;
      if (opts.scored && (winner || draw)) scored = true;
    }

    return {
      BLACK: BLACK,
      WHITE: WHITE,
      EMPTY: EMPTY,
      play: play,
      undo: undo,
      restart: restart,
      setMode: setMode,
      setHuman: setHuman,
      resetScores: resetScores,
      pickMove: pickMove,
      getState: getState,
      getMoves: getMoves,
      canUndo: canUndo,
    };
  }

  function clampSize(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 3 || n > 15) return 15;
    return n;
  }

  function sanitizeScores(raw) {
    function n(value) {
      const x = Number(value);
      if (!Number.isFinite(x) || x <= 0) return 0;
      return Math.min(9999, Math.floor(x));
    }
    return {
      black: n(raw && raw.black),
      white: n(raw && raw.white),
      draw: n(raw && raw.draw),
    };
  }

  return { createGame: createGame, BLACK: BLACK, WHITE: WHITE, EMPTY: EMPTY };
});
