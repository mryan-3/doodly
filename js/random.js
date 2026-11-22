/* random.js — seeded pseudo-random number generator.
   Every face is generated from its own seed, so any sheet can be
   reproduced exactly by typing the same master seed. */
(function (global) {
  'use strict';

  // Fast, decent-quality 32-bit PRNG. Returns floats in [0, 1).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function Rng(seed) {
    this.next = mulberry32(seed);
  }

  Rng.prototype.float = function (min, max) {
    return min + this.next() * (max - min);
  };

  // Inclusive integer in [min, max].
  Rng.prototype.int = function (min, max) {
    return Math.floor(this.float(min, max + 1));
  };

  Rng.prototype.pick = function (arr) {
    return arr[Math.floor(this.next() * arr.length)];
  };

  Rng.prototype.chance = function (p) {
    return this.next() < p;
  };

  // Weighted pick: pairs is [[value, weight], ...]
  Rng.prototype.weighted = function (pairs) {
    let total = 0;
    for (let i = 0; i < pairs.length; i++) total += pairs[i][1];
    let r = this.next() * total;
    for (let i = 0; i < pairs.length; i++) {
      r -= pairs[i][1];
      if (r <= 0) return pairs[i][0];
    }
    return pairs[pairs.length - 1][0];
  };

  // Combine a master seed and an index into an independent face seed.
  function hashSeed(a, b) {
    let h = (a ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ b, 0x85EBCA6B) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xC2B2AE35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }

  global.DoodlyRandom = { Rng: Rng, mulberry32: mulberry32, hashSeed: hashSeed };
})(window);