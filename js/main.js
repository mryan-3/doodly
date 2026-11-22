/* main.js — app shell: renders the sheet of faces into a grid and
   wires up the controls (regenerate, pagination, per-page count,
   ink/paper, PNG export, click-to-enlarge). */
(function () {
  'use strict';
  const Rng = window.DoodlyRandom.Rng;
  const hashSeed = window.DoodlyRandom.hashSeed;
  const Face = window.DoodlyFace;

  const canvas = document.getElementById('sheet');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const modal = document.getElementById('modal');
  const modalCanvas = document.getElementById('modal-canvas');
  const modalCaption = document.getElementById('modal-caption');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const pageLabel = document.getElementById('page-label');

  const state = {
    masterSeed: (Math.random() * 0xffffffff) >>> 0,
    page: 0, // 0-based internally; the UI shows 1-based numbers
    count: 48,
    ink: 'graphite',
    paper: 'cream',
    gaze: null, // mouse position over the modal canvas (pupils track it)
    faces: [] // { seed, recipe, x, y, w, h, scale }
  };

  // ---------- seed & page <-> URL hash --------------------------------
  // Hash format: "#<seed>/<page>" with a 1-based page number. A bare
  // "#<seed>" from older links still loads, starting at page 1.

  function seedFromHash() {
    const m = location.hash.match(/(\d+)(?:[\/:](\d+))?/);
    if (m) {
      state.masterSeed = parseInt(m[1], 10) >>> 0;
      if (m[2]) state.page = Math.max(0, parseInt(m[2], 10) - 1);
    }
  }

  function updateHash() {
    try {
      history.replaceState(null, '', '#' + state.masterSeed + '/' + (state.page + 1));
    } catch (e) { /* file:// */ }
  }

  // ---------- paper -----------------------------------------------------

  function drawPaper(w, h) {
    ctx.fillStyle = Face.PAPERS[state.paper];
    ctx.fillRect(0, 0, w, h);

    // subtle speckle + fiber texture so it reads as sketchbook paper
    const rng = new Rng((state.masterSeed ^ 0x51ED270B) >>> 0);
    const ink = Face.INKS[state.ink];
    ctx.fillStyle = ink;
    const dots = Math.floor((w * h) / 2200);
    for (let i = 0; i < dots; i++) {
      ctx.globalAlpha = 0.02 + rng.next() * 0.04;
      ctx.fillRect(rng.next() * w, rng.next() * h, 1, 1);
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      ctx.globalAlpha = 0.025;
      const x = rng.next() * w, y = rng.next() * h;
      const a = rng.next() * Math.PI, l = 4 + rng.next() * 10;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- grid --------------------------------------------------------

  function layout(w, h) {
    const cols = w < 640 ? 4 : 6;
    const rows = Math.ceil(state.count / cols);
    const cellW = w / cols;
    const cellH = h / rows;
    const scale = Math.min(cellW / (Face.BOX_W + 14), cellH / (Face.BOX_H + 14));
    const faces = [];
    const base = state.page * state.count; // first global face index on this page
    for (let i = 0; i < state.count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bw = Face.BOX_W * scale;
      const bh = Face.BOX_H * scale;
      faces.push({
        seed: hashSeed(state.masterSeed, base + i),
        x: col * cellW + (cellW - bw) / 2,
        y: row * cellH + (cellH - bh) / 2,
        w: bw, h: bh, scale: scale,
        recipe: null
      });
    }
    return faces;
  }

  function render() {
    const dpr = window.devicePixelRatio || 1;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w < 10 || h < 10) return;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawPaper(w, h);
    state.faces = layout(w, h);
    for (let i = 0; i < state.faces.length; i++) {
      const f = state.faces[i];
      f.recipe = Face.makeRecipe(new Rng(f.seed), f.seed);
      Face.drawFace(ctx, f.recipe, f.seed, {
        x: f.x, y: f.y, scale: f.scale,
        ink: Face.INKS[state.ink], paper: Face.PAPERS[state.paper]
      });
    }
  }

  function regenerate(newSeed) {
    state.masterSeed = (newSeed != null ? newSeed : Math.random() * 0xffffffff) >>> 0;
    state.page = 0; // a fresh collection starts back at page 1
    updateHash();
    updatePager();
    render();
  }

  // ---------- pagination -------------------------------------------------

  function updatePager() {
    pageLabel.textContent = 'page ' + (state.page + 1);
    prevBtn.disabled = state.page === 0;
  }

  function goToPage(p) {
    if (!isFinite(p)) return;
    const target = Math.max(0, Math.floor(p));
    if (target === state.page) return;
    state.page = target;
    updateHash();
    updatePager();
    render();
  }

  // ---------- enlarge modal -------------------------------------------------
  // The enlarged face can be spun by dragging: horizontal → yaw,
  // vertical → pitch. Double-click snaps back to its baked pose.

  let modalIndex = -1;
  let modalPose = null; // { yaw, pitch } override while/after dragging
  let dragInfo = null;
  let dragMoved = false; // a real drag happened → swallow its ending click

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function renderModal() {
    const f = state.faces[modalIndex];
    if (!f || !f.recipe) return;
    const w = modalCanvas.width;
    const h = modalCanvas.height;
    const mctx = modalCanvas.getContext('2d');
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.fillStyle = Face.PAPERS[state.paper];
    mctx.fillRect(0, 0, w, h);

    const scale = Math.min((w - 40) / Face.BOX_W, (h - 40) / Face.BOX_H);
    Face.drawFace(mctx, f.recipe, f.seed, {
      x: (w - Face.BOX_W * scale) / 2,
      y: (h - Face.BOX_H * scale) / 2,
      scale: scale,
      ink: Face.INKS[state.ink], paper: Face.PAPERS[state.paper],
      poseOverride: modalPose,
      gaze: state.gaze
    });
  }

  function openModal(index) {
    const f = state.faces[index];
    if (!f || !f.recipe) return;
    modalIndex = index;
    modalPose = null;
    state.gaze = { x: modalCanvas.width / 2, y: modalCanvas.height * 0.35 };
    const n = state.page * state.count + index + 1; // global face number
    modalCaption.textContent = 'face #' + n + ' \u00B7 seed ' + f.seed +
      ' \u00B7 drag to rotate \u00B7 double-click resets';
    renderModal();
    modal.classList.remove('hidden');
  }

  function closeModal() {
    modal.classList.add('hidden');
    modalIndex = -1;
    modalPose = null;
    dragInfo = null;
    dragMoved = false;
  }

  // ---------- events ------------------------------------------------------------

  canvas.addEventListener('click', function (e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    for (let i = 0; i < state.faces.length; i++) {
      const f = state.faces[i];
      if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) {
        openModal(i);
        return;
      }
    }
  });

  // Releasing a drag fires a click that would bubble up and close the
  // modal — swallow it when an actual drag just happened.
  modal.addEventListener('click', function () {
    if (dragMoved) { dragMoved = false; return; }
    closeModal();
  });

  // --- drag-to-rotate ------------------------------------------------
  function dragStart(x, y) {
    const f = state.faces[modalIndex];
    if (!f || !f.recipe) return;
    dragInfo = {
      mx: x, my: y,
      base: modalPose || { yaw: f.recipe.pose.yaw, pitch: f.recipe.pose.pitch }
    };
    modalCanvas.classList.add('rotating');
  }
  function dragMove(x, y) {
    if (!dragInfo) return;
    const dx = x - dragInfo.mx, dy = y - dragInfo.my;
    if (Math.hypot(dx, dy) > 4) dragMoved = true;
    modalPose = {
      yaw: clamp(dragInfo.base.yaw + dx * 0.45, -75, 75),
      pitch: clamp(dragInfo.base.pitch - dy * 0.35, -35, 35)
    };
    renderModal();
  }
  function dragEnd() {
    dragInfo = null;
    modalCanvas.classList.remove('rotating');
  }

  modalCanvas.addEventListener('mousedown', function (e) {
    dragStart(e.clientX, e.clientY);
    e.preventDefault();
  });
  // Pupils follow the mouse while the modal is open (rAF-throttled).
  let gazeRAF = null;
  function setGaze(clientX, clientY) {
    const rect = modalCanvas.getBoundingClientRect();
    state.gaze = { x: clientX - rect.left, y: clientY - rect.top };
  }

  window.addEventListener('mousemove', function (e) {
    if (dragInfo) {
      setGaze(e.clientX, e.clientY);
      dragMove(e.clientX, e.clientY);
      return;
    }
    if (modalIndex >= 0) {
      setGaze(e.clientX, e.clientY);
      if (gazeRAF == null) {
        gazeRAF = requestAnimationFrame(function () {
          gazeRAF = null;
          if (modalIndex >= 0) renderModal();
        });
      }
    }
  });
  window.addEventListener('mouseup', dragEnd);

  modalCanvas.addEventListener('touchstart', function (e) {
    dragStart(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchmove', function (e) {
    if (!dragInfo) return;
    setGaze(e.touches[0].clientX, e.touches[0].clientY);
    dragMove(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchend', dragEnd);

  modalCanvas.addEventListener('dblclick', function () {
    modalPose = null;
    renderModal();
  });

  // --- SVG export ------------------------------------------------------
  // Replays the exact same draw calls into an SVG-recording context, so
  // the downloaded vector matches the canvas pixel-for-pixel.
  document.getElementById('modal-svg-btn').addEventListener('click', function (e) {
    e.stopPropagation(); // keep the modal open
    const f = state.faces[modalIndex];
    if (!f || !f.recipe || !window.DoodlySVG) return;
    const w = modalCanvas.width;
    const h = modalCanvas.height;
    const sctx = window.DoodlySVG.makeContext(w, h);
    sctx.fillStyle = Face.PAPERS[state.paper];
    sctx.fillRect(0, 0, w, h);
    const scale = Math.min((w - 40) / Face.BOX_W, (h - 40) / Face.BOX_H);
    Face.drawFace(sctx, f.recipe, f.seed, {
      x: (w - Face.BOX_W * scale) / 2,
      y: (h - Face.BOX_H * scale) / 2,
      scale: scale,
      ink: Face.INKS[state.ink], paper: Face.PAPERS[state.paper],
      poseOverride: modalPose,
      gaze: state.gaze
    });
    const blob = new Blob([sctx.toSVG()], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const n = state.page * state.count + modalIndex + 1;
    a.download = 'doodly-' + state.masterSeed + '-face' + n + '.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });

  document.getElementById('regen-btn').addEventListener('click', function () { regenerate(); });

  document.getElementById('download-btn').addEventListener('click', function () {
    canvas.toBlob(function (blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'doodly-' + state.masterSeed + '-p' + (state.page + 1) + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
  });

  document.getElementById('count-select').addEventListener('change', function (e) {
    state.count = parseInt(e.target.value, 10);
    render();
  });

  document.getElementById('ink-select').addEventListener('change', function (e) {
    state.ink = e.target.value;
    render();
  });

  document.getElementById('paper-select').addEventListener('change', function (e) {
    state.paper = e.target.value;
    render();
  });

  prevBtn.addEventListener('click', function () { goToPage(state.page - 1); });
  nextBtn.addEventListener('click', function () { goToPage(state.page + 1); });

  window.addEventListener('keydown', function (e) {
    const typing = document.activeElement &&
      (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT');
    if ((e.key === 'r' || e.key === 'R') && !typing) regenerate();
    if (e.key === 'ArrowLeft' && !typing) goToPage(state.page - 1);
    if (e.key === 'ArrowRight' && !typing) goToPage(state.page + 1);
    if (e.key === 'Escape') closeModal();
  });

  let resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  });

  // ---------- boot -----------------------------------------------------------------

  seedFromHash();
  updatePager();
  render();
})();