(function () {
  const engine = window.GomokuEngine;
  const STORAGE_KEY = "gomoku-v1";
  const NS = "http://www.w3.org/2000/svg";
  const SIZE = 15;

  const board = document.getElementById("board");
  const boardWrap = document.querySelector(".board-wrap");
  const statusEl = document.getElementById("status");
  const turnEl = document.getElementById("turn");
  const turnText = document.getElementById("turn-text");
  const turnStone = document.getElementById("turn-stone");
  const scoreBlack = document.getElementById("score-black");
  const scoreWhite = document.getElementById("score-white");
  const scoreDraw = document.getElementById("score-draw");
  const modePvp = document.getElementById("mode-pvp");
  const modeAi = document.getElementById("mode-ai");
  const colorSeg = document.getElementById("color-seg");
  const colorBlack = document.getElementById("color-black");
  const colorWhite = document.getElementById("color-white");
  const undoBtn = document.getElementById("undo");
  const restartBtn = document.getElementById("restart");
  const soundBtn = document.getElementById("sound");
  const clearBtn = document.getElementById("clear-score");
  const loupe = document.getElementById("loupe");
  const loupeStone = document.getElementById("loupe-stone");
  const loupeLabel = document.getElementById("loupe-label");
  const points = document.createElement("div");
  const resultDlg = document.getElementById("result");
  const resultTitle = document.getElementById("result-title");
  const resultDetail = document.getElementById("result-detail");
  const resultMark = document.getElementById("result-mark");
  const confirmDlg = document.getElementById("confirm");
  const confirmTitle = document.getElementById("confirm-title");
  const confirmText = document.getElementById("confirm-text");

  const prefs = loadPrefs();
  let soundOn = prefs.sound !== false;
  let thinking = false;
  let aiTimer = 0;
  let drag = null;
  let cursor = { r: 7, c: 7 };
  let audioCtx = null;
  const cells = [];

  const game = engine.createGame({
    mode: prefs.mode,
    human: prefs.human,
    scores: prefs.scores,
    moves: prefs.moves,
    scored: prefs.scored,
  });

  points.className = "points";
  buildBoard();

  const resizeObserver = new ResizeObserver(fitBoard);
  resizeObserver.observe(boardWrap);
  window.addEventListener("resize", fitBoard);

  modePvp.addEventListener("click", function () {
    changeMode("pvp");
  });
  modeAi.addEventListener("click", function () {
    changeMode("ai");
  });
  colorBlack.addEventListener("click", function () {
    changeColor(engine.BLACK);
  });
  colorWhite.addEventListener("click", function () {
    changeColor(engine.WHITE);
  });
  undoBtn.addEventListener("click", onUndo);
  restartBtn.addEventListener("click", onRestart);
  soundBtn.addEventListener("click", function () {
    soundOn = !soundOn;
    if (soundOn) unlockAudio();
    render();
    persist();
  });
  clearBtn.addEventListener("click", onClearScores);
  resultDlg.addEventListener("close", function () {
    if (resultDlg.returnValue === "again") restart();
  });
  board.addEventListener("keydown", onKeyDown);
  board.addEventListener("pointerdown", onPointerDown);
  board.addEventListener("pointermove", onPointerMove);
  board.addEventListener("pointerup", onPointerUp);
  board.addEventListener("pointercancel", endDrag);
  board.addEventListener("contextmenu", function (event) {
    event.preventDefault();
  });
  document.addEventListener("pointerdown", unlockAudio);

  render();
  fitBoard();
  maybeAi();

  function buildBoard() {
    const lines = svg("svg");
    lines.setAttribute("class", "lines");
    lines.setAttribute("viewBox", "0 0 14 14");
    lines.setAttribute("preserveAspectRatio", "none");
    lines.setAttribute("aria-hidden", "true");
    for (let i = 0; i < SIZE; i++) {
      lines.appendChild(line(0, i, 14, i));
      lines.appendChild(line(i, 0, i, 14));
    }
    [3, 7, 11].forEach(function (x) {
      [3, 7, 11].forEach(function (y) {
        const star = svg("circle");
        star.setAttribute("cx", x);
        star.setAttribute("cy", y);
        star.setAttribute("r", "0.13");
        lines.appendChild(star);
      });
    });

    const win = svg("svg");
    win.id = "winline";
    win.setAttribute("class", "winline");
    win.setAttribute("viewBox", "0 0 14 14");
    win.setAttribute("preserveAspectRatio", "none");
    win.setAttribute("aria-hidden", "true");

    board.style.setProperty("--gap", "14");
    board.appendChild(lines);
    board.appendChild(points);
    board.appendChild(win);

    for (let r = 0; r < SIZE; r++) {
      cells[r] = [];
      for (let c = 0; c < SIZE; c++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "point";
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);
        btn.style.setProperty("--r", r);
        btn.style.setProperty("--c", c);
        btn.setAttribute("role", "gridcell");
        btn.setAttribute("aria-rowindex", String(r + 1));
        btn.setAttribute("aria-colindex", String(c + 1));
        const stone = document.createElement("span");
        stone.className = "stone";
        btn.appendChild(stone);
        points.appendChild(btn);
        cells[r][c] = btn;
      }
    }
  }

  function svg(name) {
    return document.createElementNS(NS, name);
  }

  function line(x1, y1, x2, y2) {
    const el = svg("line");
    el.setAttribute("x1", x1);
    el.setAttribute("y1", y1);
    el.setAttribute("x2", x2);
    el.setAttribute("y2", y2);
    return el;
  }

  function fitBoard() {
    const style = getComputedStyle(boardWrap);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const side = Math.floor(
      Math.min(boardWrap.clientWidth - padX, boardWrap.clientHeight - padY, 740)
    );
    if (side < 80) return;
    board.style.width = side + "px";
    board.style.height = side + "px";
  }

  function render() {
    const state = game.getState();
    const winCells = {};
    state.segments.forEach(function (segment) {
      segment.forEach(function (cell) {
        winCells[cell.r + "," + cell.c] = true;
      });
    });
    const locked = thinking || state.over || (state.mode === "ai" && state.turn !== state.human);

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const btn = cells[r][c];
        const value = state.board[r][c];
        btn.classList.toggle("filled", value !== 0);
        btn.classList.toggle("black", value === engine.BLACK);
        btn.classList.toggle("white", value === engine.WHITE);
        btn.classList.toggle("last", !!(state.last && state.last.r === r && state.last.c === c));
        btn.classList.toggle("win", !!winCells[r + "," + c]);
        btn.classList.toggle("cursor", cursor.r === r && cursor.c === c);
        btn.disabled = value !== 0 || locked;
        const who = value === engine.BLACK ? "黑棋" : value === engine.WHITE ? "白棋" : "空";
        btn.setAttribute("aria-label", r + 1 + " 行 " + (c + 1) + " 列，" + who);
      }
    }

    board.classList.toggle("locked", locked);
    board.classList.toggle("p1", state.turn === engine.BLACK);
    board.classList.toggle("p2", state.turn === engine.WHITE);
    drawWin(state.segments);

    const label = turnLabel(state);
    turnText.textContent = label.text;
    turnStone.hidden = !label.color;
    turnStone.className = "mini " + (label.color === engine.WHITE ? "white" : "black");
    turnEl.classList.toggle("thinking", thinking);
    statusEl.textContent = statusText(state);

    scoreBlack.textContent = String(state.scores.black);
    scoreWhite.textContent = String(state.scores.white);
    scoreDraw.textContent = String(state.scores.draw);
    modePvp.setAttribute("aria-pressed", String(state.mode === "pvp"));
    modeAi.setAttribute("aria-pressed", String(state.mode === "ai"));
    colorSeg.hidden = state.mode !== "ai";
    colorBlack.setAttribute("aria-pressed", String(state.human === engine.BLACK));
    colorWhite.setAttribute("aria-pressed", String(state.human === engine.WHITE));
    undoBtn.disabled = !state.canUndo;
    soundBtn.setAttribute("aria-pressed", String(soundOn));
    soundBtn.textContent = soundOn ? "聲音" : "靜音";
  }

  function turnLabel(state) {
    if (thinking) return { color: state.turn, text: "思考中" };
    if (state.winner === engine.BLACK) return { color: engine.BLACK, text: "黑棋勝" };
    if (state.winner === engine.WHITE) return { color: engine.WHITE, text: "白棋勝" };
    if (state.draw) return { color: 0, text: "和棋" };
    if (state.mode === "ai" && state.turn === state.human) return { color: state.turn, text: "輪到你" };
    if (state.mode === "ai") return { color: state.turn, text: "電腦" };
    return { color: state.turn, text: (state.turn === engine.BLACK ? "黑棋" : "白棋") + "落子" };
  }

  function statusText(state) {
    if (thinking) return "電腦思考中";
    if (state.winner) return (state.winner === engine.BLACK ? "黑棋" : "白棋") + "連成五子";
    if (state.draw) return "棋盤已滿";
    if (state.moveCount === 0) {
      if (state.mode === "ai" && state.human === engine.WHITE) return "電腦執黑先手";
      if (state.mode === "ai") return "你執黑先手";
      return "黑先，點交叉點落子";
    }
    if (state.mode === "ai") return "第 " + state.moveCount + " 手，輪到你";
    const who = state.turn === engine.BLACK ? "黑棋" : "白棋";
    return "第 " + state.moveCount + " 手，交給" + who;
  }

  function drawWin(segments) {
    const win = document.getElementById("winline");
    while (win.firstChild) win.removeChild(win.firstChild);
    segments.forEach(function (segment) {
      const poly = svg("polyline");
      poly.setAttribute(
        "points",
        segment
          .map(function (cell) {
            return cell.c + "," + cell.r;
          })
          .join(" ")
      );
      win.appendChild(poly);
    });
  }

  function canHumanPlay() {
    if (thinking) return false;
    const state = game.getState();
    if (state.over) return false;
    if (state.mode === "ai" && state.turn !== state.human) return false;
    return true;
  }

  function place(r, c) {
    if (!canHumanPlay()) return;
    const state = game.getState();
    if (state.board[r][c] !== 0) return;
    const res = game.play(r, c, false);
    if (!res.ok) return;
    cursor = { r: r, c: c };
    knock(state.turn);
    buzz(8);
    render();
    persist();
    if (finishIfOver(res)) return;
    maybeAi();
  }

  function maybeAi() {
    const state = game.getState();
    if (!(state.mode === "ai" && !state.over && state.turn !== state.human)) return;
    if (aiTimer) return;
    thinking = true;
    render();
    aiTimer = window.setTimeout(function () {
      aiTimer = 0;
      thinking = false;
      const current = game.getState();
      if (!(current.mode === "ai" && !current.over && current.turn !== current.human)) {
        render();
        return;
      }
      let move = null;
      try {
        move = game.pickMove(current.turn);
      } catch (error) {
        render();
        return;
      }
      if (!move) {
        render();
        return;
      }
      const res = game.play(move.r, move.c, true);
      if (!res.ok) {
        render();
        return;
      }
      cursor = { r: move.r, c: move.c };
      knock(current.turn);
      render();
      persist();
      finishIfOver(res);
    }, 320);
  }

  function finishIfOver(res) {
    if (!res || (!res.winner && !res.draw)) return false;
    winSound();
    if (navigator.vibrate) navigator.vibrate([12, 36, 18]);
    showResult();
    return true;
  }

  function showResult() {
    const state = game.getState();
    endDrag();
    if (state.draw) {
      resultTitle.textContent = "和棋";
      resultDetail.textContent = "棋盤下滿了，共 " + state.moveCount + " 手";
      resultMark.className = "result-mark draw";
      resultMark.textContent = "和";
    } else {
      const black = state.winner === engine.BLACK;
      let title = (black ? "黑棋" : "白棋") + "獲勝";
      if (state.mode === "ai") title = state.winner === state.human ? "你贏了" : "電腦贏了";
      resultTitle.textContent = title;
      resultDetail.textContent = "共 " + state.moveCount + " 手";
      resultMark.className = "result-mark " + (black ? "black" : "white");
      resultMark.textContent = "";
    }
    if (!resultDlg.open) {
      resultDlg.returnValue = "";
      resultDlg.showModal();
    }
  }

  function onUndo() {
    if (aiTimer) {
      window.clearTimeout(aiTimer);
      aiTimer = 0;
      thinking = false;
    }
    if (!game.canUndo()) {
      render();
      return;
    }
    const res = game.undo();
    if (!res.ok) return;
    if (resultDlg.open) resultDlg.close();
    knock(0);
    render();
    persist();
    maybeAi();
  }

  async function onRestart() {
    const state = game.getState();
    if (state.moveCount > 0 && !state.over) {
      const ok = await ask("要重新開始嗎？", "這盤棋會清掉，比分還在。");
      if (!ok) return;
    }
    restart();
  }

  function restart() {
    if (aiTimer) {
      window.clearTimeout(aiTimer);
      aiTimer = 0;
    }
    thinking = false;
    if (resultDlg.open) resultDlg.close();
    game.restart();
    cursor = { r: 7, c: 7 };
    render();
    persist();
    maybeAi();
  }

  async function changeMode(mode) {
    if (game.getState().mode === mode) return;
    if (game.getState().moveCount > 0) {
      const ok = await ask(
        mode === "ai" ? "要改成對電腦嗎？" : "要改成雙人嗎？",
        "這盤棋會重新開始，比分還在。"
      );
      if (!ok) return;
    }
    stopAi();
    game.setMode(mode);
    cursor = { r: 7, c: 7 };
    render();
    fitBoard();
    persist();
    maybeAi();
  }

  async function changeColor(color) {
    if (game.getState().human === color) return;
    if (game.getState().moveCount > 0) {
      const ok = await ask("要換邊嗎？", "這盤棋會重新開始，比分還在。");
      if (!ok) return;
    }
    stopAi();
    game.setHuman(color);
    cursor = { r: 7, c: 7 };
    render();
    persist();
    maybeAi();
  }

  async function onClearScores() {
    const scores = game.getState().scores;
    if (!scores.black && !scores.white && !scores.draw) return;
    const ok = await ask("要清空比分嗎？", "勝場紀錄會歸零。");
    if (!ok) return;
    game.resetScores();
    render();
    persist();
  }

  function stopAi() {
    if (aiTimer) {
      window.clearTimeout(aiTimer);
      aiTimer = 0;
    }
    thinking = false;
  }

  function ask(title, text) {
    if (confirmDlg.open) return Promise.resolve(false);
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    confirmDlg.returnValue = "";
    return new Promise(function (resolve) {
      function done() {
        confirmDlg.removeEventListener("close", done);
        resolve(confirmDlg.returnValue === "ok");
      }
      confirmDlg.addEventListener("close", done);
      confirmDlg.showModal();
    });
  }

  function onPointerDown(event) {
    if (event.button !== 0 || drag || !canHumanPlay()) return;
    const cell = cellFromPoint(event.clientX, event.clientY);
    if (!cell || cell.filled) return;
    if (event.pointerType !== "mouse") event.preventDefault();
    drag = {
      id: event.pointerId,
      type: event.pointerType,
      r: cell.r,
      c: cell.c,
    };
    try {
      board.setPointerCapture(event.pointerId);
    } catch (error) {
      /* Pointer capture can fail if the gesture already ended. */
    }
    aim(cell, event);
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.id || drag.type === "mouse") return;
    const cell = cellFromPoint(event.clientX, event.clientY);
    if (!cell || cell.filled) {
      clearAim();
      loupe.hidden = true;
      drag.r = -1;
      drag.c = -1;
      return;
    }
    drag.r = cell.r;
    drag.c = cell.c;
    aim(cell, event);
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const target = drag;
    endDrag();
    if (target.type === "mouse") {
      const cell = cellFromPoint(event.clientX, event.clientY);
      if (!cell || cell.r !== target.r || cell.c !== target.c || cell.filled) return;
    }
    if (target.r < 0 || target.c < 0) return;
    place(target.r, target.c);
    if (target.type !== "mouse" && document.activeElement) document.activeElement.blur();
  }

  function endDrag() {
    drag = null;
    clearAim();
    loupe.hidden = true;
  }

  function aim(cell, event) {
    clearAim();
    cells[cell.r][cell.c].classList.add("aim");
    if (!event || event.pointerType === "mouse") return;
    const state = game.getState();
    loupeStone.className = state.turn === engine.WHITE ? "white" : "black";
    loupeLabel.textContent = cell.r + 1 + " 行 " + (cell.c + 1) + " 列";
    const x = Math.min(window.innerWidth - 56, Math.max(56, event.clientX));
    const flip = event.clientY < 130;
    loupe.classList.toggle("flip", flip);
    loupe.style.left = x + "px";
    loupe.style.top = event.clientY + "px";
    loupe.hidden = false;
  }

  function clearAim() {
    const aimed = points.querySelector(".aim");
    if (aimed) aimed.classList.remove("aim");
  }

  function cellFromPoint(x, y) {
    const rect = points.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const slop = rect.width / (SIZE - 1) * 0.7;
    if (x < rect.left - slop || y < rect.top - slop || x > rect.right + slop || y > rect.bottom + slop) {
      return null;
    }
    const c = clamp(Math.round(((x - rect.left) / rect.width) * (SIZE - 1)), 0, SIZE - 1);
    const r = clamp(Math.round(((y - rect.top) / rect.height) * (SIZE - 1)), 0, SIZE - 1);
    const state = game.getState();
    return { r: r, c: c, filled: state.board[r][c] !== 0 };
  }

  function onKeyDown(event) {
    const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (step[event.key]) {
      event.preventDefault();
      cursor.r = clamp(cursor.r + step[event.key][0], 0, SIZE - 1);
      cursor.c = clamp(cursor.c + step[event.key][1], 0, SIZE - 1);
      board.classList.add("kb");
      render();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      board.classList.add("kb");
      place(cursor.r, cursor.c);
    }
  }

  board.addEventListener("pointerdown", function () {
    board.classList.remove("kb");
  });

  function knock(player) {
    if (!soundOn) return;
    const ctx = context();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(player === engine.WHITE ? 540 : player === engine.BLACK ? 390 : 280, now);
    gain.gain.setValueAtTime(player ? 0.045 : 0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  function winSound() {
    if (!soundOn) return;
    const ctx = context();
    if (!ctx) return;
    [523, 659, 784].forEach(function (freq, index) {
      const now = ctx.currentTime + index * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    });
  }

  function context() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function unlockAudio() {
    if (soundOn) context();
  }

  function buzz(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  function persist() {
    try {
      const state = game.getState();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          v: 1,
          mode: state.mode,
          human: state.human,
          sound: soundOn,
          scores: state.scores,
          moves: game.getMoves(),
          scored: state.scored,
        })
      );
    } catch (error) {
      /* Private mode can reject storage; the match still plays. */
    }
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      if (!data || data.v !== 1) return {};
      const moves = Array.isArray(data.moves)
        ? data.moves.filter(function (move) {
            return (
              move &&
              Number.isInteger(move.r) &&
              Number.isInteger(move.c) &&
              move.r >= 0 &&
              move.c >= 0 &&
              move.r < SIZE &&
              move.c < SIZE
            );
          })
        : [];
      return {
        mode: data.mode === "ai" ? "ai" : "pvp",
        human: data.human === 2 ? 2 : 1,
        sound: data.sound !== false,
        scores: data.scores,
        moves: moves,
        scored: !!data.scored,
      };
    } catch (error) {
      return {};
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
})();
