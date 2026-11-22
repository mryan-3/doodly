/* head3d.js — the invisible 3D head.
   The face is modeled as a shape-modulated ellipsoid ("skull") centered
   in face space. Features live at fixed (longitude, latitude) anchors on
   its surface. A pose (yaw, pitch, roll) rotates the skull; anchors and
   their local tangent frames rotate with it and are orthographically
   projected — foreshortening falls out of the projection for free, and
   a feature is visible only while its surface normal still faces the
   viewer (things melt away past the terminator, like a real head). */
(function (global) {
  'use strict';

  const DEG = Math.PI / 180;

  // Width/height modulation per head shape (mirrors the old 2D blobs:
  // egg narrows the chin, pear widens it, long/wide rescale axes).
  function shapeMods(shape, sinLat) {
    let wx = 1, wy = 1;
    if (shape === 'egg') wx = 1 - 0.22 * Math.max(0, sinLat);
    else if (shape === 'pear') wx = 1 + 0.16 * Math.max(0, sinLat) - 0.06 * Math.max(0, -sinLat);
    else if (shape === 'long') { wx = 0.93; wy = 1.08; }
    else if (shape === 'wide') { wx = 1.1; wy = 0.9; }
    return [wx, wy];
  }

  // Yaw about the vertical axis, then pitch about the horizontal axis.
  function makeRotator(yawRad, pitchRad) {
    const cy = Math.cos(yawRad), sy = Math.sin(yawRad);
    const cp = Math.cos(pitchRad), sp = Math.sin(pitchRad);
    return {
      apply: function (p) {
        const x1 = p[0] * cy + p[2] * sy;
        const z1 = -p[0] * sy + p[2] * cy;
        return [x1, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp];
      },
      applyInv: function (v) {
        const y1 = v[1] * cp + v[2] * sp;
        const z1 = -v[1] * sp + v[2] * cp;
        return [v[0] * cy - z1 * sy, y1, v[0] * sy + z1 * cy];
      }
    };
  }

  function unit3(v) {
    const L = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / L, v[1] / L, v[2] / L];
  }

  // Surface point, head-local coords: x right, y up, z toward viewer.
  // lon 0 = front, lat 0 = equator, lat +90 = crown, -90 = chin.
  function makeSurface(a, b, c, shape) {
    return function (lon, lat) {
      const cl = Math.cos(lat), sl = Math.sin(lat);
      const m = shapeMods(shape, sl);
      return [a * m[0] * cl * Math.sin(lon), b * m[1] * sl, c * cl * Math.cos(lon)];
    };
  }

  // Outward normal via central differences (robust to shape modulation).
  function surfaceNormal(surf, lon, lat) {
    const e = 0.01;
    const pu = surf(lon + e, lat), mu = surf(lon - e, lat);
    const pv = surf(lon, lat + e), mv = surf(lon, lat - e);
    const du = [pu[0] - mu[0], pu[1] - mu[1], pu[2] - mu[2]];
    const dv = [pv[0] - mv[0], pv[1] - mv[1], pv[2] - mv[2]];
    return unit3([
      du[1] * dv[2] - du[2] * dv[1],
      du[2] * dv[0] - du[0] * dv[2],
      du[0] * dv[1] - du[1] * dv[0]
    ]);
  }

  // Andrew's monotone chain convex hull — heads are convex blobs, so the
  // hull of the projected front-facing surface IS the exact silhouette.
  function convexHull(pts) {
    if (pts.length < 3) return pts.slice();
    const p = pts.slice().sort(function (u, v) { return u[0] - v[0] || u[1] - v[1]; });
    function cross(o, a, b) {
      return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    }
    const lo = [];
    for (let i = 0; i < p.length; i++) {
      while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p[i]) <= 0) lo.pop();
      lo.push(p[i]);
    }
    const hi = [];
    for (let i = p.length - 1; i >= 0; i--) {
      while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p[i]) <= 0) hi.pop();
      hi.push(p[i]);
    }
    lo.pop(); hi.pop();
    return lo.concat(hi);
  }

  // Build the projected 2D view of a posed head.
  // cfg: {
  //   cx, cy            head center in face space
  //   a, b, c           skull radii: width, height, depth
  //   shape             head shape key ('round' | 'egg' | ...)
  //   yaw, pitch, roll  pose in degrees
  //   anchors           { name: { lon, lat, margin } }  degrees
  //   patches           { name: { lon, lat, margin } }  degrees
  // }
  // Each anchor/patch becomes { ax, ay, ex, ey, sx, sy, nx, ny, nz, vis }:
  // screen position, unit east/south/normal basis vectors (2D, after
  // roll; south = local +y = "down the face"), depth of the normal, and
  // visibility (normal.z > margin). Also returns `hull` (the head
  // outline), `bbox`, and frameMap(pt, dx, dy) for placing head-relative
  // geometry onto a patch.
  function buildView(cfg) {
    const cx = cfg.cx, cy = cfg.cy;
    const rot = makeRotator(cfg.yaw * DEG, cfg.pitch * DEG);
    const surf = makeSurface(cfg.a, cfg.b, cfg.c, cfg.shape);
    const cr = Math.cos(cfg.roll * DEG), sr = Math.sin(cfg.roll * DEG);

    // Roll pivots the finished 2D projection about the head center.
    function rollPt(x, y) {
      const dx = x - cx, dy = y - cy;
      return [cx + dx * cr - dy * sr, cy + dx * sr + dy * cr];
    }
    function toScreen(pWorld) {
      return rollPt(cx + pWorld[0], cy - pWorld[1]); // 3D y-up → canvas y-down
    }
    function rollVec(v) { return [v[0] * cr - v[1] * sr, v[0] * sr + v[1] * cr]; }

    function makeFrame(name, spec) {
      const lon = spec.lon * DEG, lat = spec.lat * DEG;
      const nW = rot.apply(surfaceNormal(surf, lon, lat));
      const pos = toScreen(rot.apply(surf(lon, lat)));

      // Tangent frame: unit east (along increasing lon) and north
      // (upslope), rotated and projected — the projection itself
      // provides foreshortening. South = -north so local +y is down.
      const e = 0.01;
      const pu = surf(lon + e, lat), mu = surf(lon - e, lat);
      const pv = surf(lon, lat + e), mv = surf(lon, lat - e);
      const east = rot.apply(unit3([pu[0] - mu[0], pu[1] - mu[1], pu[2] - mu[2]]));
      const north = rot.apply(unit3([pv[0] - mv[0], pv[1] - mv[1], pv[2] - mv[2]]));
      const e2 = rollVec([east[0], -east[1]]);
      const s2 = rollVec([-north[0], north[1]]);
      const n2 = rollVec([nW[0], -nW[1]]);

      const margin = spec.margin == null ? 0.06 : spec.margin;
      return {
        name: name,
        ax: pos[0], ay: pos[1],
        ex: e2[0], ey: e2[1],
        sx: s2[0], sy: s2[1],
        nx: n2[0], ny: n2[1],
        nz: nW[2],
        vis: nW[2] > margin
      };
    }

    // --- silhouette: dense front-facing sample → convex hull -------------
    const LON_STEPS = 44, LAT_STEPS = 26;
    const cloud = [];
    for (let i = 0; i < LON_STEPS; i++) {
      const lon = -Math.PI + ((i + 0.5) / LON_STEPS) * Math.PI * 2;
      for (let j = 0; j < LAT_STEPS; j++) {
        const lat = -Math.PI / 2 + ((j + 0.5) / LAT_STEPS) * Math.PI;
        if (rot.apply(surfaceNormal(surf, lon, lat))[2] <= 0) continue;
        cloud.push(toScreen(rot.apply(surf(lon, lat))));
      }
    }
    const hull = convexHull(cloud);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < hull.length; i++) {
      if (hull[i][0] < minX) minX = hull[i][0];
      if (hull[i][0] > maxX) maxX = hull[i][0];
      if (hull[i][1] < minY) minY = hull[i][1];
      if (hull[i][1] > maxY) maxY = hull[i][1];
    }

    const view = {
      yaw: cfg.yaw, pitch: cfg.pitch, roll: cfg.roll,
      pts: {},
      hull: hull,
      bbox: { minX: minX, minY: minY, maxX: maxX, maxY: maxY },
      // Place head-centered geometry (old-style point lists around the
      // head center) onto a patch frame, keeping relative arrangement.
      frameMap: function (pt, dx, dy) {
        return [pt.ax + pt.ex * dx + pt.sx * dy, pt.ay + pt.ey * dx + pt.sy * dy];
      }
    };
    let name;
    for (name in cfg.anchors || {}) view.pts[name] = makeFrame(name, cfg.anchors[name]);
    for (name in cfg.patches || {}) view.pts[name] = makeFrame(name, cfg.patches[name]);
    return view;
  }

  global.DoodlyHead3D = { buildView: buildView, DEG: DEG };
})(window);