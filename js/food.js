// ============================================================
// food.js — FoodSystem: pellet spawning, eating, rendering
// ============================================================

"use strict";

class FoodSystem {
  constructor() {
    this.pellets = [];
    this.grid = new SpatialGrid(64);
  }

  // ---------- Spawning ----------
  makePellet(x, y, value, hue) {
    return {
      x, y, value, hue,
      r: 2.6 + value * 0.7,
      phase: Math.random() * Math.PI * 2,
      dead: false
    };
  }

  spawnRandom(n) {
    const margin = 30;
    for (let i = 0; i < n; i++) {
      const roll = Math.random();
      const value = roll < 0.85 ? 1 : (roll < 0.97 ? 2 : 4);
      this.pellets.push(this.makePellet(
        randRange(-HALF + margin, HALF - margin),
        randRange(-HALF + margin, HALF - margin),
        value,
        Math.random() * 360
      ));
    }
  }

  // Pellets dropped by a dead snake — inherit its color.
  spawnDrop(x, y, value, hue) {
    this.pellets.push(this.makePellet(
      x + randRange(-4, 4), y + randRange(-4, 4), value, hue
    ));
  }

  // ---------- Per-frame update ----------
  update() {
    // Top the population back up to FOOD_TARGET (a few per frame).
    const deficit = FOOD_TARGET - this.pellets.length;
    if (deficit > 0) this.spawnRandom(Math.min(deficit, 5));

    // Rebuild the spatial index.
    this.grid.clear();
    for (const p of this.pellets) this.grid.insert(p.x, p.y, p);
  }

  // Attempt to eat every pellet near the snake's head. Returns total value.
  tryEat(snake) {
    const out = [];
    this.grid.query(snake.x, snake.y, snake.radius + 14, out);
    let total = 0;
    const eatR2 = Math.pow(snake.radius + 5, 2);
    for (const p of out) {
      if (p.dead) continue;
      if (dist2(snake.x, snake.y, p.x, p.y) < eatR2 + p.r * p.r) {
        p.dead = true;
        total += p.value;
      }
    }
    return total;
  }

  cleanup() {
    this.pellets = this.pellets.filter(p => !p.dead);
  }

  // ---------- Rendering ----------
  draw(ctx, view, time) {
    const m = 16;
    for (const p of this.pellets) {
      if (p.x < view.x0 - m || p.x > view.x1 + m || p.y < view.y0 - m || p.y > view.y1 + m) continue;

      const pulse = 1 + 0.25 * Math.sin(time * 4 + p.phase);
      // Soft outer glow, then the bright core.
      ctx.fillStyle = `hsla(${p.hue.toFixed(0)},85%,60%,0.16)`;
      circle(ctx, p.x, p.y, p.r * 2.6 * pulse);
      ctx.fillStyle = `hsl(${p.hue.toFixed(0)},90%,68%)`;
      circle(ctx, p.x, p.y, p.r * pulse);
    }
  }
}
