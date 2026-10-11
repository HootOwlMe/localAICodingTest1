# Slither.io Recreation, calling it Snakey.io

A browser-based recreation of [Slither.io](https://slither.io) — snake meets agar.io.
Vanilla HTML/CSS/JS with Canvas 2D. No build step, no dependencies.

## Run it

Just open `index.html` in any modern browser (double-click works), or serve the folder:

```
python -m http.server 8000
# then visit http://localhost:8000
```

## Controls

| Input | Action |
|---|---|
| Mouse | Steer your snake toward the cursor |
| Space / Left click (hold) | Boost — faster, but burns length |
| Enter | Start game from the menu |

Eat glowing pellets to grow. If your head touches another snake's body or the red
world border, you die — and your body becomes a trail of food for everyone else.

## Features

- 15 AI snakes that hunt food, dodge walls and bodies, and boost when chasing prey
- Death drops: killed snakes turn into colored pellet trails (their own hue)
- Camera follows you and zooms out as you grow; screen shake on death
- Live leaderboard (top 10), score/kill HUD, death stats screen with respawn
- Attract mode: the world keeps simulating behind the menu

## Structure

```
index.html      page + UI overlays
css/style.css   dark neon theme for menus/HUD
js/core.js      constants, math helpers, spatial hash grid
js/snake.js     Snake entity (movement, growth, boost, rendering)
js/food.js      pellet spawning / eating / glowing render
js/ai.js        bot brains (wall & body avoidance, food seeking, wander)
js/main.js      game loop, camera, collisions, HUD wiring
```

Tuning knobs live at the top of `js/core.js` (world size, speeds, boost drain,
food count, bot count).
