// ============================================================
// main.js — Game: world state, loop, camera, input, collisions, UI
// ============================================================

"use strict";

const BOT_NAMES = [
  "Noodle", "Slinky", "Wiggles", "Python", "Cobra", "Viper", "Mamba", "Boa",
  "Anaconda", "Sidewinder", "Rattler", "Garter", "Adder", "Taipan", "Krait",
  "Slowpoke", "Chomper", "Slurpy", "Wormy", "Squiggles"
];

// ---------- Mobile input tuning ----------
const STICK_RADIUS  = 70;   // px, thumbstick travel radius (screen space)
const KNOB_RADIUS   = 26;   // px, drawn knob size
const DOUBLE_TAP_MS = 350;  // ms window: a 2nd tap within this boosts while held

// ---------- Camera zoom tuning ----------
const DESKTOP_ZOOM_BASE = 1.5;
const MOBILE_ZOOM_BASE  = 0.85; // lower = wider FOV on mobile


function escapeHtml(s) {
  s = String(s == null ? "" : s);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

function biasedRandom(low, high, bias) {
  let r = Math.random();
  r = Math.pow(r, bias);
  return low + (high - low) * r;
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
	
    // DOM refs
    this.hudEl      = document.getElementById("hud");
    this.scoreEl    = document.getElementById("score");
    this.killsEl    = document.getElementById("kills");
    this.lbEl       = document.getElementById("lb");
    this.menuEl     = document.getElementById("menu");
    this.deathEl    = document.getElementById("death");
    this.statsEl    = document.getElementById("death-stats");
    this.nameInput  = document.getElementById("name-input");

    // Touch / mobile joystick state.
    this.isTouch   = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
    this.stick     = null;          // {bx, by, kx, ky} base + knob, CSS px
    this.stickId   = null;          // identifier of the driving touch
    this.lastTapAt = 0;             // for double-tap-hold boost detection

    if (this.isTouch) {
      document.getElementById("help-steer").innerHTML  = "<b>Drag</b> the thumbstick to steer";
      document.getElementById("help-boost").innerHTML = "<b>Double-tap &amp; hold</b> to boost";
    }
	
   
 
    // State
    this.state = "menu";            // menu | playing | dead
    this.time = 0;
    this.lastT = performance.now();
    this.lastLoopErrAt = 0;
    this.shake = 0;
    this.hudTimer = 0;
    this.player = null;
    this.playerName = "You";
    this.runStart = 0;

    // Camera
    this.cam = { x: 0, y: 0, zoom: this.isTouch ? MOBILE_ZOOM_BASE : 1.2 };


    // World
    this.snakes = [];
    this.brains = [];
    this.pendingRespawns = [];
    this.nextId = 1;
    this.namePool = BOT_NAMES.slice();
    this.food = new FoodSystem();
    this.segGrid = new SpatialGrid(64);

    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.bindInput();

    // Attract mode: bots + food play behind the menu.
    this.initWorld();

    requestAnimationFrame(this.loop);
  }

  targetZoomForMass(mass) {
      const baseZoom = this.isTouch ? MOBILE_ZOOM_BASE : DESKTOP_ZOOM_BASE;
      return clamp(
        baseZoom / Math.pow(1 + mass * 0.03, 0.42),
        0.42,
        baseZoom
      );
    }

  // ---------- Setup ----------
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.cssW = w; this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
  }

  initWorld() {
    this.snakes = [];
    this.brains = [];
    this.pendingRespawns = [];
    this.food = new FoodSystem();
    this.food.spawnRandom(FOOD_TARGET);
    for (let i = 0; i < BOT_COUNT; i++) this.createBot();
  }

  shuffleNames() {
    for (let i = this.namePool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [this.namePool[i], this.namePool[j]] = [this.namePool[j], this.namePool[i]];
    }
  }



  nextBotName() {
    // Refill from the master list when exhausted — shuffling an empty pool
    // in place would hand out `undefined` names, which later crashed the
    // leaderboard render (escapeHtml) and froze the whole game loop.
    if (this.namePool.length === 0) this.namePool = BOT_NAMES.slice();
    return this.namePool.pop();
  }

  findSpawnPoint(minHeadDist) {
    for (let t = 0; t < 30; t++) {
      const x = randRange(-HALF + 400, HALF - 400);
      const y = randRange(-HALF + 400, HALF - 400);
      let ok = true;
      for (const s of this.snakes) {
        if (!s.alive) continue;
        if (dist2(x, y, s.x, s.y) < minHeadDist * minHeadDist) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    return { x: randRange(-HALF + 400, HALF - 400), y: randRange(-HALF + 400, HALF - 400) };
  }


  createBot() {
    const pos = this.findSpawnPoint(450);
    const s = new Snake({
      id: this.nextId++,
      name: this.nextBotName(),
      isPlayer: false,
      x: pos.x, y: pos.y,
      mass: biasedRandom(8, 600, 10)
    });
    this.snakes.push(s);
    this.brains.push(new BotBrain(s));
  }

  spawnPlayer() {
    if (this.player) this.snakes = this.snakes.filter(s => s !== this.player);
    const pos = this.findSpawnPoint(500);
    this.player = new Snake({
      id: this.nextId++,
      name: this.playerName,
      isPlayer: true,
      x: pos.x, y: pos.y,
      mass: 10
    });
    this.snakes.push(this.player);
    this.runStart = this.time;
  }

  // ---------- Input ----------
  // Steer the player toward a client-space screen point.
  steerTo(cx, cy) {
    this.player.steer(Math.atan2(cy - this.cssH / 2, cx - this.cssW / 2));
  }

  bindInput() {
    // Touch devices get a thumbstick + double-tap-hold boost instead of the
    // mouse handlers: browsers synthesize mousedown/mousemove from touches,
    // which made every steering drag auto-boost on mobile.
    if (!this.isTouch) {
      window.addEventListener("mousemove", (e) => {
        if (this.state === "playing" && this.player && this.player.alive) {
          this.steerTo(e.clientX, e.clientY);
        }
      });

      this.canvas.addEventListener("mousedown", (e) => {
        if (e.button === 0 && this.state === "playing" && this.player.alive) this.player.setBoost(true);
      });
      window.addEventListener("mouseup", () => {
        if (this.player) this.player.setBoost(false);
      });
    } else {
      this.bindTouch();
    }

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat && this.state === "playing" && this.player.alive) this.player.setBoost(true);
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space" && this.player) this.player.setBoost(false);
    });

    document.getElementById("play-btn").addEventListener("click", () => this.start());
    document.getElementById("respawn-btn").addEventListener("click", () => this.respawn());
    this.nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.start();
    });
  }

  // Mobile: drag a thumbstick to steer; double-tap & hold to boost.
  bindTouch() {
    const canvas = this.canvas;

    canvas.addEventListener("touchstart", (e) => {
      if (this.state !== "playing" || !this.player || !this.player.alive) return;
      e.preventDefault(); // block synthesized mouse events + page gestures
      if (this.stickId != null) return; // one finger drives the game

      const t = e.changedTouches[0];
      const now = performance.now();
      if (now - this.lastTapAt <= DOUBLE_TAP_MS) this.player.setBoost(true);
      this.lastTapAt = now;

      // Spawn the thumbstick under this finger.
      this.stickId = t.identifier;
      this.stick = { bx: t.clientX, by: t.clientY, kx: t.clientX, ky: t.clientY };
    }, { passive: false });

    canvas.addEventListener("touchmove", (e) => {
      if (this.stickId == null) return;
      e.preventDefault();
      const s = this.stick;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier !== this.stickId) continue;
        let dx = t.clientX - s.bx, dy = t.clientY - s.by;
        const d = Math.hypot(dx, dy);
        if (d > STICK_RADIUS) { dx *= STICK_RADIUS / d; dy *= STICK_RADIUS / d; }
        s.kx = s.bx + dx;
        s.ky = s.by + dy;
        // Small deadzone so a resting finger doesn't jitter the heading.
        if (d > 10 && this.state === "playing" && this.player.alive) {
          this.player.steer(Math.atan2(dy, dx));
        }
      }
    }, { passive: false });

    const endTouch = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier !== this.stickId) continue;
        this.stickId = null;
        this.stick = null;
        if (this.player) this.player.setBoost(false);
      }
    };
    canvas.addEventListener("touchend", endTouch, { passive: false });
    canvas.addEventListener("touchcancel", endTouch, { passive: false });
  }

  start() {
    this.playerName = (this.nameInput.value.trim() || "You").slice(0, 14);
    this.spawnPlayer();
    this.state = "playing";
    this.menuEl.classList.add("hidden");
    this.deathEl.classList.add("hidden");
    this.hudEl.classList.remove("hidden");
    this.updateHUD();
  }

  respawn() {
    this.spawnPlayer();
    this.state = "playing";
    this.deathEl.classList.add("hidden");
    this.hudEl.classList.remove("hidden");
    this.updateHUD();
  }

  // ---------- Main loop ----------
  loop = (t) => {
    requestAnimationFrame(this.loop);
    const dt = clamp((t - this.lastT) / 1000, 0, 0.05);
    this.lastT = t;
    if (dt > 0) {
      this.time += dt;
      try { this.update(dt); } catch (err) { this.reportLoopError(err); }
    }
    // Guarded separately so one bad frame can never wedge the loop: without
    // this, a single recurring exception in update() skips render() forever.
    try { this.render(); } catch (err) { this.reportLoopError(err); }
  };

  reportLoopError(err) {
    const now = performance.now();
    if (now - this.lastLoopErrAt > 1000) {
      this.lastLoopErrAt = now;
      console.error("game loop error:", err);
    }
  }

  update(dt) {
    // Food: top up + rebuild its spatial index.
    this.food.update();

    // Rebuild the snake-segment grid (used by AI avoidance & collisions).
    this.segGrid.clear();
    for (const s of this.snakes) {
      if (!s.alive) continue;
      const r = s.radius;
      for (const seg of s.segments) {
        this.segGrid.insert(seg.x, seg.y, { x: seg.x, y: seg.y, r, snake: s });
      }
    }

    // Bot decisions.
    for (let i = this.brains.length - 1; i >= 0; i--) {
      const b = this.brains[i];
      if (!b.snake.alive) { this.brains.splice(i, 1); continue; }
      b.update(dt, this);
    }

    // Move every snake.
    for (const s of this.snakes) s.update(dt);

    // Eating.
    for (const s of this.snakes) {
      if (!s.alive) continue;
      const v = this.food.tryEat(s);
      if (v > 0) s.eat(v);
    }
    this.food.cleanup();

    // Collisions → deaths.
    this.checkCollisions();

    // Housekeeping: drop dead snakes so the array (and their segment data)
    // doesn't grow forever over a long session.
    this.snakes = this.snakes.filter(s => s.alive || s === this.player);

    // Bot respawns.
    for (let i = this.pendingRespawns.length - 1; i >= 0; i--) {
      if (this.time >= this.pendingRespawns[i]) {
        this.pendingRespawns.splice(i, 1);
        this.createBot();
      }
    }

    // Camera + shake decay.
    this.updateCamera(dt);
    this.shake *= Math.exp(-3 * dt);

    // HUD (throttled).
    this.hudTimer -= dt;
    if (this.state === "playing" && this.hudTimer <= 0) {
      this.hudTimer = 0.15;
      this.updateHUD();
    }
  }

  // ---------- Collisions & deaths ----------
  checkCollisions() {
    const deaths = [];
    for (const s of this.snakes) {
      if (!s.alive) continue;

      // World border.
      const m = s.radius * 0.4;
      if (Math.abs(s.x) > HALF - m || Math.abs(s.y) > HALF - m) {
        deaths.push({ victim: s, killer: null });
        continue;
      }

      // Other snakes' bodies.
      const out = [];
      this.segGrid.query(s.x, s.y, s.radius + 14, out);
      for (const e of out) {
        if (e.snake === s || !e.snake.alive) continue;
        const rr = s.radius * 0.75 + e.r;
        if (dist2(s.x, s.y, e.x, e.y) < rr * rr) {
          deaths.push({ victim: s, killer: e.snake });
          break;
        }
      }
    }

    // Apply after all checks so head-on crashes kill both fairly.
    const dying = new Set(deaths.map(d => d.victim));
    for (const d of deaths) {
      const killer = (d.killer && !dying.has(d.killer)) ? d.killer : null;
      this.applyDeath(d.victim, killer);
    }
  }

  applyDeath(s, killer) {
    s.alive = false;
    if (killer) killer.kills++;

    // Body becomes a trail of food pellets in the snake's own color.
    const segs = s.segments;
    const step = Math.max(2, Math.floor(segs.length / 140));
    for (let i = 0; i < segs.length && this.food.pellets.length < FOOD_TARGET + 700; i += step) {
      this.food.spawnDrop(segs[i].x, segs[i].y, Math.random() < 0.25 ? 2 : 1, s.hue);
    }

    if (s.isPlayer) {
      this.state = "dead";
      this.shake = 1;
      const elapsed = this.time - this.runStart;
      this.statsEl.innerHTML =
        `<div class="stat"><div class="v">${s.score}</div><div class="k">LENGTH</div></div>` +
        `<div class="stat"><div class="v">${s.kills}</div><div class="k">KILLS</div></div>` +
        `<div class="stat"><div class="v">${fmtTime(elapsed)}</div><div class="k">TIME</div></div>`;
      this.hudEl.classList.add("hidden");
      this.deathEl.classList.remove("hidden");
    } else {
      this.namePool.push(s.name); // name is free again once the bot is gone
      this.pendingRespawns.push(this.time + randRange(1, 2.5));
    }
  }

  // ---------- Camera ----------
  updateCamera(dt) {
    const p = this.player;
    let tx = this.cam.x, ty = this.cam.y, tz = this.cam.zoom;
    if (p && p.alive) {
      tx = p.x + Math.cos(p.angle) * 50;
      ty = p.y + Math.sin(p.angle) * 50;
      tz = this.targetZoomForMass(p.mass);
    }

    const k = Math.min(1, dt * 6);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.zoom += (tz - this.cam.zoom) * Math.min(1, dt * 2);
  }

  // ---------- HUD ----------
  updateHUD() {
    const p = this.player;
    if (!p) return;
    this.scoreEl.textContent = p.score;
    this.killsEl.textContent = p.kills + " kills";

    // Rank all living snakes (mass desc). The player's row is always pinned:
    // right after a respawn they sit at the bottom of the ranking and would
    // otherwise drop off the top-10 list, making the board look broken.
    const ranked = this.snakes.filter(s => s.alive).sort((a, b) => b.mass - a.mass);
    const myRank = p.alive ? ranked.indexOf(p) : -1;
    const top = ranked.slice(0, 10);

    let html = "";
    for (let i = 0; i < top.length; i++) {
      const s = top[i];
      html += `<li class="${s.isPlayer ? "me" : ""}">` +
        `<span class="rank">${i + 1}</span>` +
        `<span class="lname">${escapeHtml(s.name)}</span>` +
        `<span class="lscore">${s.score}</span></li>`;
    }
    if (myRank >= 10) {
      html += `<li class="me pinned">` +
        `<span class="rank">${myRank + 1}</span>` +
        `<span class="lname">${escapeHtml(p.name)}</span>` +
        `<span class="lscore">${p.score}</span></li>`;
    }
    this.lbEl.innerHTML = html;
  }

  // ---------- Rendering ----------
  render() {
    const ctx = this.ctx, w = this.cssW, h = this.cssH;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    ctx.fillStyle = "#14151c";
    ctx.fillRect(0, 0, w, h);

    const zoom = this.cam.zoom;
    const shx = (Math.random() * 2 - 1) * 9 * this.shake;
    const shy = (Math.random() * 2 - 1) * 9 * this.shake;

    ctx.save();
    ctx.translate(w / 2 + shx, h / 2 + shy);
    ctx.scale(zoom, zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    const hw = (w / 2) / zoom + 60;
    const hh = (h / 2) / zoom + 60;
    const view = {
      x0: this.cam.x - hw, y0: this.cam.y - hh,
      x1: this.cam.x + hw, y1: this.cam.y + hh
    };

    drawGrid(ctx, view, zoom);
    drawBorder(ctx);
    this.food.draw(ctx, view, this.time);

    // Bigger snakes render on top.
    const alive = this.snakes.filter(s => s.alive).sort((a, b) => a.mass - b.mass);
    for (const s of alive) s.draw(ctx, view, this.time);

    ctx.restore();

    // Mobile thumbstick (screen space, drawn last).
    if (this.isTouch && this.stick) {
      const st = this.stick;
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(st.bx, st.by, STICK_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      circle(ctx, st.kx, st.ky, KNOB_RADIUS);
    }
  }
}

// ---------- Background helpers ----------
function drawGrid(ctx, view, zoom) {
  const step = zoom >= 0.75 ? 50 : (zoom >= 0.5 ? 100 : 200);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-HALF, -HALF, WORLD_SIZE, WORLD_SIZE);
  ctx.clip();

  const x0 = Math.max(view.x0, -HALF), x1 = Math.min(view.x1, HALF);
  const y0 = Math.max(view.y0, -HALF), y1 = Math.min(view.y1, HALF);

  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    ctx.moveTo(x, view.y0); ctx.lineTo(x, view.y1);
  }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    ctx.moveTo(view.x0, y); ctx.lineTo(view.x1, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBorder(ctx) {
  // Faint inner danger band.
  ctx.strokeStyle = "rgba(255,60,60,0.07)";
  ctx.lineWidth = 48;
  ctx.strokeRect(-HALF + 24, -HALF + 24, WORLD_SIZE - 48, WORLD_SIZE - 48);

  // Glowing red edge line.
  ctx.save();
  ctx.shadowColor = "rgba(255,60,60,0.9)";
  ctx.shadowBlur = 12;
  ctx.strokeStyle = "#ff4d4d";
  ctx.lineWidth = 5;
  ctx.strokeRect(-HALF, -HALF, WORLD_SIZE, WORLD_SIZE);
  ctx.restore();
}

// ---------- Boot ----------
new Game(document.getElementById("game"));
