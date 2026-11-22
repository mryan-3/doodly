/* svg.js — SVG export.
   A drop-in stand-in for a 2D canvas context that records every path,
   transform, style and clip into SVG markup. Feeding it to
   Face.drawFace produces a vector version of the exact same drawing,
   because the sketchy renderer only uses the small canvas-API subset
   implemented here. Transforms stay as transform attributes (so stroke
   widths foreshorten exactly like on canvas), and clip regions become
   <clipPath> defs. */
(function (global) {
  'use strict';

  function fmt(n) {
    return String(Math.round(n * 1000) / 1000);
  }

  // 2D affine matrix as [a, b, c, d, e, f].
  function identity() { return [1, 0, 0, 1, 0, 0]; }
  function mul(m, n) { // canvas semantics: CTM ← CTM × n
    return [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4],
      m[1] * n[4] + m[3] * n[5] + m[5]
    ];
  }
  function isIdentity(m) {
    return m[0] === 1 && m[1] === 0 && m[2] === 0 &&
      m[3] === 1 && m[4] === 0 && m[5] === 0;
  }
  function matrixAttr(m) {
    return 'matrix(' + m.map(fmt).join(',') + ')';
  }

  function makeContext(w, h) {
    let ctm = identity();
    const stack = [];
    let alpha = 1;
    let strokeStyle = '#000';
    let fillStyle = '#000';
    let lineWidth = 1;
    let lineCap = 'butt';
    let lineJoin = 'miter';

    let segs = [];   // current path: M/L/Q/C/Z segments in user coords
    const defs = []; // <clipPath> definitions
    const body = []; // emitted elements
    let clipSeq = 0;
    let clipId = null;

    function pathData() {
      let d = '';
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (s.t === 'M') d += 'M' + fmt(s.x) + ' ' + fmt(s.y);
        else if (s.t === 'L') d += 'L' + fmt(s.x) + ' ' + fmt(s.y);
        else if (s.t === 'Q') d += 'Q' + fmt(s.cx) + ' ' + fmt(s.cy) + ' ' + fmt(s.x) + ' ' + fmt(s.y);
        else if (s.t === 'C') d += 'C' + fmt(s.c1x) + ' ' + fmt(s.c1y) + ' ' +
          fmt(s.c2x) + ' ' + fmt(s.c2y) + ' ' + fmt(s.x) + ' ' + fmt(s.y);
        else if (s.t === 'Z') d += 'Z';
      }
      return d;
    }

    function emit(filled) {
      if (!segs.length) return;
      const attrs = ['d="' + pathData() + '"'];
      if (!isIdentity(ctm)) attrs.push('transform="' + matrixAttr(ctm) + '"');
      if (alpha < 1) attrs.push('opacity="' + fmt(alpha) + '"');
      if (clipId) attrs.push('clip-path="url(#' + clipId + ')"');
      if (filled) {
        attrs.push('stroke="none"', 'fill="' + fillStyle + '"');
      } else {
        attrs.push('fill="none"', 'stroke="' + strokeStyle + '"',
          'stroke-width="' + fmt(lineWidth) + '"',
          'stroke-linecap="' + lineCap + '"',
          'stroke-linejoin="' + lineJoin + '"');
      }
      body.push('<path ' + attrs.join(' ') + '/>');
    }

    const ctx = {
      canvas: { width: w, height: h },

      get globalAlpha() { return alpha; },
      set globalAlpha(v) { alpha = v; },
      get strokeStyle() { return strokeStyle; },
      set strokeStyle(v) { strokeStyle = v; },
      get fillStyle() { return fillStyle; },
      set fillStyle(v) { fillStyle = v; },
      get lineWidth() { return lineWidth; },
      set lineWidth(v) { lineWidth = v; },
      get lineCap() { return lineCap; },
      set lineCap(v) { lineCap = v; },
      get lineJoin() { return lineJoin; },
      set lineJoin(v) { lineJoin = v; },

      save: function () {
        stack.push({ ctm: ctm, alpha: alpha, strokeStyle: strokeStyle,
          fillStyle: fillStyle, lineWidth: lineWidth, lineCap: lineCap,
          lineJoin: lineJoin, clipId: clipId });
      },
      restore: function () {
        const s = stack.pop();
        if (!s) return;
        ctm = s.ctm; alpha = s.alpha; strokeStyle = s.strokeStyle;
        fillStyle = s.fillStyle; lineWidth = s.lineWidth;
        lineCap = s.lineCap; lineJoin = s.lineJoin; clipId = s.clipId;
      },

      translate: function (x, y) { ctm = mul(ctm, [1, 0, 0, 1, x, y]); },
      rotate: function (a) {
        const c = Math.cos(a), s = Math.sin(a);
        ctm = mul(ctm, [c, s, -s, c, 0, 0]);
      },
      scale: function (sx, sy) { ctm = mul(ctm, [sx, 0, 0, sy == null ? sx : sy, 0, 0]); },
      transform: function (a, b, c, d, e, f) { ctm = mul(ctm, [a, b, c, d, e, f]); },
      setTransform: function (a, b, c, d, e, f) { ctm = [a, b, c, d, e, f]; },

      beginPath: function () { segs = []; },
      moveTo: function (x, y) { segs.push({ t: 'M', x: x, y: y }); },
      lineTo: function (x, y) { segs.push({ t: 'L', x: x, y: y }); },
      quadraticCurveTo: function (cx, cy, x, y) {
        segs.push({ t: 'Q', cx: cx, cy: cy, x: x, y: y });
      },
      bezierCurveTo: function (c1x, c1y, c2x, c2y, x, y) {
        segs.push({ t: 'C', c1x: c1x, c1y: c1y, c2x: c2x, c2y: c2y, x: x, y: y });
      },
      closePath: function () { segs.push({ t: 'Z' }); },
      ellipse: function (x, y, rx, ry, rot, a0, a1) {
        // Sample the arc into short segments (invisible at these sizes).
        const start = a0 || 0;
        const end = a1 == null ? Math.PI * 2 : a1;
        const co = Math.cos(rot || 0), so = Math.sin(rot || 0);
        const steps = 28;
        for (let i = 0; i <= steps; i++) {
          const a = start + (end - start) * (i / steps);
          const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
          const px = x + ex * co - ey * so;
          const py = y + ex * so + ey * co;
          segs.push(i === 0 ? { t: 'M', x: px, y: py } : { t: 'L', x: px, y: py });
        }
      },
      rect: function (x, y, rw, rh) {
        segs.push({ t: 'M', x: x, y: y },
          { t: 'L', x: x + rw, y: y },
          { t: 'L', x: x + rw, y: y + rh },
          { t: 'L', x: x, y: y + rh },
          { t: 'Z' });
      },

      stroke: function () { emit(false); },
      fill: function () { emit(true); },

      // The clip boundary is stored in user coords; paths referencing it
      // carry the same transform, and SVG evaluates clip-paths in the
      // referencing element's user space — matching canvas exactly.
      clip: function () {
        if (!segs.length) return;
        clipSeq += 1;
        const id = 'doodly-clip-' + clipSeq;
        defs.push('<clipPath id="' + id + '"><path d="' + pathData() + '"/></clipPath>');
        clipId = id;
      },

      fillRect: function (x, y, rw, rh) {
        const saved = segs;
        segs = [];
        this.rect(x, y, rw, rh);
        emit(true);
        segs = saved;
      },

      // Serialize the recording so far.
      toSVG: function () {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w +
          '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
          (defs.length ? '<defs>' + defs.join('') + '</defs>' : '') +
          body.join('') +
          '</svg>';
      }
    };
    return ctx;
  }

  global.DoodlySVG = { makeContext: makeContext };
})(window);