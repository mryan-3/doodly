/* face.js — face recipes + composition.
   A "recipe" is the random blueprint of one face (which variants were
   picked, their tuning values, and the head's 3D pose). drawFace builds
   a projected view of the posed skull (via head3d.js) and layers the
   parts in painterly order inside a 100 x 120 face-space box. */
(function (global) {
  'use strict';
  const P = global.DoodlyParts;

  const INKS = {
    graphite: '#33302b',
    blue: '#2b4a7a',
    sepia: '#5a4030'
  };

  const PAPERS = {
    cream: '#f1ebdd',
    white: '#faf8f2',
    gray: '#e7e4dc'
  };

  // Face-space box dimensions.
  const BOX_W = 100;
  const BOX_H = 120;

  // Roll a complete face recipe from an rng.
  function makeRecipe(rng, seed) {
    const headShape = rng.weighted([
      ['round', 3], ['egg', 3], ['wide', 2], ['long', 2], ['pear', 1.5]
    ]);
    const rx = rng.float(24, 30) * (headShape === 'wide' ? 1.08 : headShape === 'long' ? 0.94 : 1);
    const ry = rng.float(30, 35) * (headShape === 'long' ? 1.08 : headShape === 'wide' ? 0.92 : 1);
    const rz = rx * rng.float(0.78, 0.92); // skull depth

    // 3D head pose (degrees): mostly near-frontal, occasional turns.
    function bell() { return (rng.next() + rng.next() + rng.next()) / 1.5 - 1; }
    let yaw = bell() * 62;
    if (rng.chance(0.16)) yaw = (rng.chance(0.5) ? -1 : 1) * (38 + rng.next() * 34);
    yaw = Math.max(-74, Math.min(74, yaw));
    const pose = {
      yaw: yaw,
      pitch: Math.max(-32, Math.min(32, bell() * 26)),
      roll: (rng.next() * 2 - 1) * 8
    };

    const eyeType = rng.weighted([
      ['open', 3], ['dot', 2], ['wide', 1.5], ['closed', 1.5],
      ['half', 1.5], ['look', 1.5], ['wink', 0.8]
    ]);
    const eyeDX = rng.float(10.5, 15);
    const eyeR = rng.float(3, 4.6);
    const eyeY = 60 - ry * 0.08 + rng.float(-2, 2);

    const browType = rng.weighted([
      ['none', 0.7], ['straight', 2.5], ['angry', 1.5],
      ['raised', 1.5], ['bushy', 1.2], ['unibrow', 0.6]
    ]);

    const noseType = rng.pick(['line', 'hook', 'l', 'curve', 'blob', 'big', 'dots']);
    const noseLen = rng.float(7, 12);
    const noseY = eyeY + rng.float(6, 9);
    const noseDX = rng.chance(0.25) ? rng.float(-2.5, 2.5) : 0;

    const mouthType = rng.weighted([
      ['smile', 3], ['grin', 1.5], ['flat', 1.5], ['frown', 1.2],
      ['wave', 1], ['o', 0.8], ['open', 1]
    ]);
    const mouthW = rng.float(7, 13);
    const mouthY = noseY + noseLen + rng.float(4, 8);

    const hairType = rng.weighted([
      ['short', 3], ['buzz', 2], ['spiky', 2], ['curly', 2], ['sidepart', 2],
      ['afro', 1.2], ['flat', 1.5], ['receding', 1.2], ['long', 1.5],
      ['mohawk', 0.8], ['bald', 1.5]
    ]);

    const hat = rng.weighted([[null, 9], ['cap', 1], ['beanie', 0.8], ['flat', 0.6], ['bucket', 0.6]]);
    const hatSide = rng.chance(0.5) ? -1 : 1;
    const facialHair = hat
      ? (rng.chance(0.3) ? rng.pick(['mustache', 'goatee', 'beard', 'stubble']) : null)
      : rng.weighted([[null, 5], ['mustache', 1.2], ['goatee', 0.8], ['beard', 1], ['stubble', 1]]);

    const glasses = rng.weighted([[null, 6], ['round', 1.5], ['square', 1.2], ['sunglasses', 0.8]]);

    return {
      seed: seed,
      headShape: headShape, rx: rx, ry: ry, rz: rz,
      pose: pose,
      eyeType: eyeType, eyeDX: eyeDX, eyeR: eyeR, eyeY: eyeY,
      lookDir: rng.chance(0.5) ? -1 : 1,
      browType: browType,
      noseType: noseType, noseLen: noseLen, noseY: noseY, noseDX: noseDX,
      mouthType: mouthType, mouthW: mouthW, mouthY: mouthY,
      hairType: hairType, hairDrop: rng.float(0.28, 0.4),
      hat: hat, hatSide: hatSide, facialHair: facialHair, glasses: glasses,
      ears: rng.chance(0.85),
      neck: rng.chance(0.3),
      shoulders: false, // set below once neck is known
      blush: rng.chance(0.15),
      freckles: rng.chance(0.12),
      wrinkles: rng.chance(0.15),
      earring: false // set below once ears are known
    };
  }

  // Draw one face with its top-left corner at (x, y), scaled so the
  // 100 x 120 face box maps to scale * box. Deterministic per seed.
  function drawFace(ctx, recipe, seed, opts) {
    opts = opts || {};
    const rng = new global.DoodlyRandom.Rng((seed ^ 0x5F3759DF) >>> 0);
    const ink = opts.ink || INKS.graphite;
    const paper = opts.paper || PAPERS.cream;

    ctx.save();
    ctx.translate(opts.x || 0, opts.y || 0);
    ctx.rotate((rng.next() - 0.5) * 0.05); // barely-there tilt for life
    ctx.scale(opts.scale || 1, opts.scale || 1);
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 1.4 + rng.next() * 0.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const f = {
      cx: 50, cy: 60,
      rx: recipe.rx, ry: recipe.ry,
      eyeY: recipe.eyeY, eyeDX: recipe.eyeDX, eyeR: recipe.eyeR,
      lookDir: recipe.lookDir,
      browY: recipe.eyeY - 7.5,
      noseY: recipe.noseY, noseLen: recipe.noseLen, noseDX: recipe.noseDX,
      mouthY: recipe.mouthY, mouthW: recipe.mouthW,
      paper: paper
    };
    const keys = ['headShape', 'eyeType', 'browType', 'noseType', 'mouthType',
      'hairType', 'hairDrop', 'hat', 'facialHair', 'glasses',
      'ears', 'neck', 'blush', 'freckles', 'wrinkles'];
    for (let i = 0; i < keys.length; i++) f[keys[i]] = recipe[keys[i]];
    f.shoulders = recipe.neck && rng.chance(0.6);
    f.earring = recipe.ears && rng.chance(0.1);

    // ---- 3D view: anchors & patches on the posed skull ------------------
    // Feature positions come from longitude/latitude on the ellipsoid,
    // derived from the recipe's 2D metrics so faces keep their layout.
    const V = global.DoodlyHead3D;
    const D = V.DEG;
    const pose = opts.poseOverride
      ? { yaw: opts.poseOverride.yaw, pitch: opts.poseOverride.pitch, roll: recipe.pose.roll }
      : recipe.pose;

    function latFor(y) {
      return Math.asin(Math.max(-0.98, Math.min(0.98, (60 - y) / recipe.ry))) / D;
    }
    function lonFor(dx, y) {
      const latRad = latFor(y) * D;
      return Math.asin(Math.max(-0.98, Math.min(0.98, dx / (recipe.rx * Math.cos(latRad))))) / D;
    }

    const eyeLat = latFor(recipe.eyeY);
    const eyeLon = lonFor(recipe.eyeDX, recipe.eyeY);
    const topY = 60 - recipe.ry;
    const hairlineLat = Math.asin(Math.max(-0.98, Math.min(0.98, 1 - recipe.hairDrop))) / D;

    // Patches are frames for region-based parts (hair, hats, beards),
    // anchored near each region's centroid latitude.
    const patches = {};
    const ht = recipe.hairType;
    if (ht === 'short' || ht === 'buzz' || ht === 'curly' || ht === 'sidepart' || ht === 'long') {
      patches.hair = { lon: 0, lat: (90 + hairlineLat) / 2, margin: 0.03 };
    } else if (ht === 'spiky') {
      patches.hair = { lon: 0, lat: latFor(60 - recipe.ry * 0.6), margin: 0.03 };
    } else if (ht === 'mohawk') {
      patches.hair = { lon: 0, lat: latFor(60 - recipe.ry * 0.78), margin: 0.03 };
    } else if (ht === 'afro') {
      patches.hair = { lon: 0, lat: latFor(60 - recipe.ry * 0.82), margin: 0.03 };
    } else if (ht === 'flat') {
      patches.hair = { lon: 0, lat: latFor(topY + 5), margin: 0.03 };
    } else if (ht === 'receding') {
      patches.hairL = { lon: -42, lat: latFor(60 - recipe.ry * 0.55), margin: 0.02 };
      patches.hairR = { lon: 42, lat: latFor(60 - recipe.ry * 0.55), margin: 0.02 };
    } else if (ht === 'bald') {
      for (let i = 0; i < 3; i++) {
        patches['strand' + i] = { lon: -24 + i * 24, lat: 76, margin: 0.02 };
      }
    }
    if (ht === 'curly') {
      for (let i = 0; i < 8; i++) {
        patches['curl' + i] = { lon: -56 + (112 * i) / 7, lat: hairlineLat + 4, margin: 0.02 };
      }
    }
    if (ht === 'long') {
      patches.lockL = { lon: -94, lat: latFor(60 + recipe.ry * 0.05), margin: -0.02 };
      patches.lockR = { lon: 94, lat: latFor(60 + recipe.ry * 0.05), margin: -0.02 };
    }

    if (recipe.hat) {
      patches.hat = { lon: 0, lat: latFor(topY + 7), margin: 0.03 };
      patches.brim = { lon: 0, lat: latFor(topY + 11), margin: 0.03 };
      patches.brimSide = { lon: 30 * (recipe.hatSide || 1), lat: latFor(topY + 10), margin: 0.02 };
    }
    if (recipe.facialHair === 'mustache') {
      const my = Math.min(recipe.mouthY - 5, recipe.noseY + recipe.noseLen + 2.5);
      patches.mustache = { lon: 0, lat: latFor(my), margin: 0.03 };
    } else if (recipe.facialHair === 'goatee') {
      const gy = Math.min(recipe.mouthY + 6, 60 + recipe.ry - 6);
      patches.goatee = { lon: 0, lat: latFor(gy), margin: 0.03 };
    } else if (recipe.facialHair === 'beard') {
      patches.beard = { lon: 0, lat: latFor(60 + recipe.ry * 0.5), margin: 0.03 };
    } else if (recipe.facialHair === 'stubble') {
      patches.stubble = { lon: 0, lat: latFor(60 + recipe.ry * 0.58), margin: 0.03 };
    }

    f.view = V.buildView({
      cx: 50, cy: 60,
      a: recipe.rx, b: recipe.ry, c: recipe.rz,
      shape: recipe.headShape,
      yaw: pose.yaw, pitch: pose.pitch, roll: pose.roll,
      anchors: {
        eyeL: { lon: -eyeLon, lat: eyeLat, margin: 0.1 },
        eyeR: { lon: eyeLon, lat: eyeLat, margin: 0.1 },
        browL: { lon: -eyeLon, lat: latFor(recipe.eyeY - 7.5), margin: 0.1 },
        browR: { lon: eyeLon, lat: latFor(recipe.eyeY - 7.5), margin: 0.1 },
        nose: { lon: lonFor(recipe.noseDX || 0, recipe.noseY), lat: latFor(recipe.noseY + recipe.noseLen * 0.35), margin: 0.05 },
        mouth: { lon: 0, lat: latFor(recipe.mouthY), margin: 0.05 },
        earL: { lon: -87, lat: latFor(60 + recipe.ry * 0.06), margin: -0.06 },
        earR: { lon: 87, lat: latFor(60 + recipe.ry * 0.06), margin: -0.06 },
        blushL: { lon: -(eyeLon + 13), lat: latFor(recipe.eyeY + 9), margin: 0.04 },
        blushR: { lon: eyeLon + 13, lat: latFor(recipe.eyeY + 9), margin: 0.04 },
        wrinkle: { lon: 0, lat: latFor(60 - recipe.ry * 0.52), margin: 0.04 }
      },
      patches: patches
    });

    // ---- mouse-tracking pupils ------------------------------------------
    // Convert the gaze point (canvas coords) into each eye's local frame
    // as a unit direction; parts.js offsets pupils along it. Works at
    // any head pose because it uses the projected tangent frame.
    f.gazeL = null;
    f.gazeR = null;
    if (opts.gaze) {
      const sc = opts.scale || 1;
      function gazeLocal(pt) {
        const exs = (opts.x || 0) + pt.ax * sc;
        const eys = (opts.y || 0) + pt.ay * sc;
        let dx = opts.gaze.x - exs, dy = opts.gaze.y - eys;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) return { x: 0, y: 0 };
        dx /= len; dy /= len;
        return { x: dx * pt.ex + dy * pt.ey, y: dx * pt.sx + dy * pt.sy };
      }
      f.gazeL = gazeLocal(f.view.pts.eyeL);
      f.gazeR = gazeLocal(f.view.pts.eyeR);
    }

    // Painterly order: behind → front.
    P.drawNeck(ctx, rng, f);
    P.drawHead(ctx, rng, f);
    P.drawEars(ctx, rng, f);
    P.drawBrows(ctx, rng, f);
    P.drawEyes(ctx, rng, f);
    P.drawNose(ctx, rng, f);
    P.drawMouth(ctx, rng, f);
    P.drawFacialHair(ctx, rng, f);
    P.drawHair(ctx, rng, f);
    P.drawHat(ctx, rng, f);
    P.drawGlasses(ctx, rng, f);
    P.drawExtras(ctx, rng, f);

    ctx.restore();
  }

  global.DoodlyFace = {
    makeRecipe: makeRecipe,
    drawFace: drawFace,
    INKS: INKS,
    PAPERS: PAPERS,
    BOX_W: BOX_W,
    BOX_H: BOX_H
  };
})(window);