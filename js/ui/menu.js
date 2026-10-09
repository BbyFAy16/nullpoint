import { ROSTER, SUBCLASS_STATS } from '../characters/roster.js';
import { MODE_INFO } from '../modes/index.js';
import { DEFAULT_SETTINGS } from '../systems/settings.js';

const SETUP_KEY = 'nullpoint.setup.v1';
const DEFAULT_SQUAD = ['VEX', 'ANCHOR', 'VITAL', 'RIFT', 'NOVA'];
const SCREENS = ['main', 'setup', 'settings', 'pause', 'results', 'quit', 'bye'];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * All DOM menus. The game itself never touches the DOM except through this
 * class, which reports user intent through `handlers`:
 *   onDeploy(config)   start a match      onResume()   leave pause
 *   onForfeit()        abandon match      onRematch()  replay same config
 *   onMainMenu()       back to title      onScreen(n)  a screen opened/closed
 */
export class Menu {
  constructor(settings, handlers) {
    this.settings = settings;
    this.h = handlers;
    this.current = null;
    this.returnTo = 'main';
    this.setup = this._loadSetup();
    this.activeSlot = 0;

    this._buildModeCards();
    this._buildRoster();
    this._buildSettings();
    this._bind();
    this._renderSetup();
  }

  // ------------------------------------------------------------
  // NAVIGATION
  // ------------------------------------------------------------
  isOpen() { return this.current !== null; }

  show(name) {
    for (const s of SCREENS) $(`screen-${s}`).hidden = s !== name;
    this.current = name;
    document.body.classList.toggle('in-menu', name !== null);
    if (name === 'settings') this._syncSettings();
    if (name === 'setup') this._renderSetup();
    if (name === 'pause') $('pause-sub').textContent = this.pauseSubtitle || '';
    this.h.onScreen?.(name);
    const first = name && (document.querySelector(`#screen-${name} .btn.primary`) || document.querySelector(`#screen-${name} .btn`));
    if (first) first.focus({ preventScroll: true });
  }

  hide() { this.show(null); }

  /** Escape key. Returns true if the menu consumed it. */
  handleEscape() {
    switch (this.current) {
      case 'setup': this.show('main'); return true;
      case 'settings': this.show(this.returnTo); return true;
      case 'pause': this.h.onResume(); return true;
      case 'quit': this.show('main'); return true;
      default: return this.current !== null;
    }
  }

  _bind() {
    $('btn-play').onclick = () => this.show('setup');
    $('btn-settings').onclick = () => { this.returnTo = 'main'; this.show('settings'); };
    $('btn-quit').onclick = () => this.show('quit');

    $('setup-back').onclick = () => this.show('main');
    $('setup-random').onclick = () => { this._randomize(); this._renderSetup(); };
    $('setup-deploy').onclick = () => this._deploy();

    $('settings-back').onclick = () => this.show(this.returnTo);
    $('settings-reset').onclick = () => { this.settings.reset(); this._syncSettings(); };

    $('pause-resume').onclick = () => this.h.onResume();
    $('pause-settings').onclick = () => { this.returnTo = 'pause'; this.show('settings'); };
    $('pause-forfeit').onclick = () => this.h.onForfeit();

    $('results-menu').onclick = () => this.h.onMainMenu();
    $('results-rematch').onclick = () => this.h.onRematch();

    $('quit-cancel').onclick = () => this.show('main');
    $('quit-confirm').onclick = () => this._quit();
    $('bye-back').onclick = () => this.show('main');

    document.querySelectorAll('#diff-seg button').forEach((b) => {
      b.onclick = () => { this.setup.difficulty = b.dataset.d; this._renderSetup(); };
    });
    $('strict-toggle').onclick = () => {
      this.setup.strictHidden = !this.setup.strictHidden;
      this._renderSetup();
    };

    document.querySelectorAll('#size-seg button').forEach((b) => {
      b.onclick = () => { this._setSize(+b.dataset.size); };
    });

    // Title-screen shortcuts (Escape is routed through main.js).
    window.addEventListener('keydown', (e) => {
      if (this.current !== 'main' || e.repeat) return;
      if (e.code === 'Enter') { e.preventDefault(); this.show('setup'); }
      else if (e.code === 'KeyS') { this.returnTo = 'main'; this.show('settings'); }
      else if (e.code === 'KeyQ') this.show('quit');
    });

    // Light UI feedback.
    document.querySelectorAll('.btn, .mode-card, .char, .slot').forEach((el) => {
      el.addEventListener('mouseenter', () => this.h.onUiSound?.());
    });
  }

  _quit() {
    // Browsers only allow window.close() for script-opened windows, so fall
    // back to a "session ended" screen if the tab is still here.
    try { window.close(); } catch { /* ignore */ }
    setTimeout(() => { if (!window.closed) this.show('bye'); }, 150);
  }

  // ------------------------------------------------------------
  // SETUP
  // ------------------------------------------------------------
  _loadSetup() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETUP_KEY) || '{}'); } catch { /* ignore */ }
    const mode = MODE_INFO[saved.mode] ? saved.mode : 'elimination';
    const size = saved.size === 5 ? 5 : 3;
    const valid = Array.isArray(saved.squad) ? saved.squad.filter(k => ROSTER[k]) : [];
    const squad = [...new Set(valid)];
    const difficulty = ['easy', 'normal', 'hard'].includes(saved.difficulty) ? saved.difficulty : 'normal';
    const out = { mode, size, difficulty, strictHidden: !!saved.strictHidden, squad: [] };
    for (let i = 0; i < size; i++) out.squad.push(squad[i] ?? null);
    this._fillSquad(out);
    return out;
  }

  _saveSetup() {
    try { localStorage.setItem(SETUP_KEY, JSON.stringify(this.setup)); } catch { /* ignore */ }
  }

  _fillSquad(setup) {
    const used = new Set(setup.squad.filter(Boolean));
    const pool = [...DEFAULT_SQUAD, ...Object.keys(ROSTER)].filter(k => !used.has(k));
    for (let i = 0; i < setup.squad.length; i++) {
      if (!setup.squad[i]) {
        const k = pool.find(p => !used.has(p));
        setup.squad[i] = k; used.add(k);
      }
    }
  }

  _randomize() {
    const keys = Object.keys(ROSTER).sort(() => Math.random() - 0.5);
    this.setup.squad = keys.slice(0, this.setup.size);
    this.activeSlot = 0;
  }

  _setSize(size) {
    if (size === this.setup.size) return;
    const old = this.setup.squad;
    this.setup.size = size;
    this.setup.squad = Array.from({ length: size }, (_, i) => old[i] ?? null);
    this._fillSquad(this.setup);
    this.activeSlot = Math.min(this.activeSlot, size - 1);
    this._renderSetup();
  }

  _buildModeCards() {
    const host = $('mode-cards');
    host.innerHTML = '';
    for (const info of Object.values(MODE_INFO)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode-card';
      b.dataset.mode = info.id;
      b.innerHTML = `
        <div class="row"><h3>${esc(info.name)}</h3><span class="tag">${esc(info.tagline.toUpperCase())}</span></div>
        <p>${esc(info.description)}</p>
        <ul>${info.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`;
      b.onclick = () => { this.setup.mode = info.id; this._renderSetup(); };
      host.append(b);
    }
  }

  _buildRoster() {
    const host = $('roster');
    host.innerHTML = '';
    const bar = (v) => `<i><b style="width:${Math.round(Math.max(0.06, Math.min(1, v)) * 100)}%"></b></i>`;
    for (const [key, c] of Object.entries(ROSTER)) {
      const st = SUBCLASS_STATS[c.subclass];
      const dps = st.damage * st.fireRate;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'char';
      b.dataset.key = key;
      b.innerHTML = `
        <div class="orb">${esc(c.name[0])}</div>
        <div class="nm">${esc(c.name)}<span class="pick">&#10003;</span></div>
        <div class="cl">${esc(c.class)} | ${esc(c.subclass)}</div>
        <div class="stats">
          <div class="stat">HP${bar(st.hp / 150)}</div>
          <div class="stat">SPD${bar(st.speed / 280)}</div>
          <div class="stat">DPS${bar(dps / 100)}</div>
          <div class="stat">RNG${bar(st.range / 1400)}</div>
        </div>`;
      b.onclick = () => this._clickCharacter(key);
      host.append(b);
    }
  }

  _clickCharacter(key) {
    const { squad } = this.setup;
    const at = squad.indexOf(key);
    if (at >= 0) {
      squad[at] = null;            // toggle off
      this.activeSlot = at;
    } else {
      let slot = squad[this.activeSlot] === undefined ? 0 : this.activeSlot;
      squad[slot] = key;
      const nextEmpty = squad.findIndex(k => !k);
      this.activeSlot = nextEmpty >= 0 ? nextEmpty : slot;
    }
    this._renderSetup();
  }

  _renderSetup() {
    const { mode, size, squad } = this.setup;
    document.querySelectorAll('.mode-card').forEach(el =>
      el.classList.toggle('selected', el.dataset.mode === mode));
    document.querySelectorAll('#size-seg button').forEach((el) => {
      const on = +el.dataset.size === size;
      el.classList.toggle('selected', on);
      el.setAttribute('aria-checked', on);
    });
    $('size-note').textContent = size === 5
      ? '5v5 fields the full roster: OMEGA gets the other five characters.'
      : 'Compact squads: faster rounds, tighter fights.';

    document.querySelectorAll('#diff-seg button').forEach((el) => {
      const on = el.dataset.d === this.setup.difficulty;
      el.classList.toggle('selected', on);
      el.setAttribute('aria-checked', on);
    });
    $('strict-toggle').setAttribute('aria-checked', this.setup.strictHidden);

    const slots = $('slots');
    slots.innerHTML = '';
    squad.forEach((key, i) => {
      const c = key ? ROSTER[key] : null;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `slot ${c ? 'filled' : 'empty'}${i === this.activeSlot ? ' active' : ''}${i === 0 ? ' you' : ''}`;
      b.innerHTML = `<div class="who">${i === 0 ? 'YOU' : `ALLY ${i}`}</div>
        <div class="name">${c ? esc(c.name) : 'EMPTY'}</div>
        <div class="cls">${c ? `${esc(c.class)} | ${esc(c.subclass)}` : 'pick a character'}</div>`;
      b.onclick = () => {
        if (this.activeSlot === i && squad[i]) squad[i] = null;
        this.activeSlot = i;
        this._renderSetup();
      };
      slots.append(b);
    });

    document.querySelectorAll('.char').forEach(el =>
      el.classList.toggle('picked', squad.includes(el.dataset.key)));

    const ready = squad.every(Boolean);
    $('setup-deploy').disabled = !ready;
    const info = MODE_INFO[mode];
    $('setup-summary').textContent =
      `${info.name} | ${size}V${size} | ${this.setup.difficulty.toUpperCase()}${this.setup.strictHidden ? ' | STRICT VISION' : ''}`;
    this._saveSetup();
  }

  _deploy() {
    if (!this.setup.squad.every(Boolean)) return;
    this.h.onDeploy({
      mode: this.setup.mode,
      size: this.setup.size,
      difficulty: this.setup.difficulty,
      strictHidden: this.setup.strictHidden,
      squadKeys: [...this.setup.squad],
    });
  }

  // ------------------------------------------------------------
  // SETTINGS
  // ------------------------------------------------------------
  _buildSettings() {
    const S = this.settings;
    const body = $('settings-body');
    body.innerHTML = '';
    this._controls = [];

    const section = (title, rows) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="section-title">${title}</div><div class="set-grid"></div>`;
      const grid = wrap.querySelector('.set-grid');
      rows.forEach(r => grid.append(r));
      body.append(wrap);
    };
    const row = (label, desc, ctl) => {
      const el = document.createElement('div');
      el.className = 'set-row';
      el.innerHTML = `<div><div class="lbl">${label}</div><div class="desc">${desc}</div></div><div class="ctl"></div>`;
      el.querySelector('.ctl').append(...ctl);
      return el;
    };
    const slider = (key, min, max, step, fmt) => {
      const input = document.createElement('input');
      input.type = 'range'; input.min = min; input.max = max; input.step = step;
      const val = document.createElement('span');
      val.className = 'val';
      input.oninput = () => { S.set({ [key]: +input.value }); val.textContent = fmt(+input.value); };
      this._controls.push(() => { input.value = S.get(key); val.textContent = fmt(S.get(key)); });
      return [input, val];
    };
    const toggle = (key) => {
      const t = document.createElement('button');
      t.type = 'button'; t.className = 'toggle'; t.setAttribute('role', 'switch');
      t.onclick = () => { S.set({ [key]: !S.get(key) }); t.setAttribute('aria-checked', S.get(key)); };
      this._controls.push(() => t.setAttribute('aria-checked', S.get(key)));
      return [t];
    };
    const choice = (key, options) => {
      const wrap = document.createElement('div');
      wrap.className = 'seg';
      const btns = options.map(([value, label]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = label; b.dataset.value = value;
        b.onclick = () => { S.set({ [key]: value }); sync(); };
        wrap.append(b);
        return b;
      });
      const sync = () => btns.forEach((b) => b.classList.toggle('selected', b.dataset.value === S.get(key)));
      this._controls.push(sync);
      return [wrap];
    };
    const pct = (v) => `${Math.round(v * 100)}%`;

    const name = document.createElement('input');
    name.type = 'text'; name.maxLength = 16; name.spellcheck = false; name.autocomplete = 'off';
    name.onchange = () => { S.set({ username: name.value }); name.value = S.get('username'); };
    this._controls.push(() => { name.value = S.get('username'); });

    section('PROFILE', [
      row('Callsign', 'Shown on your HUD card. Letters, numbers, dot, dash, underscore.', [name]),
    ]);
    section('CONTROLS', [
      row('Movement', 'Classic: WASD moves in four directions. Pointer: W moves toward the cursor, S backpedals, A/D strafe.',
        choice('movementMode', [['classic', 'CLASSIC'], ['pointer', 'POINTER']])),
    ]);
    section('AUDIO', [
      row('Master volume', 'Overall loudness.', slider('master', 0, 1, 0.01, pct)),
      row('Music', 'Menu and combat score.', slider('music', 0, 1, 0.01, pct)),
      row('Effects', 'Gunfire, hits, explosions.', slider('sfx', 0, 1, 0.01, pct)),
    ]);
    section('DISPLAY', [
      row('Vision overlay', 'Darken everything outside your cone of sight.', toggle('visionOverlay')),
      row('Damage numbers', 'Floating numbers on hits.', toggle('damageNumbers')),
      row('Minimap', 'Show the radar in the corner.', toggle('minimap')),
      row('Screen shake', 'Camera kick from gunfire and damage.', slider('shake', 0, 1.5, 0.05, pct)),
    ]);
  }

  _syncSettings() { this._controls.forEach(fn => fn()); }

  // ------------------------------------------------------------
  // RESULTS
  // ------------------------------------------------------------
  /**
   * @param {object} r { won, winner, reason, modeLabel, scoreLabel,
   *                     scores:{ALPHA,OMEGA}, sides:{ALPHA,OMEGA}, rows:[...] }
   */
  showResults(r) {
    const col = (side) => (side === 'WARDEN' ? '#3b82f6' : '#ef4444');
    const rows = r.rows.map(p => `
      <tr class="${p.you ? 'you' : ''}">
        <td><span class="dot" style="background:${col(p.side)}"></span>${esc(p.name)}${p.you ? ' (YOU)' : ''}</td>
        <td>${esc(p.squad)}</td><td class="num">${p.kills}</td><td class="num">${p.deaths}</td>
      </tr>`).join('');
    $('results-body').innerHTML = `
      <div class="result-hero">
        <div class="big ${r.won ? 'win' : 'loss'}" id="result-title">${r.won ? 'VICTORY' : 'DEFEAT'}</div>
        <div class="why">${esc(r.winner)} WINS THE MATCH${r.reason ? ' | ' + esc(r.reason) : ''}</div>
        <div class="score-line">
          ${['ALPHA', 'OMEGA'].map((id, i) => `
            ${i === 1 ? '<div class="dash">-</div>' : ''}
            <div class="sq"><div class="n" style="color:${col(r.sides[id])}">${id}</div>
              <div class="v">${r.scores[id]}</div><div class="s" style="color:#66768c">${esc(r.scoreLabel)}</div></div>`).join('')}
        </div>
      </div>
      <table class="board"><thead><tr><th>PLAYER</th><th>SQUAD</th><th class="num">KILLS</th><th class="num">DEATHS</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
    this.show('results');
  }
}
