// ============================================================
// ai.js — BotBrain: steering decisions for AI snakes
// ============================================================
// Decision priority each tick: wall danger > snake-body danger
// > food pursuit > lazy wander. Decisions are staggered (~every
// 80-140ms per bot) so the herd doesn't move in lockstep.
//
// Food pursuit is *committed*: a bot locks onto one pellet and tracks
// progress toward it. If it can't close the distance — usually because
// avoidance steering keeps deflecting it around the target — it gives
// up after ~1.6s and falls back to wander/re-pick. This prevents bots
// from orbiting a single pellet until something else moves nearby.

"use strict";

const FOOD_RANGE        = 500;   // max distance at which a bot notices food
const PROGRESS_TIMEOUT  = 1.6;   // s without closing in → abandon target
const PASS_THROUGH_DIST = 34;    // closer than this → head straight through

class BotBrain {
  constructor(snake) {
    this.snake = snake;
    this.decisionTimer = Math.random() * 0.12;
    this.seed = Math.random() * 100;
    // Committed food-target state.
    this.targetPellet = null;     // pellet reference (or null)
    this.bestDist = Infinity;     // smallest distance seen since acquiring it
    this.progressDeadline = 0;    // world.time by which progress must resume
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

    // ---- 3) Committed food pursuit ----
    if (target == null) {
      const res = this.pursueFood(s, world);
      if (res) { target = res.angle; boost = res.boost; }
    }

    // ---- 4) Wander: smooth sinusoidal drift, calmer when big ----
    if (target == null) {
      const amp = clamp(1.2 / (1 + s.mass * 0.01), 0.3, 1.2);
      target = s.angle + Math.sin(world.time * 0.6 + this.seed) * amp;
    }

    s.steer(target);
    s.setBoost(boost);
  }

  // Committed pursuit of one pellet. Returns {angle, boost}, or null to wander.
  pursueFood(s, world) {
    let p = this.targetPellet;

    // Drop a stale target: eaten by someone else, or drifted out of range.
    if (p && (p.dead || dist2(s.x, s.y, p.x, p.y) > FOOD_RANGE * FOOD_RANGE)) {
      p = null;
    }

    // Acquire a new target: nearest pellet by *arrival cost* — distance
    // penalized by how far the bot would have to turn. Preferring pellets
    // roughly ahead of us avoids instantly slinging around behind the head,
    // which is what sets up tight orbits in the first place.
    if (!p) {
      const out = [];
      world.food.grid.query(s.x, s.y, FOOD_RANGE, out);
      let best = null, bestCost = Infinity;
      for (const cand of out) {
        const d2 = dist2(s.x, s.y, cand.x, cand.y);
        if (d2 >= FOOD_RANGE * FOOD_RANGE) continue;
        const d = Math.sqrt(d2);
        const turn = Math.abs(normAngle(Math.atan2(cand.y - s.y, cand.x - s.x) - s.angle));
        const cost = d * (1 + 1.2 * turn / Math.PI);
        if (cost < bestCost) { bestCost = cost; best = cand; }
      }
      if (!best) return null; // nothing in range → wander
      p = best;
      this.targetPellet = p;
      this.bestDist = Math.sqrt(dist2(s.x, s.y, p.x, p.y));
      this.progressDeadline = world.time + PROGRESS_TIMEOUT;
    }

    const d = Math.sqrt(dist2(s.x, s.y, p.x, p.y));

    // Progress tracking. Only real closing (≥ 3px) counts as progress;
    // otherwise the deadline runs out and we abandon the pellet — that's
    // the self-rescue for bots deflected into a circle around it.
    if (d < this.bestDist - 3) {
      this.bestDist = d;
      this.progressDeadline = world.time + PROGRESS_TIMEOUT;
    } else if (world.time > this.progressDeadline) {
      this.targetPellet = null;
      this.bestDist = Infinity;
      return null; // wander for a bit, then re-pick
    }

    // Very close: keep heading straight so momentum carries us over the
    // pellet. Aiming exactly at a point we're nearly on top of makes us
    // orbit it instead of passing through — tryEat() grabs it as we cross.
    if (d < Math.max(PASS_THROUGH_DIST, s.radius * 1.6)) {
      return { angle: s.angle, boost: false };
    }

    let boost = false;
    if (d > 180 && s.mass > 18 && Math.random() < 0.45) boost = true;
    return { angle: Math.atan2(p.y - s.y, p.x - s.x), boost };
  }
}
