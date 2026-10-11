// ============================================================
// core.js — shared constants, math helpers, spatial hash grid
// ============================================================

"use strict";

// ---------- World / balance constants ----------
const WORLD_SIZE   = 6000;          // world spans [-HALF, HALF] on both axes
const HALF         = WORLD_SIZE / 2;
const FOOD_TARGET  = 2400;           // pellets maintained in the world
const FOOD_SPAWN_PER_FRAME = 40;  // avg pellets/frame while below target
const BOT_COUNT    = 15;            // AI snakes kept alive
const SEG_SPACING  = 4;             // px between body points along the path

const BASE_SPEED   = 120;           // px/s normal movement
const BOOST_SPEED  = 240;           // px/s while boosting
const TURN_BASE    = 6.42;          // rad/s max turn rate
const BOOST_DRAIN  = 7;             // mass lost per second while boosting
const MIN_BOOST_MASS = 8;           // can't boost below this
const MASS_FLOOR   = 5;             // boost stops draining at this

// ---------- Small math helpers ----------
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function normAngle(a) {
  while (a >  Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function randRange(lo, hi) { return lo + Math.random() * (hi - lo); }
function pick(arr)        { return arr[(Math.random() * arr.length) | 0]; }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx*dx + dy*dy; }

// Draw a filled circle (used constantly for food & snake segments)
function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- Spatial hash grid ----------
// Uniform-grid spatial index. Rebuilt every frame for snake segments and
// food; queries return candidate entries in cells overlapping a radius box.
class SpatialGrid {
  constructor(cellSize) {
    this.cell = cellSize;
    this.map = new Map();
  }

  clear() { this.map.clear(); }

  insert(x, y, entry) {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    const k = cx + "," + cy;
    let arr = this.map.get(k);
    if (!arr) { arr = []; this.map.set(k, arr); }
    arr.push(entry);
  }

  // Push candidate entries within radius r of (x,y) into `out`.
  query(x, y, r, out) {
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell);
    const y0 = Math.floor((y - r) / this.cell), y1 = Math.floor((y + r) / this.cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.map.get(cx + "," + cy);
        if (arr) for (let i = 0; i < arr.length; i++) out.push(arr[i]);
      }
    }
    return out;
  }
}
