// ============================================================
// snake.js — Snake entity: movement, growth, boost, rendering
// ============================================================

"use strict";

class Snake {
  constructor(opts) {
    this.id       = opts.id;
    this.name     = opts.name;
    this.isPlayer = !!opts.isPlayer;
    this.x        = opts.x;
    this.y        = opts.y;
    this.angle    = (opts.angle != null) ? opts.angle : Math.random() * Math.PI * 2;
    this.targetAngle = this.angle;
    this.mass     = (opts.mass != null) ? opts.mass : 10;
    this.kills    = 0;
    this.alive    = true;
    this.boosting = false;

    const h = (opts.hue != null) ? opts.hue : Math.random() * 360;
    this.hue = h;
    this.colorA = `hsl(${h.toFixed(0)},72%,58%)`;
    this.colorB = `hsl(${((h + 45) % 360).toFixed(0)},72%,46%)`;

    // Seed the body as a straight line trailing behind the head.
    this.segments = [];
    const n = this.segCount();
    for (let i = 0; i < n; i++) {
      this.segments.push({
        x: this.x - Math.cos(this.angle) * i * SEG_SPACING,
        y: this.y - Math.sin(this.angle) * i * SEG_SPACING
      });
    }
  }

  // ---------- Derived stats ----------
  get radius() { return Math.min(13, 4.5 + Math.sqrt(Math.max(0, this.mass)) * 0.42); }
  segCount()   { return 16 + Math.floor(this.mass * 0.9); }
  get score()  { return Math.floor(this.mass); }

  // ---------- Controls ----------
  steer(a)    { this.targetAngle = a; }
  setBoost(b) { this.boosting = !!b && this.mass > MIN_BOOST_MASS; }

  // ---------- Simulation step ----------
  update(dt) {
    if (!this.alive) return;

    // Turn toward target angle at a size-dependent max rate.
    const da = normAngle(this.targetAngle - this.angle);
    const turnRate = TURN_BASE / (1 + Math.sqrt(Math.max(0, this.mass)) * 0.028);
    const maxTurn = turnRate * dt;
    this.angle = normAngle(this.angle + clamp(da, -maxTurn, maxTurn));

    // Speed (slightly slower when big) and boost drain.
    const boosting = this.boosting && this.mass > MIN_BOOST_MASS;
    const speed = (boosting ? BOOST_SPEED : BASE_SPEED) / (1 + Math.sqrt(Math.max(0, this.mass)) * 0.02);
    if (boosting) {
      this.mass -= BOOST_DRAIN * dt;
      if (this.mass < MASS_FLOOR) this.boosting = false;
    }

    const nx = this.x + Math.cos(this.angle) * speed * dt;
    const ny = this.y + Math.sin(this.angle) * speed * dt;
    this.x = nx;
    this.y = ny;

    // Head segment always tracks the true head position.
    this.segments[0].x = nx;
    this.segments[0].y = ny;

    // Record a new body point once we've travelled SEG_SPACING past the
    // previous first body point → even spacing along the path.
    const ref = this.segments.length > 1 ? this.segments[1] : { x: nx, y: ny };
    if (dist2(nx, ny, ref.x, ref.y) >= SEG_SPACING * SEG_SPACING) {
      this.segments.splice(1, 0, { x: nx, y: ny });
    }

    // Trim to the length implied by current mass.
    const want = this.segCount();
    while (this.segments.length > want) this.segments.pop();
  }

  eat(value) { if (this.alive) this.mass += value; }

  // ---------- Rendering ----------
  // view: {x0, y0, x1, y1} visible world rect. Draws tail→head so the head
  // ends up on top. Culls segments outside the view.
  draw(ctx, view, time) {
    if (!this.alive) return;

    const r = this.radius;
    const m = r + 24;
    const segs = this.segments;

    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      if (s.x < view.x0 - m || s.x > view.x1 + m || s.y < view.y0 - m || s.y > view.y1 + m) continue;

      // Dark outline, then the stripe color (alternating every 6 segments).
      ctx.fillStyle = "rgba(10,10,14,0.55)";
      circle(ctx, s.x, s.y, r + 1.6);
      ctx.fillStyle = ((i % 12) < 6) ? this.colorA : this.colorB;
      circle(ctx, s.x, s.y, r);
    }

    // Boost glow around the head.
    if (this.boosting && this.mass > MIN_BOOST_MASS) {
      const h = segs[0];
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      circle(ctx, h.x, h.y, r * 3.4);
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      circle(ctx, h.x, h.y, r * 2.1);
    }

    // Eyes: two white circles with pupils offset along the heading.
    const h = segs[0];
    if (h.x > view.x0 - m && h.x < view.x1 + m && h.y > view.y0 - m && h.y < view.y1 + m) {
      const ex = Math.cos(this.angle), ey = Math.sin(this.angle);
      for (const side of [-1, 1]) {
        const cx = h.x + ex * r * 0.35 - ey * r * 0.42 * side;
        const cy = h.y + ey * r * 0.35 + ex * r * 0.42 * side;
        ctx.fillStyle = "#ffffff";
        circle(ctx, cx, cy, r * 0.4);
        ctx.fillStyle = "#14151c";
        circle(ctx, cx + ex * r * 0.17, cy + ey * r * 0.17, r * 0.2);
      }

      // Name label above the head.
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = this.isPlayer ? "#5eead4" : "rgba(255,255,255,0.78)";
      ctx.fillText(this.name, h.x, h.y - r - 9);
    }
  }
}
