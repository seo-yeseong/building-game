(() => {
  // ================== 설정 ==================
  const SIZE = 8;
  const POINTS_PER_LINE = 10;  // 한 줄 부술 때마다 얻는 점수
  const STAMP_SCORE = 100;     // 이 점수 이상이면 스탬프 화면
  // 안전 주황, 중장비 노랑, 철골 파랑, 안전 초록, 벽돌 빨강, 철판 회색
  const COLORS = ['#FF6A13', '#F2C200', '#2F6FB0', '#3BA55C', '#B5442F', '#9AA3AB'];

  // 각 블록 모양: [행, 열] 좌표 목록
  const SHAPES = [
    [[0,0]],
    [[0,0],[0,1]], [[0,0],[1,0]],
    [[0,0],[0,1],[0,2]], [[0,0],[1,0],[2,0]],
    [[0,0],[0,1],[0,2],[0,3]], [[0,0],[1,0],[2,0],[3,0]],
    [[0,0],[0,1],[0,2],[0,3],[0,4]], [[0,0],[1,0],[2,0],[3,0],[4,0]],
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]],
    [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]], [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]],
    // 작은 ㄱ자
    [[0,0],[1,0],[1,1]], [[0,1],[1,0],[1,1]], [[0,0],[0,1],[1,0]], [[0,0],[0,1],[1,1]],
    // L자
    [[0,0],[1,0],[2,0],[2,1]], [[0,1],[1,1],[2,1],[2,0]], [[0,0],[0,1],[1,0],[2,0]], [[0,0],[0,1],[1,1],[2,1]],
    [[0,0],[0,1],[0,2],[1,0]], [[0,0],[0,1],[0,2],[1,2]], [[0,0],[1,0],[1,1],[1,2]], [[0,2],[1,0],[1,1],[1,2]],
    // T자
    [[0,0],[0,1],[0,2],[1,1]], [[0,1],[1,0],[1,1],[1,2]], [[0,0],[1,0],[1,1],[2,0]], [[0,1],[1,0],[1,1],[2,1]],
    // S/Z자
    [[0,1],[0,2],[1,0],[1,1]], [[0,0],[0,1],[1,1],[1,2]], [[0,0],[1,0],[1,1],[2,1]], [[0,1],[1,0],[1,1],[2,0]],
    // 큰 L자
    [[0,0],[1,0],[2,0],[2,1],[2,2]], [[0,0],[0,1],[0,2],[1,0],[2,0]],
    [[0,0],[0,1],[0,2],[1,2],[2,2]], [[0,2],[1,2],[2,2],[2,1],[2,0]],
  ];

  // ================== DOM ==================
  const root     = document.getElementById('bb-game');
  const boardEl  = document.getElementById('bb-board');
  const trayEl   = document.getElementById('bb-tray');
  const slots    = [...trayEl.querySelectorAll('.bb-slot')];
  const scoreEl  = document.getElementById('bb-score');
  const bestEl   = document.getElementById('bb-best');
  const toastEl  = document.getElementById('bb-toast');
  const overEl   = document.getElementById('bb-over');
  const finalEl  = document.getElementById('bb-final');
  const newBestEl = document.getElementById('bb-newbest');
  const stampEl   = document.getElementById('bb-stamp');
  document.getElementById('bb-stamp-score').textContent = STAMP_SCORE;
  document.getElementById('bb-stamp-mark-score').textContent = STAMP_SCORE + '점';

  const cells = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const c = document.createElement('div');
    c.className = 'bb-cell';
    boardEl.appendChild(c);
    cells.push(c);
  }
  const cellAt = (r, c) => cells[r * SIZE + c];

  // ================== 상태 ==================
  let grid, tray, score, shownScore, stampShown, pendingGameOver, drag = null;
  let best = loadBest();

  function loadBest() {
    try { return Number(localStorage.getItem('bb-best')) || 0; } catch { return 0; }
  }
  function saveBest() {
    try { localStorage.setItem('bb-best', String(best)); } catch {}
  }

  // ================== 블록 ==================
  function makePiece() {
    const cellsList = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    return {
      cells: cellsList,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      h: Math.max(...cellsList.map(p => p[0])) + 1,
      w: Math.max(...cellsList.map(p => p[1])) + 1,
    };
  }

  function canPlace(piece, r, c) {
    return piece.cells.every(([dr, dc]) => {
      const rr = r + dr, cc = c + dc;
      return rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && !grid[rr][cc];
    });
  }

  function fitsAnywhere(piece) {
    for (let r = 0; r <= SIZE - piece.h; r++)
      for (let c = 0; c <= SIZE - piece.w; c++)
        if (canPlace(piece, r, c)) return true;
    return false;
  }

  // 새 블록 3개 (가능하면 최소 1개는 놓을 수 있게)
  function newTray() {
    let pieces;
    for (let tries = 0; tries < 30; tries++) {
      pieces = [makePiece(), makePiece(), makePiece()];
      if (pieces.some(fitsAnywhere)) break;
    }
    return pieces;
  }

  // 꽉 찬 줄 찾기 (g를 넘기면 가상의 판으로 계산)
  function findFull(g = grid) {
    const rows = [], cols = [];
    for (let i = 0; i < SIZE; i++) {
      if (g[i].every(Boolean)) rows.push(i);
      if (g.every(row => row[i])) cols.push(i);
    }
    return { rows, cols };
  }

  // ================== 그리기 ==================
  function renderBoard() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const el = cellAt(r, c);
        const color = grid[r][c];
        el.classList.toggle('filled', !!color);
        if (color) el.style.setProperty('--c', color);
        else el.style.removeProperty('--c');
      }
    }
  }

  function buildPieceEl(piece, className) {
    const el = document.createElement('div');
    el.className = className;
    el.style.gridTemplateColumns = `repeat(${piece.w}, var(--s))`;
    el.style.gridTemplateRows = `repeat(${piece.h}, var(--s))`;
    piece.cells.forEach(([r, c]) => {
      const b = document.createElement('div');
      b.className = 'bb-block';
      b.style.gridRow = r + 1;
      b.style.gridColumn = c + 1;
      b.style.setProperty('--c', piece.color);
      el.appendChild(b);
    });
    return el;
  }

  function renderTray() {
    slots.forEach((slot, i) => {
      slot.innerHTML = '';
      slot.classList.remove('lifted', 'blocked');
      const piece = tray[i];
      if (!piece) return;
      slot.appendChild(buildPieceEl(piece, 'bb-piece'));
      if (!fitsAnywhere(piece)) slot.classList.add('blocked');
    });
  }

  // 점수가 올라가는 애니메이션
  function renderScore() {
    const start = shownScore, end = score, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 350);
      shownScore = Math.round(start + (end - start) * k);
      scoreEl.textContent = shownScore;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    bestEl.textContent = Math.max(best, score);
  }

  function showToast(main, sub) {
    toastEl.innerHTML = main + (sub ? `<small>${sub}</small>` : '');
    toastEl.classList.remove('show');
    void toastEl.offsetWidth; // 애니메이션 다시 시작
    toastEl.classList.add('show');
  }

  // ================== 미리보기 ==================
  function clearPreview() {
    cells.forEach(el => {
      if (el.classList.contains('preview') || el.classList.contains('will-clear')) {
        el.classList.remove('preview', 'will-clear');
        const r = Math.floor(cells.indexOf(el) / SIZE), c = cells.indexOf(el) % SIZE;
        if (grid[r][c]) el.style.setProperty('--c', grid[r][c]);
        else el.style.removeProperty('--c');
      }
    });
  }

  function showPreview(piece, r, c) {
    clearPreview();
    const temp = grid.map(row => row.slice());
    piece.cells.forEach(([dr, dc]) => {
      temp[r + dr][c + dc] = piece.color;
      const el = cellAt(r + dr, c + dc);
      el.classList.add('preview');
      el.style.setProperty('--c', piece.color);
    });
    // 이 위치에 놓으면 지워질 줄은 블록 색으로 강조
    const { rows, cols } = findFull(temp);
    const mark = (rr, cc) => {
      const el = cellAt(rr, cc);
      el.classList.add('will-clear');
      el.style.setProperty('--c', piece.color);
    };
    rows.forEach(rr => { for (let cc = 0; cc < SIZE; cc++) mark(rr, cc); });
    cols.forEach(cc => { for (let rr = 0; rr < SIZE; rr++) mark(rr, cc); });
  }

  // ================== 드래그 ==================
  function boardMetrics() {
    const a = cells[0].getBoundingClientRect();
    const b = cells[1].getBoundingClientRect();
    return { x: a.left, y: a.top, size: a.width, pitch: b.left - a.left };
  }

  trayEl.addEventListener('pointerdown', (e) => {
    const slot = e.target.closest('.bb-slot');
    if (!slot || drag || !overEl.hidden || !stampEl.hidden) return;
    const i = Number(slot.dataset.i);
    const piece = tray[i];
    if (!piece) return;
    e.preventDefault();

    const m = boardMetrics();
    const ghost = buildPieceEl(piece, 'bb-ghost');
    ghost.style.setProperty('--s', m.size + 'px');
    ghost.style.gap = (m.pitch - m.size) + 'px';
    root.appendChild(ghost);

    // 터치일 때는 손가락에 가리지 않도록 블록을 더 위로 띄움
    const lift = e.pointerType === 'touch' ? m.pitch * 2.2 : m.pitch * 0.5;
    drag = { i, piece, ghost, m, lift, pos: null };
    slot.classList.add('lifted');
    moveDrag(e.clientX, e.clientY);
  });

  function moveDrag(x, y) {
    const { piece, ghost, m, lift } = drag;
    const w = piece.w * m.pitch, h = piece.h * m.pitch;
    const left = x - w / 2;
    const top = y - h - lift;
    ghost.style.transform = `translate(${left}px, ${top}px)`;

    const c = Math.round((left - m.x) / m.pitch);
    const r = Math.round((top - m.y) / m.pitch);
    if (canPlace(piece, r, c)) {
      if (!drag.pos || drag.pos.r !== r || drag.pos.c !== c) showPreview(piece, r, c);
      drag.pos = { r, c };
    } else if (drag.pos) {
      clearPreview();
      drag.pos = null;
    }
  }

  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    e.preventDefault();
    moveDrag(e.clientX, e.clientY);
  }, { passive: false });

  function endDrag() {
    if (!drag) return;
    const { i, piece, ghost, pos } = drag;
    ghost.remove();
    clearPreview();
    drag = null;
    if (pos) place(i, piece, pos.r, pos.c);
    else slots[i].classList.remove('lifted');
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // ================== 블록 놓기 ==================
  function place(i, piece, r, c) {
    piece.cells.forEach(([dr, dc]) => { grid[r + dr][c + dc] = piece.color; });
    tray[i] = null;

    const { rows, cols } = findFull();
    const lines = rows.length + cols.length;
    const cleared = new Map();

    rows.forEach(rr => { for (let cc = 0; cc < SIZE; cc++) cleared.set(rr * SIZE + cc, grid[rr][cc]); });
    cols.forEach(cc => { for (let rr = 0; rr < SIZE; rr++) cleared.set(rr * SIZE + cc, grid[rr][cc]); });

    // 부순 줄 하나당 10점
    const gained = lines * POINTS_PER_LINE;
    cleared.forEach((_, k) => { grid[Math.floor(k / SIZE)][k % SIZE] = null; });
    score += gained;

    renderBoard();

    // 놓은 칸 애니메이션
    piece.cells.forEach(([dr, dc]) => {
      const k = (r + dr) * SIZE + (c + dc);
      if (cleared.has(k)) return;
      const el = cells[k];
      el.classList.remove('placed'); void el.offsetWidth; el.classList.add('placed');
    });

    // 지워지는 칸 애니메이션
    cleared.forEach((color, k) => {
      const el = cells[k];
      el.style.setProperty('--pc', color);
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      setTimeout(() => el.classList.remove('pop'), 400);
    });

    if (lines > 0) {
      const words = ['', '완공!', '더블 완공!', '트리플 완공!', '대공사 완공!'];
      showToast(`+${gained}`, words[Math.min(lines, 4)]);
    }

    if (tray.every(p => !p)) tray = newTray();
    renderTray();
    renderScore();

    const stuck = !tray.some(p => p && fitsAnywhere(p));

    if (!stampShown && score >= STAMP_SCORE) {
      // 스탬프 화면을 먼저 보여주고, 막혔으면 닫은 뒤 게임 오버
      stampShown = true;
      pendingGameOver = stuck;
      setTimeout(showStamp, 700);
    } else if (stuck) {
      setTimeout(gameOver, 600);
    }
  }

  // ================== 스탬프 화면 ==================
  function showStamp() {
    stampEl.hidden = false;
    document.getElementById('bb-stamp-ok').focus();
  }

  document.getElementById('bb-stamp-ok').addEventListener('click', () => {
    stampEl.hidden = true;
    if (pendingGameOver) gameOver();
  });

  // ================== 게임 시작 / 종료 ==================
  function gameOver() {
    const isNew = score > best;
    if (isNew) { best = score; saveBest(); }
    finalEl.textContent = score;
    newBestEl.hidden = !isNew;
    overEl.hidden = false;
  }

  function start() {
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    score = 0; shownScore = 0; stampShown = false; pendingGameOver = false;
    tray = newTray();
    overEl.hidden = true;
    stampEl.hidden = true;
    scoreEl.textContent = '0';
    bestEl.textContent = best;
    renderBoard();
    renderTray();
  }

  document.getElementById('bb-restart').addEventListener('click', start);
  document.getElementById('bb-again').addEventListener('click', start);

  start();
})();
