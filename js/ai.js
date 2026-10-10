// ============================================================
// ai.js — BotBrain: steering decisions for AI snakes
// ============================================================
// Decision priority each tick: wall danger > snake-body danger
// > nearest food > lazy wander. Decisions are staggered (~every
// 80-140ms per bot) so the herd doesn't move in lockstep.

"use strict";

class BotBrain {
  constructor(snake) {
    this.snake = snake;
    this.decisionTimer = Math.random() * 0.12;
    this.seed = Math.random() * 100;
  }

  update(dt, world) {
    this.decisionTimer -= dt;
    if (this.decisionTimer > 0) return;
    this.decisionTimer = 0.08 + Math.random() * 0.06;

    const s = this.snake;
    let boost = false;
    let target = null;

    // ---- Probe points ahead of the head (3 distances × 3 offsets) ----
    const probes = [];
    for (const d of [60, 120, 180]) {
      for (const off of [0, 0.45, -0.45]) {
        const a = s.angle + off;
        probes.push({ x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d });
      }
    }

    // ---- 1) Wall danger → steer toward the center ----
    for (const p of probes) {
      if (Math.abs(p.x) > HALF - 260 || Math.abs(p.y) > HALF - 260) {
        target = Math.atan2(-p.y, -p.x);
        break;
      }
    }

    // ---- 2) Snake-body danger → steer away from the threat point ----
    if (target == null) {
      const out = [];
      for (const p of probes) {
        world.segGrid.query(p.x, p.y, s.radius + 16, out);
        for (const e of out) {
          if (e.snake === s || !e.snake.alive) continue;
          const rr = s.radius * 0.7 + e.r + 8;
          if (dist2(p.x, p.y, e.x, e.y) < rr * rr) {
            target = Math.atan2(s.y - e.y, s.x - e.x);
            break;
          }
        }
        out.length = 0;
        if (target != null) break;
      }
    }

    // ---- 3) Nearest food within reach → head for it, maybe boost ----
    if (target == null) {
      let best = null, bestD2 = 500 * 500;
      for (const p of world.food.pellets) {
        const d2 = dist2(s.x, s.y, p.x, p.y);
        if (d2 < bestD2) { bestD2 = d2; best = p; }
      }
      if (best) {
        target = Math.atan2(best.y - s.y, best.x - s.x);
        const d = Math.sqrt(bestD2);
        if (d > 180 && s.mass > 18 && Math.random() < 0.45) boost = true;
      }
    }

    // ---- 4) Wander: smooth sinusoidal drift, calmer when big ----
    if (target == null) {
      const amp = clamp(1.2 / (1 + s.mass * 0.01), 0.3, 1.2);
      target = s.angle + Math.sin(world.time * 0.6 + this.seed) * amp;
    }

    s.steer(target);
    s.setBoost(boost);
  }
}
