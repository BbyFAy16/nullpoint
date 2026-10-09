import { createGL } from './gl/glContext.js';
import { ShapeRenderer, LineRenderer } from './gl/batchRenderer.js';
import { TextRenderer } from './gl/textRenderer.js';
import { TextureRenderer } from './gl/textureRenderer.js';
import { Camera, screenProjection } from './gl/camera.js';
import { PortraitRenderer } from './gl/portraitRenderer.js';
import { Input } from './engine/input.js';
import { Loop } from './engine/loop.js';
import { FullscreenManager } from './engine/fullscreen.js';
import { COLORS, hexToRgba } from './utils/color.js';

import { Match } from './systems/match.js';
import { Settings } from './systems/settings.js';
import { SoundEffects } from './systems/audio.js';
import { visionRangeFor } from './systems/perception.js';
import { computeVisibility, canSeeBody, pointInCone } from './systems/visibility.js';
import {
  SparkPool, HitFlashPool, MuzzlePool, BloodParticlePool, DamageNumberPool, ExplosionPool,
} from './systems/effects.js';

import { HUD, uiScale, safeRect, sideColor } from './ui/hud.js';
import { drawMinimap, drawMinimapContent } from './ui/minimap.js';
import { KillFeed } from './ui/killfeed.js';
import { Banner, KillConfirmBanner } from './ui/banner.js';
import { Menu } from './ui/menu.js';
import { DEBUG, toggleDebugKey, drawDebugWorld, drawDebugText } from './ui/debug.js';

// ============================================================
// SETUP
// ============================================================
const canvas = document.getElementById('gl');
const loadingEl = document.getElementById('loading');
const switchButton = document.getElementById('character-switch');

const { gl, resize } = createGL(canvas);
const shapes = new ShapeRenderer(gl);
const lines = new LineRenderer(gl);
const text = new TextRenderer(gl);
const textures = new TextureRenderer(gl);
const camera = new Camera();
const input = new Input(canvas);
const portraits = new PortraitRenderer(gl);
const settings = new Settings();
const sound = new SoundEffects();
const hud = new HUD();

const applyAudio = () => sound.setVolumes({
  master: settings.get('master'), music: settings.get('music'), sfx: settings.get('sfx'),
});
applyAudio();
settings.onChange(applyAudio);

try {
  await text.loadFont('inter', './assets/fonts/inter.png', './assets/fonts/Inter.json');
  await text.loadFont('mono', './assets/fonts/jet.png', './assets/fonts/Jet.json');
  loadingEl.classList.add('hidden');
} catch (err) {
  console.error('Font load failed:', err);
  loadingEl.textContent = 'FONT LOAD FAILED - check console';
  throw err;
}

let vp = resize();
new FullscreenManager(canvas, () => { vp = resize(); });
window.addEventListener('resize', () => { vp = resize(); });

// ============================================================
// STATE
// ============================================================
const DEFAULT_SQUAD = ['VEX', 'ANCHOR', 'VITAL'];
// A throw-away match just to give the title screen an arena to fly over.
const backdrop = new Match({ mode: 'elimination', size: 3, squadKeys: DEFAULT_SQUAD });

let match = null;
let lastConfig = null;
let gameStarted = false;
let paused = false;
let pausedAt = 0;
let resultsAt = 0;
let uiPlayerId = null;       // who the HUD/camera thought we were last tick

let portraitTex = null;
let hitMarkerRemaining = 0;
let deathCam = null;

let sparks, hits, muzzles, blood, damageNumbers, explosions;
const killfeed = new KillFeed();
const banner = new Banner();
const killConfirm = new KillConfirmBanner();

// vision state (all relative to the controlled player)
const visibleEnemies = new Set();
const enemyMemory = new Map();
const fog = {
  cols: Math.ceil(backdrop.world.bounds.w / 64),
  rows: Math.ceil(backdrop.world.bounds.h / 64),
  tileSize: 64,
  seen: new Uint8Array(Math.ceil(backdrop.world.bounds.w / 64) * Math.ceil(backdrop.world.bounds.h / 64)),
};
let visionPoly = null;
let nextFogUpdate = 0;
const reloadStates = new Map();

function resetEffects() {
  sparks = new SparkPool();
  hits = new HitFlashPool();
  muzzles = new MuzzlePool();
  blood = new BloodParticlePool();
  damageNumbers = new DamageNumberPool();
  explosions = new ExplosionPool();
  killfeed.clear();
  banner.clear();
  killConfirm.clear();
  hitMarkerRemaining = 0;
  deathCam = null;
}
resetEffects();

const current = () => match ?? backdrop;

// ============================================================
// MENU WIRING
// ============================================================
const menu = new Menu(settings, {
  onDeploy: (config) => startMatch(config),
  onResume: () => resumeGame(),
  onForfeit: () => endToMenu(),
  onMainMenu: () => endToMenu(),
  onRematch: () => lastConfig && startMatch(lastConfig),
  onScreen: (name) => {
    if (name === 'main' || name === 'setup' || name === 'settings' || name === 'quit') {
      if (!gameStarted) sound.setMusicMode('menu');
    }
  },
  onUiSound: (() => {
    let last = 0;
    return () => {
      const t = performance.now();
      if (t - last > 80) { sound.play('ui', 0.25); last = t; }
    };
  })(),
});

menu.show('main');
camera.zoom = 1.0;
camera.position.x = backdrop.world.bounds.w / 2;
camera.position.y = backdrop.world.bounds.h / 2;

// ============================================================
// MATCH LIFECYCLE
// ============================================================
function startMatch(config) {
  sound.unlock();
  lastConfig = config;
  match = new Match({
    ...config,
    username: settings.get('username'),
  });
  resetEffects();
  enemyMemory.clear();
  visibleEnemies.clear();
  fog.seen.fill(0);
  reloadStates.clear();
  for (const e of match.world.entities) reloadStates.set(e.id, false);

  match.start(performance.now());
  uiPlayerId = match.player.id;
  portraitTex = portraits.render(match.player);
  camera.zoom = 1.6;
  camera._initialized = false;
  camera.position.x = match.player.position.x;
  camera.position.y = match.player.position.y;
  gameStarted = true;
  paused = false;
  resultsAt = 0;
  menu.hide();
  switchButton.hidden = false;
  document.body.classList.remove('in-menu');
  sound.setMusicMode('quiet');
  handleMatchEvents(performance.now());   // consume the first roundStart
  updateVision(performance.now());
}

function endToMenu() {
  gameStarted = false;
  paused = false;
  match = null;
  resultsAt = 0;
  switchButton.hidden = true;
  camera.zoom = 1.0;
  menu.show('main');
  sound.setMusicMode('menu');
}

function pauseGame() {
  if (!gameStarted || paused) return;
  paused = true;
  pausedAt = performance.now();
  const info = match.mode.label;
  menu.pauseSubtitle = `${info} | ${match.config.size}V${match.config.size}`;
  menu.show('pause');
  switchButton.hidden = true;
  sound.setMusicMode('quiet');
}

function resumeGame() {
  if (!paused) return;
  // Don't let the round clock run while paused.
  const lost = performance.now() - pausedAt;
  match.rounds.shiftTime(lost);
  if (deathCam) deathCam.until += lost;
  paused = false;
  menu.hide();
  switchButton.hidden = false;
  sound.setMusicMode(match.rounds.state === 'COMBAT' ? 'combat' : 'quiet');
}

input.onKeyDown((code) => {
  sound.unlock();
  if (code === 'Escape') {
    if (menu.isOpen()) menu.handleEscape();
    else if (gameStarted) pauseGame();
    return;
  }
  if (!gameStarted || paused || !match) return;
  if (code === 'Tab' && match.switchPlayer()) afterPlayerSwitch();
  toggleDebugKey(code);
});
canvas.addEventListener('mousedown', () => sound.unlock());
switchButton.addEventListener('click', () => { if (match?.switchPlayer()) afterPlayerSwitch(); });

function afterPlayerSwitch() {
  portraitTex = portraits.render(match.player);
  if (!deathCam || deathCam.until <= performance.now()) {
    camera.position.x = match.player.position.x;
    camera.position.y = match.player.position.y;
    camera._initialized = true;
  }
  updateVision(performance.now());
}

// ============================================================
// UPDATE
// ============================================================
function buildIntent() {
  const aimWorld = camera.screenToWorld(input.mouse.x, input.mouse.y);
  let ix = 0, iy = 0;
  if (settings.get('movementMode') === 'pointer' && match?.player) {
    // Pointer mode, relative to the cursor: W toward it, S away, A/D strafe left/right.
    const fwd = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0)
      + (input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('ArrowDown') ? 1 : 0);
    const side = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0)
      + (input.isDown('ArrowRight') ? 1 : 0) - (input.isDown('ArrowLeft') ? 1 : 0);
    if (fwd || side) {
      const p = match.player;
      let fx = aimWorld.x - p.position.x;
      let fy = aimWorld.y - p.position.y;
      const d = Math.hypot(fx, fy);
      // Cursor on top of the player: fall back to the current facing so we don't jitter.
      if (d > p.radius * 0.5) { fx /= d; fy /= d; } else { fx = Math.cos(p.aim); fy = Math.sin(p.aim); }
      // Right-hand side of the facing direction in screen space (y down) is (-fy, fx).
      ix = fx * fwd + (-fy) * side;
      iy = fy * fwd + fx * side;
    }
  } else {
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) iy -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) iy += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) ix -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) ix += 1;
  }
  return {
    ix, iy,
    sprint: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
    aimWorld,
    fire: input.mouse.down,
    reload: input.isDown('KeyR'),
    locked: deathCam !== null && performance.now() < deathCam.until,
  };
}

function update(dt) {
  const now = performance.now();

  if (!gameStarted || !match) {
    // Title-screen drift over the arena.
    const t = now / 1000;
    camera.position.x = backdrop.world.bounds.w / 2 + Math.cos(t * 0.06) * 900;
    camera.position.y = backdrop.world.bounds.h / 2 + Math.sin(t * 0.09) * 520;
    return;
  }
  if (paused) return;

  DEBUG._fps.push(dt);
  if (DEBUG._fps.length > 60) DEBUG._fps.shift();

  match.update(dt, now, buildIntent());
  handleMatchEvents(now);

  sparks.update(dt);
  hits.update(dt);
  muzzles.update(dt);
  blood.update(dt);
  damageNumbers.update(dt);
  explosions.update(dt);
  camera.updateShake(dt);
  hitMarkerRemaining = Math.max(0, hitMarkerRemaining - dt);
  killfeed.update(now);

  for (const e of match.world.entities) {
    const was = reloadStates.get(e.id) || false;
    if (!was && e.reloading && fxVisibleEntity(e)) sound.play('reload', e === match.player ? 0.8 : 0.12);
    reloadStates.set(e.id, e.reloading);
  }

  updateVision(now);

  // camera
  if (deathCam) {
    if (now < deathCam.until) camera.follow(deathCam.target, 0.08);
    else { deathCam = null; camera.sweepTo(match.player.position, 0.65); }
  }
  camera.updateSweep(dt);
  if (!deathCam && match.player.state === 'alive') camera.follow(match.player, 0.15);

  updateSwitchButton();

  if (resultsAt && now >= resultsAt) {
    resultsAt = 0;
    showResults();
  }
}

// ============================================================
// EVENTS -> effects, sound, banners
// ============================================================
function shake(strength, duration) {
  const k = settings.get('shake');
  if (k > 0) camera.shake(strength * k, duration);
}

function fxVisiblePoint(x, y, dx = 0, dy = 0) {
  if (!match.config.strictHidden) return true;
  const p = match.player;
  if (Math.hypot(x - p.position.x, y - p.position.y) < 70) return true;
  return pointInCone(p, x - dx * 6, y - dy * 6, visionRangeFor(p), match.world.walls);
}

/** Is this entity currently something the player is allowed to perceive? */
function fxVisibleEntity(e) {
  if (!match || e.team === match.player.team) return true;
  if (!match.config.strictHidden) return true;
  return visibleEnemies.has(e.id);
}

function handleMatchEvents(now) {
  for (const ev of match.drainEvents()) {
    const player = match.player;
    switch (ev.type) {
      case 'roundStart': onRoundStart(ev, now); break;
      case 'combatStart':
        sound.setMusicMode('combat');
        break;
      case 'roundEnd': onRoundEnd(ev, now); break;
      case 'matchEnd': onMatchEnd(ev, now); break;

      case 'shot': {
        const e = ev.entity;
        const visible = fxVisibleEntity(e);
        if (visible) {
          muzzles.spawn(
            e.position.x + Math.cos(e.aim) * (e.radius + 6),
            e.position.y + Math.sin(e.aim) * (e.radius + 6), e.aim);
        }
        if (ev.human) { sound.play('gunshot', 0.3); shake(0.65, 0.07); }
        else if (visible) sound.play('gunshot', 0.07);
        break;
      }
      case 'spark':
        if (fxVisiblePoint(ev.x, ev.y, ev.dx, ev.dy)) sparks.spawn(ev.x, ev.y, ev.dx, ev.dy, ev.material);
        break;
      case 'hit':
        if (fxVisibleEntity(ev.target)) {
          hits.spawn(ev.x, ev.y, '#ffffff');
          blood.spawn(ev.x, ev.y, ev.direction.x, ev.direction.y);
        }
        if (ev.ownerId === uiPlayerId) {
          hitMarkerRemaining = 0.18;
          sound.play('hit', 0.8);
        }
        break;
      case 'damage':
        if (ev.target === player) shake(4.2, 0.2);
        if (settings.get('damageNumbers') && fxVisibleEntity(ev.target)) {
          damageNumbers.spawn(ev.x, ev.y, ev.amount);
        }
        break;
      case 'kill':
        killfeed.push(ev, now);
        if (ev.attackerId === uiPlayerId) {
          killConfirm.show({ text: `YOU ELIMINATED ${ev.victimName}`, duration: 1800 });
          sound.play('kill', 0.9);
        }
        if (ev.victimId === uiPlayerId) {
          const killer = match.world.entities.find(e => e.id === ev.attackerId);
          deathCam = { target: killer || { position: { ...match.world.entities.find(e => e.id === ev.victimId).position } }, until: now + 1400 };
          banner.show({ text: `ELIMINATED BY ${ev.attackerName}`, duration: 1400, color: '#f87171' });
        }
        break;
      case 'bunkerHit':
        if (ev.attackerId === uiPlayerId) { hitMarkerRemaining = 0.18; sound.play('hit', 0.5); }
        else if (fxVisiblePoint(ev.x, ev.y, ev.direction.x, ev.direction.y)) sound.play('bunkerHit', 0.18);
        break;
      case 'bunkerDestroyed': {
        const b = ev.bunker;
        explosions.spawn(b.position.x, b.position.y, sideColor(b.side));
        killfeed.pushBunker(ev, now);
        sound.play('explosion', 0.85);
        shake(6, 0.35);
        const mine = b.squad === match.playerSquad;
        banner.show({
          text: mine ? `YOUR BUNKER ${b.siteId} WAS DESTROYED` : `BUNKER ${b.siteId} DESTROYED`,
          subtext: mine ? 'DEFEND THE REST' : `${ev.attackerName} TOOK IT DOWN`,
          duration: 2200,
          color: mine ? '#f87171' : '#fbbf24',
        });
        break;
      }
      case 'playerSwitched':
        afterPlayerSwitch();
        break;
      default: break;
    }
  }
  uiPlayerId = match.player.id;
}

function onRoundStart(ev, now) {
  enemyMemory.clear();
  visibleEnemies.clear();
  fog.seen.fill(0);
  deathCam = null;
  portraitTex = portraits.render(match.player);
  camera.sweepTo(match.player.position, ev.round === 1 ? 0.8 : 0.9);
  sound.setMusicMode('quiet');
  sound.play('roundStart', 0.4);

  const { rounds } = match;
  const side = match.player.team;
  if (match.mode.id === 'bunkers') {
    banner.show({
      text: 'BUNKERS',
      subtext: `YOU ARE ${side} | DESTROY THEIR BUNKERS`,
      duration: 2800, color: sideColor(side),
    });
  } else {
    banner.show({
      text: `ROUND ${ev.round}`,
      subtext: `ALPHA ${rounds.scores.ALPHA} - ${rounds.scores.OMEGA} OMEGA | YOU: ${side}`,
      duration: 2800, color: sideColor(side),
    });
  }
}

function onRoundEnd(ev, now) {
  deathCam = null;
  const { rounds } = match;
  const winnerSide = match.teams.squadSide(ev.winner);
  const alive = match.teams.squadMembers(ev.winner).find(e => e.state === 'alive');
  if (alive) camera.sweepTo(alive.position, 1.3);
  sound.setMusicMode('quiet');
  const isBunkers = match.mode.id === 'bunkers';
  banner.show({
    text: isBunkers ? `${ev.winner} WINS` : `${ev.winner} WINS THE ROUND`,
    subtext: ev.reason || (isBunkers ? '' : `ALPHA ${rounds.scores.ALPHA} - ${rounds.scores.OMEGA} OMEGA`),
    duration: 2800,
    color: sideColor(winnerSide),
  });
}

function onMatchEnd(ev, now) {
  sound.setMusicMode('quiet');
  resultsAt = now + 2800;
}

function showResults() {
  const winner = match.rounds.matchWinner;
  const isBunkers = match.mode.id === 'bunkers';
  const hud = match.mode.getHudState(match, performance.now());
  const startPlayer = match.world.entities.find(e => e.id === match.startPlayerId);
  match.world.entities.forEach(e => { e.__you = e === startPlayer; });
  menu.showResults({
    won: winner === 'ALPHA',
    winner,
    reason: match.rounds.roundReason,
    scoreLabel: hud.scoreLabel,
    scores: isBunkers ? hud.scores : { ...match.rounds.scores },
    sides: { ALPHA: match.teams.squadSide('ALPHA'), OMEGA: match.teams.squadSide('OMEGA') },
    rows: [...match.world.entities]
      .sort((a, b) => (a.squad === b.squad ? b.kills - a.kills : a.squad < b.squad ? -1 : 1))
      .map(e => ({ name: e.name, squad: e.squad, side: e.team, kills: e.kills, deaths: e.deaths, you: e.__you })),
  });
  switchButton.hidden = true;
}

// ============================================================
// VISION (what the controlled player can perceive)
// ============================================================
function updateVision(now) {
  if (!match) return;
  const p = match.player;
  const walls = match.world.walls;
  const range = visionRangeFor(p);

  visibleEnemies.clear();
  for (const enemy of match.teams.enemiesOf(p)) {
    if (enemy.state === 'dead') { enemyMemory.delete(enemy.id); continue; }
    if (p.state === 'alive' && canSeeBody(p, enemy, range, walls)) {
      visibleEnemies.add(enemy.id);
      enemyMemory.set(enemy.id, { x: enemy.position.x, y: enemy.position.y, seenAt: now });
    }
  }

  visionPoly = computeVisibility(p.position.x, p.position.y, p.aim, p.visionFov, range, walls);

  // Explored-area memory for the minimap (throttled: it is the costly part).
  if (now >= nextFogUpdate) {
    nextFogUpdate = now + 200;
    const ts = fog.tileSize;
    const minCol = Math.max(0, Math.floor((p.position.x - range) / ts));
    const maxCol = Math.min(fog.cols - 1, Math.floor((p.position.x + range) / ts));
    const minRow = Math.max(0, Math.floor((p.position.y - range) / ts));
    const maxRow = Math.min(fog.rows - 1, Math.floor((p.position.y + range) / ts));
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (pointInCone(p, (c + 0.5) * ts, (r + 0.5) * ts, range, walls)) fog.seen[r * fog.cols + c] = 1;
      }
    }
  }
}

let lastSwitchLabel = '';
let lastSwitchBottom = -1;
function updateSwitchButton() {
  const alive = match.livingTeammates().length;
  const label = `SWITCH FROM ${match.player.name} | TAB (${alive})`;
  if (label !== lastSwitchLabel) { switchButton.textContent = label; lastSwitchLabel = label; }
  switchButton.disabled = alive < 2;
  const bottom = Math.round(10 + 126 * uiScale(vp) + 10);
  if (bottom !== lastSwitchBottom) { switchButton.style.bottom = `${bottom}px`; lastSwitchBottom = bottom; }
}

// ============================================================
// RENDER
// ============================================================
function render() {
  const cur = current();
  const world = cur.world;
  camera.setViewport(vp.w, vp.h);
  const camMat = camera.getMatrix();
  const projMat = screenProjection(vp.cssW, vp.cssH);
  const now = performance.now();
  const playing = gameStarted && match;

  gl.clearColor(0.043, 0.059, 0.078, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // ---- A. floor ----
  lines.begin();
  drawFloor(world);
  lines.flush(camMat);

  // ---- B. walls + bunkers ----
  shapes.begin();
  lines.begin();
  drawWalls(world);
  if (playing) drawBunkers(world, now);
  if (playing) drawDebugWorld({ shapes, lines, match });
  shapes.flush(camMat, vp.w, vp.h);
  lines.flush(camMat);

  // ---- C. vision: darkness outside the cone, soft light inside ----
  if (playing && visionPoly && match.player.state === 'alive') {
    if (settings.get('visionOverlay')) {
      lines.begin();
      drawVisionDarkness(match.player, visionPoly);
      lines.flush(camMat);
    }
    lines.begin();
    drawVisionLight(match.player, visionPoly);
    lines.flush(camMat, true);
  }

  // ---- D. entities + effects ----
  shapes.begin();
  lines.begin();
  if (playing) {
    drawEntities();
    drawBunkerBars(world, now);
    drawBullets();
    sparks.draw(lines);
    hits.draw(shapes);
    muzzles.draw(shapes, lines);
    blood.draw(shapes);
    explosions.draw(shapes, lines);
  }
  shapes.flush(camMat, vp.w, vp.h);
  lines.flush(camMat);

  if (!playing) { drawMenuVignette(projMat); return; }

  // ---- E. screen-space shapes ----
  const screenCam = cssToClipMatrix(vp.cssW, vp.cssH);
  const safe = safeRect(vp);
  shapes.begin();
  lines.begin();
  hud.update({ vp, match, now, camera });
  hud.drawShapes(shapes, lines);
  killfeed.prepare(text, vp, safe);
  killfeed.drawShapes(shapes);
  banner.prepare(vp);
  banner.drawShapes(shapes);
  killConfirm.prepare(vp);
  if (hitMarkerRemaining > 0) drawHitMarker(hitMarkerRemaining);
  if (settings.get('minimap')) {
    const mm = drawMinimap({ vp, safe });
    drawMinimapContent({
      shapes, lines, mm, world: match.world, player: match.player, fog,
      visibleEnemies, enemyMemory, now, teams: match.teams,
    });
  }
  shapes.flush(screenCam, vp.cssW, vp.cssH);
  lines.flush(screenCam);

  // ---- F. portrait ----
  textures.begin(projMat);
  const pr = hud.portraitRect;
  const inset = 4;
  textures.draw(portraitTex, pr.x + inset, pr.y + inset, pr.w - inset * 2, pr.h - inset * 2, [1, 1, 1, 1]);

  // ---- G. text (always last, so nothing paints over it) ----
  text.begin(projMat);
  drawWorldText(world, now);
  hud.drawText(text);
  killfeed.drawText(text);
  banner.drawText(text);
  killConfirm.drawText(text);
  drawDebugText({ text, vp, match });
  text.flush();
}

function drawMenuVignette() { /* menus are HTML overlays; arena just drifts behind them */ }

function cssToClipMatrix(w, h) {
  return new Float32Array([2 / w, 0, 0, 0, -2 / h, 0, -1, 1, 1]);
}

function drawHitMarker(remaining) {
  const alpha = Math.min(1, remaining / 0.18);
  const cx = vp.cssW / 2;
  const cy = vp.cssH / 2;
  const color = hexToRgba('#ffffff', alpha);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    lines.line(cx + sx * 7, cy + sy * 7, cx + sx * 15, cy + sy * 15, 2.5, color);
  }
}

// ---------------- world: floor / walls / bunkers ----------------
function drawFloor(world) {
  const tile = 64;
  const b = world.bounds;
  const halfW = vp.w / (2 * camera.zoom);
  const halfH = vp.h / (2 * camera.zoom);
  const margin = tile * 2;
  const x0 = Math.max(0, Math.floor((camera.position.x - halfW - margin) / tile) * tile);
  const x1 = Math.min(b.w, Math.ceil((camera.position.x + halfW + margin) / tile) * tile);
  const y0 = Math.max(0, Math.floor((camera.position.y - halfH - margin) / tile) * tile);
  const y1 = Math.min(b.h, Math.ceil((camera.position.y + halfH + margin) / tile) * tile);
  const grid = hexToRgba(COLORS.grid, 0.9);
  for (let x = x0; x <= x1; x += tile) lines.line(x, y0, x, y1, 1, grid);
  for (let y = y0; y <= y1; y += tile) lines.line(x0, y, x1, y, 1, grid);
  // arena border
  const edge = hexToRgba('#2a3646', 1);
  lines.line(0, 0, b.w, 0, 4, edge); lines.line(b.w, 0, b.w, b.h, 4, edge);
  lines.line(b.w, b.h, 0, b.h, 4, edge); lines.line(0, b.h, 0, 0, 4, edge);
}

function drawWalls(world) {
  const fill = hexToRgba(COLORS.wallFill, 1);
  const edge = hexToRgba(COLORS.wallEdge, 1);
  const hi = hexToRgba('#4b5a70', 0.9);
  for (const w of world.walls) {
    if (w.isBunker) continue;
    shapes.rect(w.x + w.w / 2, w.y + w.h / 2, w.w / 2, w.h / 2, fill, 1.5);
    lines.line(w.x, w.y, w.x + w.w, w.y, 2, hi);                       // lit top edge
    lines.line(w.x + w.w, w.y, w.x + w.w, w.y + w.h, 2, edge);
    lines.line(w.x + w.w, w.y + w.h, w.x, w.y + w.h, 2, edge);
    lines.line(w.x, w.y + w.h, w.x, w.y, 2, edge);
  }
}

function drawBunkers(world, now) {
  for (const b of world.bunkers ?? []) {
    const cx = b.position.x;
    const cy = b.position.y;
    const color = sideColor(match.teams.squadSide(b.squad));
    if (b.destroyed) {
      shapes.circle(cx, cy, b.w * 0.62, hexToRgba('#05080c', 0.55), 6);
      shapes.roundRectOutline(cx, cy, b.w / 2, b.h / 2, 6, 3, hexToRgba('#3b4452', 0.8), 1);
      lines.line(cx - 26, cy - 26, cx + 26, cy + 26, 3, hexToRgba('#3b4452', 0.9));
      lines.line(cx - 26, cy + 26, cx + 26, cy - 26, 3, hexToRgba('#3b4452', 0.9));
      continue;
    }
    const pulse = 0.5 + 0.5 * Math.sin(now / 420 + cx);
    shapes.circle(cx, cy, b.w * 0.95, hexToRgba(color, 0.05 + 0.04 * pulse), 18);   // glow
    shapes.roundRect(cx, cy, b.w / 2, b.h / 2, 8, hexToRgba('#182130', 1), 1.5);
    shapes.roundRect(cx, cy, b.w / 2 - 7, b.h / 2 - 7, 5, hexToRgba('#222d3f', 1), 1.2);
    shapes.roundRectOutline(cx, cy, b.w / 2, b.h / 2, 8, 3, hexToRgba(color, 0.95), 1);
    // core
    shapes.circle(cx, cy, 15, hexToRgba('#05080c', 1), 1.5);
    shapes.circle(cx, cy, 10 + pulse * 2, hexToRgba(color, 0.9), 1.5);
    // corner bolts
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      shapes.circle(cx + sx * (b.w / 2 - 12), cy + sy * (b.h / 2 - 12), 3, hexToRgba('#4b5a70', 1), 1);
    }
    // damage cracks
    const f = b.fraction;
    if (f < 0.66) {
      lines.line(cx - 30, cy - 12, cx - 6, cy - 2, 2, hexToRgba('#05080c', 0.9));
      lines.line(cx - 6, cy - 2, cx + 6, cy - 18, 2, hexToRgba('#05080c', 0.9));
    }
    if (f < 0.33) {
      lines.line(cx + 30, cy + 10, cx + 8, cy + 4, 2.5, hexToRgba('#05080c', 0.9));
      lines.line(cx + 8, cy + 4, cx + 14, cy + 28, 2.5, hexToRgba('#05080c', 0.9));
      shapes.circle(cx, cy, b.w * 0.5, hexToRgba('#ff6a2a', 0.12 + 0.1 * pulse), 10);
    }
    if (b.hitFlash > 0) {
      shapes.roundRect(cx, cy, b.w / 2, b.h / 2, 8, hexToRgba('#ffffff', Math.min(0.55, b.hitFlash * 6)), 1);
    }
  }
}

function drawBunkerBars(world, now) {
  for (const b of world.bunkers ?? []) {
    if (b.destroyed) continue;
    const color = sideColor(match.teams.squadSide(b.squad));
    const w = b.w + 24;
    const x = b.position.x;
    const y = b.y - 20;
    shapes.roundRect(x, y, w / 2 + 2, 6, 3, hexToRgba('#05080c', 0.92), 1);
    const fw = Math.max(4, w * b.fraction);
    shapes.roundRect(x - w / 2 + fw / 2, y, fw / 2, 4, 2,
      hexToRgba(b.fraction > 0.33 ? color : '#ef4444', 1), 1);
  }
}

// ---------------- vision ----------------
function drawVisionDarkness(observer, poly) {
  const ox = observer.position.x;
  const oy = observer.position.y;
  const A = 0.58;
  const band = 42;
  const far = Math.hypot(vp.w, vp.h) / camera.zoom + 600;
  const R0 = 88;                                   // always-visible bubble around you
  const dark = [0.01, 0.02, 0.035, A];
  const clear = [0.01, 0.02, 0.035, 0];
  const half = observer.visionFov / 2;
  const aimEnd = observer.aim + half;
  const aimStart = observer.aim - half;

  // Boundary loop: the cone's wall-clipped edge, then a small circle round the player.
  const loop = poly.map(p => ({ a: p.angle, d: Math.min(p.dist, p.dist) }));
  const arcSteps = 28;
  const arcSpan = Math.PI * 2 - observer.visionFov;
  for (let i = 0; i <= arcSteps; i++) loop.push({ a: aimEnd + (arcSpan * i) / arcSteps, d: R0 });
  void aimStart;

  const P = (a, d) => ({ x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d });
  for (let i = 0; i < loop.length; i++) {
    const A1 = loop[i];
    const A2 = loop[(i + 1) % loop.length];
    let a1 = A1.a;
    let a2 = A2.a;
    if (Math.abs(a2 - a1) < 1e-7 && A1.d === A2.d) continue;
    if (i === loop.length - 1) a2 += Math.PI * 2;           // close the loop
    if (Math.abs(a2 - a1) < 1e-7) continue;                 // radial cone edge: nothing between
    const i1 = P(a1, A1.d), i2 = P(a2, A2.d);
    const m1 = P(a1, A1.d + band), m2 = P(a2, A2.d + band);
    const f1 = P(a1, far), f2 = P(a2, far);
    lines.strip(i1, i2, clear, m1, m2, dark);
    lines.strip(m1, m2, dark, f1, f2, dark);
  }
}

function drawVisionLight(observer, poly) {
  const ox = observer.position.x;
  const oy = observer.position.y;
  const range = visionRangeFor(observer);
  const tint = [0.55, 0.74, 1.0];
  const centre = [tint[0], tint[1], tint[2], 0.20];
  const rim = (d) => [tint[0], tint[1], tint[2], 0.14 * Math.pow(Math.max(0, 1 - d / range), 1.3)];

  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    lines.triangle(ox, oy, centre, a.x, a.y, rim(a.dist), b.x, b.y, rim(b.dist));
  }

  // Lit edges: the two cone sides and wherever the cone is cut by a wall.
  const edge = hexToRgba('#9cc4ff', 0.38);
  const first = poly[0];
  const last = poly[poly.length - 1];
  lines.line(ox, oy, first.x, first.y, 1.5, hexToRgba('#9cc4ff', 0.30));
  lines.line(ox, oy, last.x, last.y, 1.5, hexToRgba('#9cc4ff', 0.30));
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    if (a.dist < range - 1 && b.dist < range - 1) lines.line(a.x, a.y, b.x, b.y, 2, edge);
  }
}

// ---------------- entities ----------------
function drawEntities() {
  const player = match.player;
  const strict = match.config.strictHidden;
  for (const e of match.world.entities) {
    if (e === player) continue;
    const isEnemy = e.team !== player.team;
    const visible = !isEnemy || visibleEnemies.has(e.id);
    if (isEnemy && strict && !visible) continue;
    drawEntity(e, visible ? 1 : 0.28);
  }
  drawEntity(player, 1);
}

function drawEntity(e, alpha) {
  const dead = e.state === 'dead';
  const body = dead ? hexToRgba(COLORS.dead, alpha) : hexToRgba(e.color, alpha);
  const r = e.radius;
  const isPlayer = e === match.player;
  const { x, y } = e.position;

  if (!dead) {
    // soft ground shadow
    shapes.circle(x + 2, y + 4, r + 1, hexToRgba('#000000', 0.28 * alpha), 3);
  }
  if (isPlayer && !dead) {
    lines.line(x + Math.cos(e.aim) * (r + 4), y + Math.sin(e.aim) * (r + 4),
      x + Math.cos(e.aim) * (r + 22), y + Math.sin(e.aim) * (r + 22), 4, hexToRgba('#ffffff', 0.9 * alpha));
  } else if (!dead) {
    lines.line(x + Math.cos(e.aim) * (r - 2), y + Math.sin(e.aim) * (r - 2),
      x + Math.cos(e.aim) * (r + 10), y + Math.sin(e.aim) * (r + 10), 3, hexToRgba('#ffffff', 0.55 * alpha));
  }
  shapes.circle(x, y, r, body, 1.0);
  if (!dead) shapes.ring(x, y, r, r - 2.5, hexToRgba('#0b0f14', 0.55 * alpha), 1);

  if (isPlayer && !dead) {
    const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(performance.now() / 1000 * (Math.PI / 0.75)));
    shapes.ring(x, y, r + 8, r + 4, hexToRgba(COLORS.gold, pulse * alpha), 1.0);
  }

  // thin health bar when hurt
  if (!dead && e.health < e.maxHealth) {
    const w = r * 1.7;
    const by = y + r + 8;
    shapes.roundRect(x, by, w / 2 + 1, 3, 1.5, hexToRgba('#05080c', 0.85 * alpha), 1);
    const pct = Math.max(0, e.health / e.maxHealth);
    const col = pct > 0.5 ? COLORS.hpHigh : pct > 0.25 ? COLORS.hpMid : COLORS.hpLow;
    shapes.roundRect(x - w / 2 + (w * pct) / 2, by, (w * pct) / 2, 2, 1, hexToRgba(col, alpha), 1);
  }
}

function drawBullets() {
  const player = match.player;
  const strict = match.config.strictHidden;
  const range = visionRangeFor(player);
  for (const b of match.combat.bullets) {
    if (strict && b.team !== player.team &&
        !pointInCone(player, b.position.x, b.position.y, range, match.world.walls)) continue;
    const tx = b.position.x - b.direction.x * b.trailLength;
    const ty = b.position.y - b.direction.y * b.trailLength;
    lines.line(tx, ty, b.position.x, b.position.y, 3, [1, 0.97, 0.82, 0.9]);
    shapes.circle(b.position.x, b.position.y, 3, [1, 1, 1, 1], 1.5);
  }
}

// ---------------- text in world space ----------------
function drawWorldText(world, now) {
  const z = camera.zoom;
  const player = match.player;
  const strict = match.config.strictHidden;
  const toScreen = (wx, wy) => ({
    x: ((wx - camera.position.x) * z + vp.w / 2) / vp.dpr,
    y: ((wy - camera.position.y) * z + vp.h / 2) / vp.dpr,
  });

  for (const e of world.entities) {
    const isEnemy = e.team !== player.team;
    const visible = !isEnemy || visibleEnemies.has(e.id);
    if (isEnemy && strict && !visible) continue;
    const alpha = visible ? 1 : 0.28;
    const p = toScreen(e.position.x, e.position.y);
    const size = 13 * z / vp.dpr;
    const nameY = p.y - ((e.radius + 18) * z) / vp.dpr;
    const color = e.state === 'dead' ? hexToRgba(COLORS.dead, 0.7 * alpha) : hexToRgba('#ffffff', alpha);
    text.draw(e.name, p.x, nameY, size, color, 'inter', 'center', 'middle');
    if (DEBUG.enabled && DEBUG.showActions && e.ai?.currentActionName) {
      text.draw(e.ai.currentActionName, p.x, nameY - 14 * z / vp.dpr, 10 * z / vp.dpr,
        hexToRgba('#fbbf24', 0.85 * alpha), 'inter', 'center', 'middle');
    }
  }

  for (const b of world.bunkers ?? []) {
    if (b.destroyed) continue;
    const p = toScreen(b.position.x, b.y - 36);
    const mine = b.squad === player.squad;
    text.draw(`${mine ? 'YOUR ' : ''}BUNKER ${b.siteId}`, p.x, p.y, 11 * z / vp.dpr,
      hexToRgba(sideColor(match.teams.squadSide(b.squad)), 1), 'inter', 'center', 'middle');
  }

  if (settings.get('damageNumbers')) {
    for (const item of damageNumbers.items) {
      const p = toScreen(item.x, item.y);
      text.draw(`${item.amount}`, p.x, p.y, 15 * z / vp.dpr,
        hexToRgba('#ffe08a', Math.min(1, item.life / 0.2)), 'mono', 'center', 'middle');
    }
  }
}

// ============================================================
// GO
// ============================================================
new Loop(update, render).start();

// Test/debug hook: add ?debug to the URL to poke at the running game.
if (location.search.includes('debug')) {
  window.__np = {
    get match() { return match; },
    get camera() { return camera; },
    settings, visibleEnemies, menu,
    showResults,
  };
}
