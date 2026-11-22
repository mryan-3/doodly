/* parts.js — drawable face parts, each with several variants.
   Every draw function receives (ctx, rng, f) where f holds the face's
   metrics plus f.view: the projected 3D head (built by face.js via
   head3d.js). Each anchor/patch carries a screen position, a
   foreshortened tangent frame (east/south), and a visibility flag, so
   features draw in their own local frame and slide around the skull as
   the head turns. Parts are layered by face.js in painterly order. */
(function (global) {
  'use strict';
  const S = global.DoodlySketchy;
  const PI = Math.PI;

  // Run fn in a feature's local frame: origin at the anchor, +x east
  // along the surface, +y south down the face. Hidden parts skip.
  function withFrame(ctx, pt, fn, basis) {
    if (!pt || !pt.vis) return;
    ctx.save();
    ctx.translate(pt.ax, pt.ay);
    if (basis) ctx.transform(basis[0], basis[1], basis[2], basis[3], 0, 0);
    else ctx.transform(pt.ex, pt.ey, pt.sx, pt.sy, 0, 0);
    fn();
    ctx.restore();
  }

  // Map old-style head-centered geometry (points around cx,cy) onto a
  // patch frame, keeping its relative arrangement.
  function mapped(f, ptName, pts) {
    const pt = f.view.pts[ptName];
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      out.push(f.view.frameMap(pt, pts[i][0] - f.cx, pts[i][1] - f.cy));
    }
    return out;
  }

  // ---------- head ----------------------------------------------------

  // Parametric head blob; each shape modulates the width around the loop.
  // Still used to generate hair-cap regions relative to the head center.
  function headPoints(cx, cy, rx, ry, shape) {
    const steps = 18;
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const s = Math.sin(a); // > 0 → lower half (chin side)
      let wx = 1, wy = 1;
      if (shape === 'egg') wx = 1 - 0.22 * Math.max(0, s);
      else if (shape === 'pear') wx = 1 + 0.16 * Math.max(0, s) - 0.06 * Math.max(0, -s);
      else if (shape === 'long') { wx = 0.93; wy = 1.08; }
      else if (shape === 'wide') { wx = 1.1; wy = 0.9; }
      pts.push([cx + Math.cos(a) * rx * wx, cy + Math.sin(a) * ry * wy]);
    }
    return pts;
  }

  // The outline is now the true silhouette of the posed skull.
  function drawHead(ctx, rng, f) {
    S.sketchClosed(ctx, rng, f.view.hull, 1.2, rng.chance(0.35) ? 2 : 1);
  }

  function drawEars(ctx, rng, f) {
    if (!f.ears) return;
    // Ears stick outward: draw them in a frame spanned by the surface
    // normal (local +x) and south (local +y), so they face the viewer
    // and swing behind the head as it turns.
    for (const name of ['earL', 'earR']) {
      const pt = f.view.pts[name];
      withFrame(ctx, pt, function () {
        S.sketchEllipse(ctx, rng, 0, 0, 3.1, 4.4, { rot: 0.12, wobble: 0.7, steps: 9 });
        S.sketchArc(ctx, rng, -1.3, 0, 1.4, 2.3, PI / 2, PI * 1.5, { wobble: 0.4, steps: 5 });
      }, [pt.nx, pt.ny, pt.sx, pt.sy]);
    }
  }

  // ---------- eyes ------------------------------------------------------

  // Drawn at the local origin of an eye anchor's tangent frame.
  // `gaze` (a unit direction in this eye's local frame) makes the pupil
  // track the mouse; without it pupils fall back to static placement.
  function drawEye(ctx, rng, r, type, f, gaze) {
    switch (type) {
      case 'dot':
        S.fillEllipse(ctx, rng, 0, 0, r * 0.45, r * 0.55, { wobble: 0.35, steps: 8 });
        break;
      case 'open':
        S.sketchEllipse(ctx, rng, 0, 0, r, r * 1.05, { wobble: 0.55, steps: 10 });
        if (gaze) {
          S.fillEllipse(ctx, rng,
            gaze.x * r * 0.42 + (rng.next() - 0.5) * r * 0.14,
            gaze.y * r * 0.42 + (rng.next() - 0.3) * r * 0.12,
            r * 0.32, r * 0.38, { wobble: 0.3, steps: 7 });
        } else {
          S.fillEllipse(ctx, rng,
            (rng.next() - 0.5) * r * 0.7,
            (rng.next() - 0.3) * r * 0.5,
            r * 0.32, r * 0.38, { wobble: 0.3, steps: 7 });
        }
        break;
      case 'wide':
        S.sketchEllipse(ctx, rng, 0, 0, r * 1.35, r * 1.45, { wobble: 0.65, steps: 12 });
        S.fillEllipse(ctx, rng,
          gaze ? gaze.x * r * 0.5 : 0,
          r * 0.15 + (gaze ? gaze.y * r * 0.4 : 0),
          r * 0.3, r * 0.36, { wobble: 0.3, steps: 7 });
        break;
      case 'closed': // sleepy lid: curve bowing down
        S.sketchArc(ctx, rng, 0, -r * 0.5, r * 1.15, r * 1.15, PI * 0.15, PI * 0.85, { wobble: 0.45, steps: 5 });
        break;
      case 'half': // heavy lid over a small pupil
        S.sketchLine(ctx, rng, -r, -r * 0.55, r, -r * 0.4, 0.45);
        S.fillEllipse(ctx, rng,
          gaze ? gaze.x * r * 0.3 : 0,
          r * 0.3 + (gaze ? gaze.y * r * 0.25 : 0),
          r * 0.4, r * 0.45, { wobble: 0.3, steps: 7 });
        break;
      case 'look': // pupil glancing — follows the mouse when it can
        S.sketchEllipse(ctx, rng, 0, 0, r, r * 1.05, { wobble: 0.55, steps: 10 });
        S.fillEllipse(ctx, rng,
          gaze ? gaze.x * r * 0.45 : r * 0.45 * f.lookDir,
          gaze ? gaze.y * r * 0.45 : 0,
          r * 0.32, r * 0.38, { wobble: 0.3, steps: 7 });
        break;
    }
  }

  function drawEyes(ctx, rng, f) {
    withFrame(ctx, f.view.pts.eyeL, function () {
      const t = f.eyeType;
      drawEye(ctx, rng, f.eyeR, t === 'wink' ? 'closed' : t, f, f.gazeL);
    });
    withFrame(ctx, f.view.pts.eyeR, function () {
      const t = f.eyeType;
      drawEye(ctx, rng, f.eyeR, t === 'wink' ? 'open' : t, f, f.gazeR);
    });
  }

  // ---------- brows -----------------------------------------------------

  function drawBrows(ctx, rng, f) {
    const type = f.browType;
    if (type === 'none') return;
    const len = Math.max(3.5, f.eyeR * 1.5);

    if (type === 'unibrow') {
      if (!f.view.pts.eyeL.vis || !f.view.pts.eyeR.vis) return;
      // One stroke across both brows, drawn in the left eye's frame so
      // it foreshortens with the turn.
      withFrame(ctx, f.view.pts.eyeL, function () {
        S.sketchLine(ctx, rng, -len, 0.6, 2 * f.eyeDX + len, -0.2, 0.55);
      });
      return;
    }

    for (const name of ['browL', 'browR']) {
      const side = name === 'browL' ? -1 : 1;
      withFrame(ctx, f.view.pts[name], function () {
        if (type === 'straight') {
          S.sketchLine(ctx, rng, -len, 0.4 * side, len, -0.4 * side, 0.45);
        } else if (type === 'angry') { // inner ends pulled down
          S.sketchLine(ctx, rng, side * len, -1.6, -side * len, 1.3, 0.45);
        } else if (type === 'raised') {
          S.sketchArc(ctx, rng, 0, 1.8, len, 2.4, PI * 1.12, PI * 1.88, { wobble: 0.45, steps: 5 });
        } else if (type === 'bushy') {
          S.hatchRegion(ctx, rng, [
            [-len, -1.7], [len, -1.3],
            [len * 0.85, 1.7], [-len * 0.85, 1.5]
          ], { spacing: 1.3, angle: 0.35 });
        }
      });
    }
  }

  // ---------- nose --------------------------------------------------------

  function drawNose(ctx, rng, f) {
    withFrame(ctx, f.view.pts.nose, function () {
      const L = f.noseLen;
      switch (f.noseType) {
        case 'line':
          S.sketchLine(ctx, rng, 0, 0, (rng.next() - 0.5) * 2, L, 0.55);
          break;
        case 'hook':
          S.sketchPolyline(ctx, rng, [[0, 0], [1.5, L], [-1.5, L + 1.6]], 0.45);
          break;
        case 'l':
          S.sketchPolyline(ctx, rng, [[0, 0], [0, L], [3.4, L + 0.3]], 0.45);
          break;
        case 'curve':
          S.sketchArc(ctx, rng, 2.4, L * 0.35, 3.4, L * 0.75, PI * 0.45, PI * 1.35, { wobble: 0.45, steps: 6 });
          break;
        case 'blob':
          S.sketchEllipse(ctx, rng, 0, L * 0.45, 3.4, 2.7, { wobble: 0.55, steps: 9 });
          break;
        case 'big':
          S.sketchArc(ctx, rng, 0, 0, 4.6, L, PI * 0.08, PI * 0.92, { wobble: 0.55, steps: 7 });
          S.sketchArc(ctx, rng, -2.2, L * 0.75, 1.7, 1.3, PI * 0.15, PI * 1.05, { wobble: 0.35, steps: 4 });
          break;
        case 'dots':
          S.fillEllipse(ctx, rng, -1.9, L, 0.85, 0.7, { wobble: 0.2, steps: 6 });
          S.fillEllipse(ctx, rng, 1.9, L, 0.85, 0.7, { wobble: 0.2, steps: 6 });
          break;
      }
    });
  }

  // ---------- mouth ---------------------------------------------------------

  function drawMouth(ctx, rng, f) {
    withFrame(ctx, f.view.pts.mouth, function () {
      const w = f.mouthW;
      switch (f.mouthType) {
        case 'smile':
          S.sketchArc(ctx, rng, 0, -2.2, w, w * 0.6, PI * 0.15, PI * 0.85, { wobble: 0.45, steps: 6 });
          break;
        case 'grin': { // open smile: paper-filled lens with a teeth line
          const region = [[-w, -0.6], [w, -0.6]];
          const steps = 8;
          for (let i = 0; i <= steps; i++) {
            const a = PI * 0.12 + (PI * 0.76 * i) / steps;
            region.push([Math.cos(a) * w * 1.02, -1.6 + Math.sin(a) * w * 0.62]);
          }
          const prev = ctx.fillStyle;
          ctx.fillStyle = f.paper;
          S.fillClosed(ctx, rng, region, 0.45);
          ctx.fillStyle = prev;
          S.sketchClosed(ctx, rng, region, 0.45);
          S.sketchLine(ctx, rng, -w * 0.82, -0.6, w * 0.82, -0.6, 0.3);
          break;
        }
        case 'frown':
          S.sketchArc(ctx, rng, 0, 2.6, w * 0.85, w * 0.55, PI * 1.15, PI * 1.85, { wobble: 0.45, steps: 6 });
          break;
        case 'flat':
          S.sketchLine(ctx, rng, -w * 0.75, 0, w * 0.75, (rng.next() - 0.5) * 1.2, 0.45);
          break;
        case 'wave':
          S.sketchPolyline(ctx, rng,
            [[-w * 0.85, 0], [-w * 0.3, -1.6], [w * 0.25, 1.6], [w * 0.85, -0.6]], 0.35);
          break;
        case 'o':
          S.sketchEllipse(ctx, rng, 0, 0, w * 0.24, w * 0.34, { wobble: 0.4, steps: 9 });
          break;
        case 'open':
          S.fillEllipse(ctx, rng, 0, 0, w * 0.48, w * 0.34, { wobble: 0.45, steps: 9 });
          break;
      }
    });
  }

  // ---------- hair -------------------------------------------------------------

  // Region covering the top of the head down to a hairline at
  // `drop` (fraction of ry below the crown). Closed by a chord.
  function hairCapRegion(f, drop) {
    const k = Math.asin(Math.max(-0.95, Math.min(0.95, drop)));
    const a0 = PI + k, a1 = 2 * PI - k;
    const pts = [];
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push([f.cx + Math.cos(a) * f.rx * 1.03, f.cy + Math.sin(a) * f.ry * 1.03]);
    }
    return pts;
  }

  function drawHair(ctx, rng, f) {
    const t = f.hairType;
    const topY = f.cy - f.ry;
    const V = f.view;

    if (t === 'bald') {
      if (rng.chance(0.55)) { // a few lonely strands
        for (let i = 0; i < 3; i++) {
          withFrame(ctx, V.pts['strand' + i], function () {
            S.sketchLine(ctx, rng, (rng.next() - 0.5) * 2, 0,
              (rng.next() - 0.5) * 4, -3 - rng.next() * 3, 0.35);
          });
        }
      }
      return;
    }

    if (t === 'short') {
      S.hatchRegion(ctx, rng, mapped(f, 'hair', hairCapRegion(f, f.hairDrop)),
        { spacing: 3.2 + rng.next() * 0.8, angle: -0.5 + rng.next() * 0.35, outline: true });
      return;
    }

    if (t === 'buzz') { // light stubble-like hatch hugging the skull
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = prev * 0.5;
      S.hatchRegion(ctx, rng, mapped(f, 'hair', hairCapRegion(f, 0.3)), { spacing: 2.4, angle: -0.6, outline: true });
      ctx.globalAlpha = prev;
      return;
    }

    if (t === 'spiky') {
      const n = 8 + Math.floor(rng.next() * 4); // even → both ends at base
      const yBase = f.cy - f.ry * 0.5;
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const x = f.cx - f.rx * 0.92 + (f.rx * 1.84 * i) / n;
        pts.push([x, i % 2 === 0 ? yBase + 2 : yBase - 5 - rng.next() * 6]);
      }
      pts.push([f.cx + f.rx * 0.94, f.cy - f.ry * 0.18]);
      pts.push([f.cx - f.rx * 0.94, f.cy - f.ry * 0.18]);
      S.hatchRegion(ctx, rng, mapped(f, 'hair', pts), { spacing: 2.8, angle: -0.5, outline: true });
      return;
    }

    if (t === 'curly') {
      S.hatchRegion(ctx, rng, mapped(f, 'hair', hairCapRegion(f, f.hairDrop)), { spacing: 3.4, angle: -0.5, outline: true });
      const n = 6 + Math.floor(rng.next() * 3);
      for (let i = 0; i < n; i++) {
        withFrame(ctx, V.pts['curl' + i], function () {
          S.sketchArc(ctx, rng, 0, 1.2, 2.7, 2.3, PI, PI * 2, { wobble: 0.35, steps: 5 });
        });
      }
      return;
    }

    if (t === 'sidepart') {
      S.hatchRegion(ctx, rng, mapped(f, 'hair', hairCapRegion(f, f.hairDrop)), { spacing: 3.2, angle: -0.5, outline: true });
      const px = (rng.chance(0.5) ? -1 : 1) * f.rx * 0.35;
      const p1 = V.frameMap(V.pts.hair, px, -f.ry * 1.03);
      const p2 = V.frameMap(V.pts.hair, px + (rng.next() - 0.5) * 5, -f.ry * f.hairDrop);
      S.sketchLine(ctx, rng, p1[0], p1[1], p2[0], p2[1], 0.45);
      return;
    }

    if (t === 'afro') {
      withFrame(ctx, V.pts.hair, function () {
        S.scribbleEllipse(ctx, rng, 0, -2, f.rx * 1.3, f.ry * 0.45, { loops: 13 });
      });
      return;
    }

    if (t === 'flat') {
      const yTop = topY - 1 - rng.next() * 3;
      S.hatchRegion(ctx, rng, mapped(f, 'hair', [
        [f.cx - f.rx * 0.96, f.cy - f.ry * 0.3],
        [f.cx - f.rx * 1.02, yTop],
        [f.cx + f.rx * 1.02, yTop],
        [f.cx + f.rx * 0.96, f.cy - f.ry * 0.3]
      ]), { spacing: 3, angle: -0.35, outline: true });
      return;
    }

    if (t === 'receding') { // two thinning patches at the temples
      for (const side of [-1, 1]) {
        S.hatchRegion(ctx, rng, mapped(f, side < 0 ? 'hairL' : 'hairR', [
          [f.cx + side * f.rx * 0.98, f.cy - f.ry * 0.12],
          [f.cx + side * f.rx * 0.85, f.cy - f.ry * 0.72],
          [f.cx + side * f.rx * 0.3, f.cy - f.ry * 0.98],
          [f.cx + side * f.rx * 0.22, f.cy - f.ry * 0.42]
        ]), { spacing: 2.6, angle: side * 0.5, outline: true });
      }
      return;
    }

    if (t === 'long') {
      S.hatchRegion(ctx, rng, mapped(f, 'hair', hairCapRegion(f, 0.32)), { spacing: 3.4, angle: -0.5, outline: true });
      for (const side of [-1, 1]) {
        S.hatchRegion(ctx, rng, mapped(f, side < 0 ? 'lockL' : 'lockR', [
          [f.cx + side * f.rx * 1.0, f.cy - f.ry * 0.55],
          [f.cx + side * f.rx * 1.2, f.cy - f.ry * 0.15],
          [f.cx + side * f.rx * 1.16, f.cy + f.ry * 0.72],
          [f.cx + side * f.rx * 0.84, f.cy + f.ry * 0.66],
          [f.cx + side * f.rx * 0.86, f.cy - f.ry * 0.05]
        ]), { spacing: 3.4, angle: side * 0.12, outline: true });
      }
      return;
    }

    if (t === 'mohawk') {
      const n = 6;
      const x0 = f.cx - f.rx * 0.34, x1 = f.cx + f.rx * 0.34;
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        pts.push([x, i % 2 === 0 ? f.cy - f.ry * 0.6 : topY - 3 - rng.next() * 6]);
      }
      pts.push([x1 + 2.5, f.cy - f.ry * 0.42]);
      pts.push([x0 - 2.5, f.cy - f.ry * 0.42]);
      S.hatchRegion(ctx, rng, mapped(f, 'hair', pts), { spacing: 2.4, angle: -0.15, outline: true });
      return;
    }
  }

  // ---------- facial hair ---------------------------------------------------------

  function drawFacialHair(ctx, rng, f) {
    const t = f.facialHair;
    if (!t) return;

    if (t === 'mustache') {
      const y = Math.min(f.mouthY - 5, f.noseY + f.noseLen + 2.5);
      const w = f.mouthW * 0.8;
      S.hatchRegion(ctx, rng, mapped(f, 'mustache', [
        [f.cx - w, y + 1.2], [f.cx - w * 0.3, y - 1.6],
        [f.cx + w * 0.3, y - 1.6], [f.cx + w, y + 1.2],
        [f.cx + w * 0.4, y + 3.6], [f.cx - w * 0.4, y + 3.6]
      ]), { spacing: 1.9, angle: 0.25, outline: true });
      return;
    }

    if (t === 'goatee') {
      const y = Math.min(f.mouthY + 6, f.cy + f.ry - 6);
      S.hatchRegion(ctx, rng, mapped(f, 'goatee', [
        [f.cx - 4.6, y - 2.2], [f.cx + 4.6, y - 2.2],
        [f.cx + 3.2, y + 6], [f.cx - 3.2, y + 6]
      ]), { spacing: 2, angle: -0.4, outline: true });
      return;
    }

    if (t === 'beard') { // crescent along the jaw
      const outer = [];
      const inner = [];
      const steps = 10;
      const a0 = PI * 0.12, a1 = PI * 0.88;
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps;
        outer.push([f.cx + Math.cos(a) * f.rx * 1.06, f.cy + Math.sin(a) * f.ry * 1.06]);
      }
      for (let i = steps; i >= 0; i--) {
        const a = a0 + ((a1 - a0) * i) / steps;
        inner.push([f.cx + Math.cos(a) * f.rx * 0.78, f.cy + f.ry * 0.05 + Math.sin(a) * f.ry * 0.8]);
      }
      S.hatchRegion(ctx, rng, mapped(f, 'beard', outer.concat(inner)), { spacing: 2.6, angle: 0.5, outline: true });
      return;
    }

    if (t === 'stubble') {
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = prev * 0.4;
      withFrame(ctx, f.view.pts.stubble, function () {
        S.dotScatter(ctx, rng, 0, 0, f.rx * 0.62, f.ry * 0.26, 42);
      });
      ctx.globalAlpha = prev;
      return;
    }
  }

  // ---------- glasses ----------------------------------------------------------------

  function drawGlasses(ctx, rng, f) {
    const t = f.glasses;
    if (!t) return;
    const r = Math.max(f.eyeR * 1.5, 5);
    const vl = f.view.pts.eyeL, vr = f.view.pts.eyeR;
    const el = f.view.pts.earL, er = f.view.pts.earR;

    for (const pair of [['eyeL', -1], ['eyeR', 1]]) {
      withFrame(ctx, f.view.pts[pair[0]], function () {
        if (t === 'round') {
          S.sketchEllipse(ctx, rng, 0, 0, r, r, { wobble: 0.5, steps: 11 });
        } else if (t === 'square') {
          const s = r * 0.95;
          S.sketchClosed(ctx, rng, [
            [-s, -s * 0.85], [s, -s * 0.85], [s, s * 0.85], [-s, s * 0.85]
          ], 0.45);
        } else if (t === 'sunglasses') {
          const prev = ctx.globalAlpha;
          ctx.globalAlpha = prev * 0.55;
          S.fillEllipse(ctx, rng, 0, 0, r * 1.15, r * 1.05, { wobble: 0.45, steps: 10 });
          ctx.globalAlpha = prev;
          S.sketchEllipse(ctx, rng, 0, 0, r * 1.15, r * 1.05, { wobble: 0.45, steps: 10 });
        }
      });
    }

    // Bridge between the inner edges of the lenses.
    if (vl.vis && vr.vis) {
      const hw = t === 'square' ? r * 0.95 : t === 'sunglasses' ? r * 1.15 : r;
      const p1 = f.view.frameMap(vl, hw - 0.5, -1);
      const p2 = f.view.frameMap(vr, -hw + 0.5, -1);
      if (t === 'round') {
        const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
        const half = Math.max(2, Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2);
        S.sketchArc(ctx, rng, mx, my, half, half * 0.9, PI * 1.05, PI * 1.95, { wobble: 0.35, steps: 4 });
      } else {
        S.sketchLine(ctx, rng, p1[0], p1[1], p2[0], p2[1], 0.4);
      }
    }

    // Temples out to the ears (round & square only).
    if (t !== 'sunglasses') {
      const hw = t === 'square' ? r * 0.95 : r;
      if (vl.vis && el.vis) {
        const p1 = f.view.frameMap(vl, -hw, 0);
        S.sketchLine(ctx, rng, p1[0], p1[1], el.ax, el.ay, 0.4);
      }
      if (vr.vis && er.vis) {
        const p1 = f.view.frameMap(vr, hw, 0);
        S.sketchLine(ctx, rng, p1[0], p1[1], er.ax, er.ay, 0.4);
      }
    }
  }

  // ---------- hats ---------------------------------------------------------------------

  function drawHat(ctx, rng, f) {
    const t = f.hat;
    if (!t) return;
    const topY = f.cy - f.ry;
    const V = f.view;

    if (t === 'cap') {
      const dome = [];
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const a = PI + (PI * i) / steps;
        dome.push([f.cx + Math.cos(a) * f.rx * 1.08, topY + 6 + Math.sin(a) * f.ry * 0.6]);
      }
      S.hatchRegion(ctx, rng, mapped(f, 'hat', dome), { spacing: 3, angle: -0.4, outline: true });
      withFrame(ctx, V.pts.brimSide, function () { // brim on one side
        S.sketchArc(ctx, rng, 0, 0, f.rx * 0.55, f.ry * 0.2, PI * 0.05, PI * 0.95, { wobble: 0.45, steps: 6 });
      });
      const b1 = V.frameMap(V.pts.brim, -f.rx * 1.06, 0);
      const b2 = V.frameMap(V.pts.brim, f.rx * 1.06, 0);
      S.sketchLine(ctx, rng, b1[0], b1[1], b2[0], b2[1], 0.45);
      return;
    }

    if (t === 'beanie') {
      const dome = [];
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const a = PI + (PI * i) / steps;
        dome.push([f.cx + Math.cos(a) * f.rx * 1.06, topY + 8 + Math.sin(a) * f.ry * 0.62]);
      }
      S.hatchRegion(ctx, rng, mapped(f, 'hat', dome), { spacing: 3.2, angle: -0.5, outline: true });
      const l1a = V.frameMap(V.pts.hat, -f.rx * 1.04, 2);
      const l1b = V.frameMap(V.pts.hat, f.rx * 1.04, 2);
      S.sketchLine(ctx, rng, l1a[0], l1a[1], l1b[0], l1b[1], 0.45);
      const l2a = V.frameMap(V.pts.hat, -f.rx * 1.0, 6);
      const l2b = V.frameMap(V.pts.hat, f.rx * 1.0, 6);
      S.sketchLine(ctx, rng, l2a[0], l2a[1], l2b[0], l2b[1], 0.45);
      const pom = V.frameMap(V.pts.hat, 0, 2 - f.ry * 0.62);
      S.sketchEllipse(ctx, rng, pom[0], pom[1], 3.4, 3.1, { wobble: 0.45, steps: 9 });
      return;
    }

    if (t === 'flat') {
      const dome = [];
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const a = PI + (PI * i) / steps;
        dome.push([f.cx + Math.cos(a) * f.rx * 1.05, topY + 7 + Math.sin(a) * f.ry * 0.4]);
      }
      S.hatchRegion(ctx, rng, mapped(f, 'hat', dome), { spacing: 3, angle: -0.35, outline: true });
      withFrame(ctx, V.pts.brimSide, function () {
        S.sketchArc(ctx, rng, 0, 0, f.rx * 0.5, f.ry * 0.16, PI * 0.05, PI * 0.95, { wobble: 0.4, steps: 5 });
      });
      const b1 = V.frameMap(V.pts.brim, -f.rx * 1.03, 0);
      const b2 = V.frameMap(V.pts.brim, f.rx * 1.03, 0);
      S.sketchLine(ctx, rng, b1[0], b1[1], b2[0], b2[1], 0.45);
      return;
    }

    if (t === 'bucket') {
      const dome = [];
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const a = PI + (PI * i) / steps;
        dome.push([f.cx + Math.cos(a) * f.rx * 1.0, topY + 9 + Math.sin(a) * f.ry * 0.52]);
      }
      S.hatchRegion(ctx, rng, mapped(f, 'hat', dome), { spacing: 3.2, angle: -0.5, outline: true });
      withFrame(ctx, V.pts.brim, function () { // brim wraps all the way round
        S.sketchArc(ctx, rng, 0, 0, f.rx * 1.18, f.ry * 0.2, PI * 1.03, PI * 1.97, { wobble: 0.45, steps: 8 });
        S.sketchArc(ctx, rng, 0, 0, f.rx * 1.18, f.ry * 0.2, PI * 0.03, PI * 0.97, { wobble: 0.45, steps: 8 });
      });
      return;
    }
  }

  // ---------- extras -----------------------------------------------------------------------

  function drawExtras(ctx, rng, f) {
    if (f.blush) {
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = prev * 0.16;
      withFrame(ctx, f.view.pts.blushL, function () {
        S.fillEllipse(ctx, rng, 0, 0, 4.6, 2.6, { wobble: 0.5, steps: 8 });
      });
      withFrame(ctx, f.view.pts.blushR, function () {
        S.fillEllipse(ctx, rng, 0, 0, 4.6, 2.6, { wobble: 0.5, steps: 8 });
      });
      ctx.globalAlpha = prev;
    }
    if (f.freckles) {
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = prev * 0.55;
      withFrame(ctx, f.view.pts.blushL, function () {
        S.dotScatter(ctx, rng, 0, -1, 4, 2.4, 8);
      });
      withFrame(ctx, f.view.pts.blushR, function () {
        S.dotScatter(ctx, rng, 0, -1, 4, 2.4, 8);
      });
      ctx.globalAlpha = prev;
    }
    if (f.wrinkles) {
      const n = 1 + Math.floor(rng.next() * 2);
      withFrame(ctx, f.view.pts.wrinkle, function () {
        for (let i = 0; i < n; i++) {
          const w = f.rx * (0.52 - i * 0.1);
          S.sketchArc(ctx, rng, 0, 2.2 - i * 4.5, w, 2.6, PI * 1.12, PI * 1.88, { wobble: 0.35, steps: 5 });
        }
      });
    }
    if (f.earring && f.ears) {
      const name = rng.chance(0.5) ? 'earL' : 'earR';
      const pt = f.view.pts[name];
      withFrame(ctx, pt, function () {
        S.sketchEllipse(ctx, rng, 0, f.ry * 0.12, 1.5, 1.9, { wobble: 0.3, steps: 8 });
      }, [pt.nx, pt.ny, pt.sx, pt.sy]);
    }
  }

  // ---------- neck ------------------------------------------------------------------------------

  function drawNeck(ctx, rng, f) {
    if (!f.neck) return;
    const chinY = f.view.bbox.maxY - 1; // hang from the lowest skull point
    const nw = f.rx * 0.4;
    S.sketchLine(ctx, rng, f.cx - nw, chinY - 3, f.cx - nw - 1.5, chinY + 10, 0.55);
    S.sketchLine(ctx, rng, f.cx + nw, chinY - 3, f.cx + nw + 1.5, chinY + 10, 0.55);
    if (f.shoulders) {
      S.sketchArc(ctx, rng, f.cx, chinY + 34, f.rx * 1.55, f.ry * 0.6,
        PI * 1.15, PI * 1.85, { wobble: 0.55, steps: 7 });
    }
  }

  global.DoodlyParts = {
    drawHead: drawHead,
    drawEars: drawEars,
    drawEyes: drawEyes,
    drawBrows: drawBrows,
    drawNose: drawNose,
    drawMouth: drawMouth,
    drawHair: drawHair,
    drawFacialHair: drawFacialHair,
    drawGlasses: drawGlasses,
    drawHat: drawHat,
    drawExtras: drawExtras,
    drawNeck: drawNeck
  };
})(window);