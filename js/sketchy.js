/* sketchy.js — the "hand-drawn" magic.
   Every line is sampled into small segments and nudged sideways by a
   little random jitter, then smoothed with quadratic curves. That wobble
   is what makes computer-drawn shapes look inked by hand. */
(function (global) {
  'use strict';

  // ---------- point helpers ------------------------------------------

  // Jitter the interior points of an open polyline, perpendicular to
  // the path. Endpoints stay put so lines still connect where intended.
  function wobblePoints(pts, rng, amount, subdivisions) {
    const sub = subdivisions || 4;
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const x1 = pts[i][0], y1 = pts[i][1];
      const x2 = pts[i + 1][0], y2 = pts[i + 1][1];
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      for (let s = 0; s < sub; s++) {
        const t = s / sub;
        if (i === 0 && s === 0) { out.push([x1, y1]); continue; }
        const w = (rng.next() - 0.5) * 2 * amount;
        out.push([x1 + dx * t + nx * w, y1 + dy * t + ny * w]);
      }
    }
    const last = pts[pts.length - 1];
    out.push([last[0], last[1]]);
    return out;
  }

  // Jitter every point of a closed loop (blobs, heads, hair caps).
  function wobbleClosed(pts, rng, amount, subdivisions) {
    const sub = subdivisions || 4;
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const x1 = pts[i][0], y1 = pts[i][1];
      const x2 = pts[(i + 1) % n][0], y2 = pts[(i + 1) % n][1];
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      for (let s = 0; s < sub; s++) {
        const t = s / sub;
        const w = (rng.next() - 0.5) * 2 * amount;
        out.push([x1 + dx * t + nx * w, y1 + dy * t + ny * w]);
      }
    }
    return out;
  }

  // Trace a smooth path through points using quadratic midpoints.
  // Does NOT call beginPath/stroke — caller controls path lifecycle,
  // which lets many traces share one stroke call.
  function tracePath(ctx, pts, close) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
    if (close) ctx.closePath();
  }

  // ---------- public drawing helpers ----------------------------------

  function sketchLine(ctx, rng, x1, y1, x2, y2, amount) {
    ctx.beginPath();
    tracePath(ctx, wobblePoints([[x1, y1], [x2, y2]], rng, amount == null ? 1.1 : amount, 5), false);
    ctx.stroke();
  }

  function sketchPolyline(ctx, rng, pts, amount) {
    ctx.beginPath();
    tracePath(ctx, wobblePoints(pts, rng, amount == null ? 1.1 : amount), false);
    ctx.stroke();
  }

  // Closed wobbly shape. passes > 1 overdraws it slightly offset —
  // the way sketchers go over a line twice.
  function sketchClosed(ctx, rng, pts, amount, passes) {
    const n = passes || 1;
    for (let p = 0; p < n; p++) {
      ctx.beginPath();
      tracePath(ctx, wobbleClosed(pts, rng, amount == null ? 1.1 : amount), true);
      ctx.stroke();
    }
  }

  function fillClosed(ctx, rng, pts, amount) {
    ctx.beginPath();
    tracePath(ctx, wobbleClosed(pts, rng, amount == null ? 1.1 : amount), true);
    ctx.fill();
  }

  function ellipsePoints(cx, cy, rx, ry, steps, rot) {
    const pts = [];
    const cos = Math.cos(rot || 0), sin = Math.sin(rot || 0);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      pts.push([cx + x * cos - y * sin, cy + x * sin + y * cos]);
    }
    return pts;
  }

  function sketchEllipse(ctx, rng, cx, cy, rx, ry, opts) {
    opts = opts || {};
    sketchClosed(ctx, rng, ellipsePoints(cx, cy, rx, ry, opts.steps || 14, opts.rot || 0), opts.wobble, opts.passes);
  }

  function fillEllipse(ctx, rng, cx, cy, rx, ry, opts) {
    opts = opts || {};
    fillClosed(ctx, rng, ellipsePoints(cx, cy, rx, ry, opts.steps || 12, opts.rot || 0), opts.wobble);
  }

  // A wobbly arc along an ellipse between two angles (radians).
  function sketchArc(ctx, rng, cx, cy, rx, ry, a0, a1, opts) {
    opts = opts || {};
    const steps = opts.steps || 6;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    ctx.beginPath();
    tracePath(ctx, wobblePoints(pts, rng, opts.wobble == null ? 0.7 : opts.wobble, 3), false);
    ctx.stroke();
  }

  // Parallel hatching clipped inside a closed region — used for hair,
  // beards, brows: reads as dense pencil strokes.
  function hatchRegion(ctx, rng, pts, opts) {
    opts = opts || {};
    const angle = opts.angle == null ? -0.7 : opts.angle;
    const spacing = opts.spacing || 3;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i][0] < minX) minX = pts[i][0];
      if (pts[i][0] > maxX) maxX = pts[i][0];
      if (pts[i][1] < minY) minY = pts[i][1];
      if (pts[i][1] > maxY) maxY = pts[i][1];
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const diag = Math.hypot(maxX - minX, maxY - minY) + spacing * 2;

    const boundary = wobbleClosed(pts, rng, 0.7);
    ctx.save();
    ctx.beginPath();
    tracePath(ctx, boundary, true);
    ctx.clip();

    ctx.beginPath();
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const px = -dy, py = dx;
    const half = diag / 2;
    for (let d = -half; d <= half; d += spacing) {
      const sx = cx + px * d, sy = cy + py * d;
      tracePath(ctx, wobblePoints(
        [[sx - dx * half, sy - dy * half], [sx + dx * half, sy + dy * half]],
        rng, 0.8, 6
      ), false);
    }
    ctx.stroke();
    ctx.restore();

    // Optionally stroke the region boundary so hatched masses
    // (hair, beards, hats) read as drawn shapes, not shadows.
    if (opts.outline) {
      ctx.beginPath();
      tracePath(ctx, boundary, true);
      ctx.stroke();
    }
  }

  // Overlapping scribbly loops clipped to an ellipse — scribbled hair.
  function scribbleEllipse(ctx, rng, cx, cy, rx, ry, opts) {
    opts = opts || {};
    const loops = opts.loops || 12;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    for (let i = 0; i < loops; i++) {
      const a0 = rng.next() * Math.PI * 2;
      const turns = 1.1 + rng.next() * 1.4;
      const steps = 26;
      const ox = (rng.next() - 0.5) * rx;
      const oy = (rng.next() - 0.5) * ry;
      const scale = 0.75 + rng.next() * 0.4;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const a = a0 + t * turns * Math.PI * 2;
        const shrink = (1 - t * 0.45) * scale;
        const x = cx + ox + Math.cos(a) * rx * shrink;
        const y = cy + oy + Math.sin(a) * ry * shrink;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // Scatter small dots inside an ellipse (freckles, stubble).
  function dotScatter(ctx, rng, cx, cy, rx, ry, count) {
    for (let i = 0; i < count; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next());
      const x = cx + Math.cos(a) * rx * r;
      const y = cy + Math.sin(a) * ry * r;
      ctx.beginPath();
      ctx.ellipse(x, y, 0.5 + rng.next() * 0.4, 0.5 + rng.next() * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  global.DoodlySketchy = {
    wobblePoints: wobblePoints,
    wobbleClosed: wobbleClosed,
    tracePath: tracePath,
    sketchLine: sketchLine,
    sketchPolyline: sketchPolyline,
    sketchClosed: sketchClosed,
    fillClosed: fillClosed,
    ellipsePoints: ellipsePoints,
    sketchEllipse: sketchEllipse,
    fillEllipse: fillEllipse,
    sketchArc: sketchArc,
    hatchRegion: hatchRegion,
    scribbleEllipse: scribbleEllipse,
    dotScatter: dotScatter
  };
})(window);