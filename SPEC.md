# NULLPOINT — Master Specification> A top-down tactical team shooter built with raw WebGL 2.0, vanilla JS, and MSDF typography.> **Version:** 0.1 (Phase 1)> **Status:** Locked design, implementation beginning.
---## Table of Contents
1. [Overview](#1-overview)
2. [Naming & Identity](#2-naming--identity)
3. [Teams](#3-teams)
4. [Classes & Subclasses](#4-classes--subclasses)
5. [Roster](#5-roster)
6. [Game Modes](#6-game-modes)
7. [Map — STATIC](#7-map--static)
8. [Visual Design Language](#8-visual-design-language)
9. [Color Palette](#9-color-palette)
10. [Typography](#10-typography)
11. [HUD](#11-hud)
12. [Tech Stack](#12-tech-stack)
13. [Rendering Architecture](#13-rendering-architecture)
14. [Game Loop](#14-game-loop)
15. [Input](#15-input)
16. [Camera](#16-camera)
17. [Entities](#17-entities)
18. [Combat Model](#18-combat-model)
19. [Vision & Fog of War](#19-vision--fog-of-war)
20. [AI / Bots](#20-ai--bots)
21. [Round System](#21-round-system)
22. [File Structure](#22-file-structure)
23. [Build Phases](#23-build-phases)
24. [Open Questions](#24-open-questions)
---## 1. Overview
**NULLPOINT** is a top-down, team-based tactical shooter for the browser. Two teams — **WARDEN** (defenders) and **BREAKER** (attackers) — fight across symmetric arenas in short rounds with class-based loadouts.
### Core Pillars- **Readable geometry** — every entity, effect, and threat reads at a glance.- **Fast rounds** — 3s freeze, 2–8 min combat, best-of series.- **Class depth** — 5 classes, 10 subclasses, each with distinct silhouette cues.- **No build step at runtime** — vanilla ES modules, raw WebGL2, MSDF text.- **Local/bots first** — WebSocket multiplayer is deferred to a later phase.

**Target Platform:** Modern desktop browsers (Chrome, Firefox, Safari, Edge with WebGL2 support).
---## 2. Naming & Identity
| Item | Value |
| :--- | :--- |
| **Game name** | **NULLPOINT** |
| **First map** | **STATIC** |
| **Lore** | *A decommissioned research station built around a geometric anomaly. Two factions, WARDEN and BREAKER, fight for control of its sectors. The station's floor grid still pulses with residual signal. Rounds are measured in seconds. Survivors are measured in rounds.* |

**Brand variants for logo/UI use:** `NULLPOINT`, `NULL//POINT`, `np.`
---## 3. Teams### Core Teams
| Team | Role | Color | Hex |
| :--- | :--- | :--- | :--- |
| **WARDEN** | Defenders | Blue | `#3b82f6` |
| **BREAKER** | Attackers | Red | `#ef4444` |
### Neutral / Control Colors
| Purpose | Hex |
| :--- | :--- |
| Controlled player ring | `#fbbf24` |
| Dead / ghost | `#4b5563` |

**HUD display format:** `WARDEN 4 — 2 BREAKER`
---## 4. Classes & Subclasses
Five classes, each with two subclasses (10 total).
```text
ASSAULT
├── BREACHER (max damage, entry fragger)
└── RAIDER (damage + mobility, flanks)

BULWARK
├── WARDEN (max HP, deploys shield wall)
└── PALADIN (HP + team damage-resist aura)

COMMAND
├── MEDIC (heal, revive, buff)
└── HYBRID (damage + utility: scan/smoke/flash)

OUTPOST
├── SCOUT (fast, short-range mark, mobile vision)
└── LONG (long-range precision, holds angles)

JOKER
├── OPERATOR (balanced, no strengths, no weaknesses)
└── GAMBIT (swaps one ability at round start)
```
### Class Stats (Starting Values)
| Subclass | HP | Speed | Fire Rate | Mag | Range | Ability |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BREACHER** | 100 | 220 | 10/s | 20 | 500 | — |
| **RAIDER** | 100 | 260 | 8/s | 24 | 450 | dash 200px, cd 8s |
| **WARDEN** | 150 | 180 | 6/s | 30 | 500 | deploy shield, cd 15s |
| **PALADIN** | 130 | 190 | 6/s | 30 | 500 | aura 150px, −20% dmg taken, cd 12s |
| **MEDIC** | 100 | 210 | 7/s | 25 | 450 | heal 40hp/2s, cd 6s |
| **HYBRID** | 100 | 220 | 8/s | 25 | 500 | scan 400px, cd 10s |
| **SCOUT** | 90 | 280 | 8/s | 24 | 400 | mark 500px, cd 8s |
| **LONG** | 100 | 190 | 2/s (semi) | 10 | 900 | — |
| **OPERATOR** | 100 | 220 | 8/s | 25 | 500 | — |
| **GAMBIT** | 100 | 220 | 8/s | 25 | 500 | swaps per round |

*Note: All values are in world units (see §8). Ammo is infinite; only the magazine size matters (reload refills).*
---## 5. Roster
Ten characters. Names are codenames and must **not** telegraph class or role.

| # | Name | Class | Subclass | Visual Cue (Top-Down) |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **VEX** | ASSAULT | BREACHER | Sharp arrow aim, brightest fill, thin ring |
| 2 | **RIFT** | ASSAULT | RAIDER | Dashed motion trail when moving fast |
| 3 | **ANCHOR** | BULWARK | WARDEN | Thick double ring, slower pulse |
| 4 | **HALO** | BULWARK | PALADIN | Soft outer glow aura (always on) |
| 5 | **VITAL** | COMMAND | MEDIC | Small plus sign inside circle |
| 6 | **PULSE** | COMMAND | HYBRID | Half-dashed ring |
| 7 | **GHOST** | OUTPOST | SCOUT | Crosshair ticks (4 small ticks) |
| 8 | **NOVA** | OUTPOST | LONG | Four ticks at 90° (compass rose) |
| 9 | **ECHO** | JOKER | OPERATOR | Clean ring, no extras |
| 10 | **SHIFT** | JOKER | GAMBIT | Ring color shifts blue/red each round |
### Naming Rules- No military ranks (no Sergeant, Captain, Major).- No obvious role words (no Sniper, Medic, Tank, Scout).- No physics-descriptive words locked to a role.- 1–2 syllables, easily called in voice chat.- All caps in HUD.
---## 6. Game Modes
Four modes planned. Phase 1 builds the round controller skeleton that all four plug into.
### 6.1 ELIMINATION (CS:GO-style)- **Rounds:** `bestOf(7)` → first to 4 wins- **Freeze:** 3s- **Combat:** 2:00- **Win:** Eliminate all enemies OR time expires (defenders win)
- **End:** 3s, `score++`, banner shown
### 6.2 BUNKERS (single round)- **Rounds:** Single (1 game)- **Freeze:** 3s- **Combat:** 3:00- **Win:** Eliminate enemies to drop team points OR destroy bunkers OR time expires (most points wins)
- **End:** 3s, `score++`, banner shown
### 6.3 SIEGE (attack/defend)- **Rounds:** `bestOf(3)` → first to 2 wins, roles swap each round- **Freeze:** 3s- **Combat:** 5:00- **Win:** Attackers destroy objective OR defenders hold until time expires
- **End:** 3s, `score++`, banner shown
### 6.4 DOMINATION (long round with overtime)- **Rounds:** Single + golden overtime if tied- **Freeze:** 3s- **Combat:** 8:00- **Layout:** Two halves — 2 points per half, 1 middle, 2 bases- **Scoring:**
  - Capture 2 points on your half → +1
  - Capture middle point → +2
  - Capture 2 points on opponent half → +3
  - Capture opponent base + all points → instant win- **Respawn:** Infinite at any team-captured point- **Overtime:** Time up + tie → golden point (middle only), first capture wins
- **End:** 3s, `score++`, banner shown
### Round Flow (All Modes)```text
Round Start (3s freeze)
 └── Spawn teams, full health, no movement
Combat Phase (mode-dependent)
 └── Objective resolution
Round End (3s)
 └── score++ for winner, banner shown
Repeat until mode's match condition is met
```
---## 7. Map — STATIC
First map. Symmetric arena, expandable for 5v5 later.
- **Size:** 96×64 tiles (tile = 64px) → World space = **6144 × 4096 px**- **Layout:** Two flank lanes, one middle lane, four cover pillars, two bunkers- **Symmetry:** Both teams have equal footing
### ASCII Sketch```text
┌──────────────────────────────────────────────────────┐
│ [W spawn]                                  [B spawn] │
│     ●                                          ●     │
│  ╔═══╗                                        ╔═══╗  │
│  ║ ▓ ║─────────────   ▓▓▓   ────────────────  ║ ▓ ║  │
│  ╚═══╝                                        ╚═══╝  │
│     │                ▓   ▓                │          │
│     │                                     │          │
│     │              ▓ [ MIDDLE ] ▓         │          │
│     │                                     │          │
│     │                ▓   ▓                │          │
│  ╔═══╗                                        ╔═══╗  │
│  ║ ▓ ║─────────────   ▓▓▓   ────────────────  ║ ▓ ║  │
│  ╚═══╝                                        ╚═══╝  │
│     ●                                          ●     │
│ [W spawn]                                  [B spawn] │
└──────────────────────────────────────────────────────┘
```
- `▓` = Wall / Pillar
- `▓▓▓` = Central bunker (BUNKERS mode objective)
- `●` = Team spawn point
---## 8. Visual Design Language### Player (World Space)- **Body:** Circle $r=14$, team color fill.
- **Outline:** Dark 2px stroke (`#0b0f14`).- **Name:** White, centered above body ($y - 22$).- **Aim Indicator:** Short line ($r=14 \rightarrow r=22$), team-tinted white.- **Health Arc:** Optional thin ring around body (green $\rightarrow$ red).
- **Dead State:** Fill `#4b5563`, no outline, no collision, name faded.
- **Controlled Player:** Outer gold ring (`#fbbf24`) $r=20$, subtle radial glow $r=28$, pulsing alpha $0.6 \leftrightarrow 1.0$ over 1.5s.
### Bullets- **Tracer:** Trail line from $(\text{pos} - \text{dir} \cdot 8)$ to $(\text{pos} + \text{dir} \cdot 4)$.
- **Color:** `#fff8d0`, width 2px, fades over 0.15s.- **Hit Impact:** Expanding circle $r=2 \rightarrow 16$, alpha $1 \rightarrow 0$ over 0.2s.
### Walls- **Fill:** `#1f2937`
- **Edge:** `#374151`, 2px inner stroke.- **Hint:** Optional subtle top-edge highlight (2.5D architectural feel).
### Floor- **Base:** `#0b0f14`
- **Grid:** `#1a1f26`, 1px lines every 64px.- **Vignette:** Radial fade to black at screen edges.
### Vision Cone (Controlled Player Only)- **Origin:** Player position.- **Angle:** Facing $\pm 35^\circ$ ($70^\circ$ FOV), OR aim direction $\pm 25^\circ$.- **Length:** 600px, clipped by walls via raycasting (~64 rays).- **Gradient:** White 0.15 alpha at origin $\rightarrow$ transparent at outer edge.- **Blend Mode:** Additive.- **Shadows:** Walls cast a soft shadow outside the cone (multiply dark overlay).
### Spawn Points


* Blue Team: #3b82f6, $r=24$, pulsing glow ring + soft internal radial gradient.
* Red Team: #ef4444, $r=24$, pulsing glow ring + soft internal radial gradient.

------------------------------
## 9. Color Palette
```js
const COLORS = {
blueTeam: '#3b82f6', // WARDEN
redTeam: '#ef4444', // BREAKER
gold: '#fbbf24', // Controlled player
dead: '#4b5563', // Ghost / eliminated
wallFill: '#1f2937',
wallEdge: '#374151',
floor: '#0b0f14',
grid: '#1a1f26',
textPrimary: '#ffffff',
textDim: '#94a3b8',
bulletCore: '#fff8d0',
hpHigh: '#22c55e',
hpMid: '#eab308',
hpLow: '#ef4444',
};
```
------------------------------
## 10. Typography
MSDF (Multi-channel Signed Distance Field) text is utilized for sharp rendering at any scale, batched seamlessly into one draw call.

| Purpose | Font | Weight | Sizes |
|---|---|---|---|
| UI / Names / Labels | Inter | 500 | 12, 14, 16 |
| Numbers (HUD, Timer, Score) | JetBrains Mono | 600 | 14, 24, 32 |

## Atlas Generation
```bash
## Inter — UI font
npx msdf-bmfont-xml 
-f json 
-o inter 
-s 48 
-t msdf 
-r 4 
--charset 32-126 
Inter-Regular.ttf
## JetBrains Mono — numbers
npx msdf-bmfont-xml 
-f json 
-o jetbrains-mono 
-s 48 
-t msdf 
-r 4 
--charset 32-126 
JetBrainsMono-Regular.ttf
```
## Outputs
Assets are committed directly to the repository with no runtime compilation step:

* /assets/fonts/inter-msdf.png
* /assets/fonts/inter-msdf.json
* /assets/fonts/jetbrains-mono-msdf.png
* /assets/fonts/jetbrains-mono-msdf.json

## SDF Text Shader Core
glsl float d = texture(u_atlas, v_uv).r; float w = fwidth(d) * 0.5; float alpha = smoothstep(0.5 - w, 0.5 + w, d + u_weight); outColor = vec4(u_color.rgb, u_color.a * alpha); 
Note: Outline support is achieved by sampling the SDF at a shifted threshold for a crisp black stroke behind white floating labels.
## Fallback System
If the MSDF atlas asset fails to load, the engine falls back to a custom Canvas2D string texture caching system (cached by text|size|font) as a development safety net.
------------------------------
## 11. HUD## Bottom-Left Character Card
All typography is MSDF-rendered.
text ┌──────┐ │ img │ HP ▓▓▓▓▓▓▓░░░ 42/100 └──────┘ AMMO 7 / ∞ VEX ASSAULT · BREACHER @player_001 
## Screen Layout Anchors

* Top Center: Round timer (mono, 32px)
* Top Left: WARDEN score (mono, 24px)
* Top Right: BREAKER score (mono, 24px)
* Top Center-Left: ROUND 5 / 7 (UI, 14px, dim)
* Bottom Center (Phase 5+): Kill feed (fades over 5s) — VEX ⚔ NOVA
* Bottom Right (Phase 5+): Minimap widget

## HUD Typography Tokens

| Element | Font | Size | Color |
|---|---|---|---|
| Timer | JetBrains Mono | 32 | White |
| Score | JetBrains Mono | 24 | Team Color |
| Round Indicator | Inter | 14 | textDim |
| Names (World) | Inter | 14 | White |
| HUD Labels | Inter | 12 | textDim (60% opacity) |
| HUD Values | JetBrains Mono | 14 | White |

## Character Portraits
Rendered procedurally at application initialization. Generates a 64×64 buffer of the character's respective circular glyph/ring styling mapped onto a dark backing card using the standard shape shader. No raw image pipeline dependencies.
## Player Identity

* Character Name: Pulled directly from the session roster (§5).
* Username: Configured via options, defaults to player_001, persisted in localStorage.
* Progression: No numerical accounts, level tiers, or competitive ranks at launch.

------------------------------
## 12. Tech Stack

| Layer | Choice |
|---|---|
| Rendering Pipeline | Raw WebGL 2.0 (maximum performance control, library-free) |
| Programming Language | Vanilla JavaScript (ES Modules / ESM) |
| Compilation/Build Step | None at runtime. MSDF structural typography generation is a one-off offline asset pipeline process. |
| Font Rendering | Inter + JetBrains Mono (Multi-channel Signed Distance Fields) |
| Networking Context | Local simulation + client-side bots first. Core WebSockets deferred to Phase 6+. |
| Persistence Engine | Browser-level localStorage for system identity parameters and player settings. |

------------------------------
## 13. Rendering Architecture## Composition Layers (Back to Front)
```text

   1. floorLayer -> Static positional grid, peripheral vignette
   2. wallLayer -> Static geometric layout extrusions + crisp edges
   3. spawnLayer -> Dynamic round platform structural rings
   4. bulletLayer -> Hitscan bullet trails + linear particle trajectories
   5. playerLayer -> Dynamic player transforms, direction vectors, active states
   6. nameLayer -> High-priority world text layers (always overrides geometry)
   7. visionLayer -> Dynamic multiplicative soft field fog mask
   8. fxLayer -> Screen-space particle responses, lighting, hit flashes
   9. uiLayer -> Normalized screen-space HUD orthographic projection
   ```

## Batching Strategy
Everything drawn within a standard render cycle is routed through a heavily batched set of centralized GPU draw calls:

* Shapes Batch: Circles, rings, regular rectangles, and radial arcs calculated procedurally via parameterized Signed Distance Field fragment logic.
* Lines Batch: Tracer elements, direction arrows, geometric segment boarders, and underlying grid structures.
* Text Batch: Highly optimized MSDF character geometric quad arrays grouped categorically by dynamic metadata profile (font, color).
* Textured Quads: Procedural portraits or caching textures.

## Shape Shader Logic
glsl // Vertex: a_position (world context), u_camera (mat3 layout matrices), u_viewport (vec2 boundaries) // Fragment: // circle: d = length(v_local - center) // a = smoothstep(u_radius, u_radius - 1.0, d) // ring: a *= step(u_innerR, d) // arc: a *= step(u_angleMin, ang) * step(ang, u_angleMax) // outline: mix two sampled alpha distributions 
Note: All core players, status markers, and vectors are generated procedurally by mathematical fragments — no raw image sprite overhead required.
## Typography Compilation Sequence
text TextRenderer.draw("VEX", x, y, 14, color, align) ├── Extract individual structural glyph dimensions from target font JSON metrics ├── Construct 6 transform spatial matrix vertices per explicit glyph (2 standard triangles) with accurate UV vectors ├── Queue generated data structure into active context typographical text batch └── Force dynamic unified batch single draw loop invocation at buffer rendering finish 
Note: Layout calculations are retained in an optimization cache keyed directly via (text, size, font) bounds to bypass computational matrix recalculations on unchanging frame intervals.
------------------------------
## 14. Game Loop
Fixed timestep, accumulator-based execution loop with frame render state interpolation.
```js
const STEP = 1 / 60; // 60Hz physics update rate
let acc = 0;
let last = performance.now();
function frame(now) {
const dt = Math.min((now - last) / 1000, 0.1);
last = now;
acc += dt;
while (acc >= STEP) {
update(STEP); // Deterministic physics, AI ticks, combat resolution
acc -= STEP;
}
render(acc / STEP); // Frame visual state interpolation alpha factor
requestAnimationFrame(frame);
}
```
## Strict Loop Paradigms

* The deterministic logic loop execution cycle update() must never poll systemic system runtime or wall-clock variables directly.
* All pseudo-random actions executed in the tactical context are directed through a seedable PRNG module to support future deterministic network architectures and match storage replays.
* The render() execution loop reads object parameters natively but is strictly isolated from modifying global game states.

------------------------------
## 15. Input

| Action | Standard Key Binding |
|---|---|
| Movement Execution | W, A, S, D (Classic) or cursor-relative: W toward, S back, A/D strafe (Pointer; Settings > Controls) |
| Aim Control | Mouse Position (Transformed to world-space coordinate markers) |
| Fire Interaction | Left Mouse Button (MouseButton0) |
| Reload Interaction | R Key Profile |
| Tactical Ability | Q Key Profile |
| Environmental Interaction | E Key Profile |
| Match Scoreboard | Tab Key (Hold state tracking) |
| System Pause | Esc Key (Toggle state) |

## Core Input Tasks

* Persist state tracking for active frame key map arrays (intercept edge-triggered indicators natively).
* Read raw viewport pointer markers and calculate current coordinate bounds via matrix inversion.
* Force programmatic suppression on standard web browser interface behavior overrides for active game keys (WASD, Space, Tab).
* Intercept local window blur events and explicitly drop tracked key references to clear unintended directional input lockup.

------------------------------
## 16. Camera
Top-down, orthographic layout matrix centered dynamically relative to the actively controlled player entity.
js camera.position // World-space matrix center, interpolated towards target player vector camera.zoom // Magnification scaler. Default: 1.0. Minimap context: 0.5 camera.viewport // Current active layout box tracking structure mapped in CSS pixels 
## Dynamic Behaviors

* Tracking: lerp(camera.position, player.position, 0.15) executed natively per engine processing tick.
* Constraints: Optional geometric clipping bounds logic ensuring rendering states never buffer details beyond explicit map boundaries.
* Matrix Calculations: World metrics map into standard clip matrices through a minimal $3\times3$ coordinate layout transformation (Translational translation + clean spatial scaling factor, zero rotation matrix components).
* Coordinate Conversion: Pointer screen calculations are reversed back into precise layout positions using the inverse camera matrix.

------------------------------
## 17. Entities## Player
js { id, name, username, team, character, // "VEX", "RIFT", ... class, subclass, // "ASSAULT", "BREACHER", ... position: {x, y}, velocity: {x, y}, aim: radians, // Toward mouse (for controlled) or target (for bots) health, maxHealth, ammo, magSize, // Infinite total ammo supply pool state, // 'alive' | 'dead' | 'frozen' cooldowns: { ability: 0 }, } 
## Bullet
js { id, ownerId, team, position: {x, y}, direction: {x, y}, // Normalized unit vector speed, // Used for visual tracer processing lifetime, // Fixed 0.15s lifetime boundary for alpha line attenuation damage, range, } 
Note: Weapon logic utilizes a pure hitscan approach. Trajectory hits are computed immediately using mathematical ray tracing; visible tracers are deployed for presentation only.
## Wall
js { id, polygon: [{x, y}, ...], // Convex orientation arrays for collision geometry // ALTERNATIVE: aabb: { x, y, w, h }, // Simplified Axis-Aligned Bounding Box structural tracking } 
Note: Physics checking resolves via Circle-vs-Wall slide parameters; trace tracking resolves via Ray-vs-Wall parameters (for bullets and sight systems).
## Spawn Point
js { id, team, position: {x, y}, radius } 
## Mode Objectives

* BUNKERS Mode: { type: 'bunker', position, health }
* SIEGE Mode: { type: 'site', position, radius, progress }
* DOMINATION Mode: { type: 'point', position, radius, owner, progress }

------------------------------
## 18. Combat Model## Weapon Mechanics

* Hitscan Resolution: Raycasting executes instantly from point of fire to maximum subclass distance vector.
* Hit Sequence Hierarchy: Ray checking tests collision targets consecutively against: Walls, followed by Enemies.
* Impact Evaluation:
* Wall Hit: Spawns a positional impact particle sequence; zero health reductions applied.
   * Enemy Hit: Triggers systemic health reduction calculations, issues an interface hit flash, and deploys the visual line trace.

## Damage Metrics

* Base Damage: Set uniquely per subclass type (refer to §4 parameters, adjustable at balancing passes).
* Critical Zones: Headshot zone validation modifiers are fully disabled at base launch window. All standard projectile damage rates are equal.
* Distance Degradation: No damage falloff scaling applies at base development launch window. Complex range falloff code curves will be introduced during Phase 5 testing.

## Reload System

* Deploys through direct player interaction (R) or through auto-detection calls triggered if weapon firing keys are selected while the internal magazine is completely spent.
* Base Duration: 1.5s standardized base latency window (tuned independently across subclasses).
* Internal magazine bounds completely fill back up to maximum subclass value markers. Total systemic reserve ammo capacity remains structurally infinite.

## Elimination Paradigms

* If health values track $\le 0$, player object status sets to 'dead'.
* Eliminated Player Profile: Physical physics collision tracking drops entirely, primary weapon functions clear, visual character fills shift to low-priority background visibility using fill token #4b5563.
* Respawn Configurations: Dependent on the rules of the selected game mode (refer to §6 configurations):
* ELIMINATION / SIEGE / BUNKERS: Zero mid-round player respawning permitted.
   * DOMINATION: Infinite wave-based respawns map across active team-held capture nodes.

------------------------------
## 19. Vision & Fog of War
Vision polygons map calculations explicitly to the locally controlled client player object (Phase 5 tracking). Computer-controlled bots deploy a simplified linear Raycast line-of-sight tracking routine.
## Visibility Polygon Generation
```text

   1. Fire out N ray traces (64 discrete iterations) from the player vector spread evenly across the active FOV arc.
   2. Terminate the length of each trace at its first intersecting boundary wall line vector.
   3. Construct a standard GPU triangle fan array originating from the player coordinates to the trace endpoints.
   4. Render the structural polygon area to the display surface with an additive soft-fill blend state.
   ```

## Shadows & Hidden Geometry

* Occluding walls generate projection geometries to map dynamic shadows (calculated via stencil mask buffers or mathematical ray projection algorithms).
* Opposing targets outside the boundary limits of the visibility zone clear from rendering routines or are heavily dimmed.
* The active user and associated structural team units retain constant high-priority visibility states within the user's viewport FOV.
* Opposing bot entities render if they intersect with the boundary space of the active vision zone geometry.

## Bot Line-of-Sight Calculations
Bot entities check baseline target visibility configurations using a single mathematical raycast tracing directly to identified targets, checking if an occlusion wall intersection occurs. This optimization skips heavy shape parsing routines to protect performance.
------------------------------
## 20. AI / Bots
Simple state machine per bot, evaluated each fixed tick.
text [DEAD] ──(Round Reset)──> [IDLE] ──(Patrol Route)──> [PATROL] │ │ (Enemy Spotted) (Enemy Spotted) │ │ ▼ ▼ [PURSUE] ───(In Gun Range)──> [ATTACK] ▲ │ │ (Low HP) │ │ └──────── (Break LOS) ─────▼ [RETREAT] 
## State Machine Behaviors

* IDLE: No viable targets locked; holds present coordinate node.
* PATROL: Traverses linear path nodes towards high-priority active objective coordinates.
* PURSUE: Target detected inside vision parameters; closes distance gap to engagement thresholds.
* ATTACK: Targets map within maximum gun ranges; cuts lateral speed vectors and opens fire.
* RETREAT: Health thresholds drop below safety limits; breaks tracking profiles to seek cover zones out of sight.
* DEAD: Halts all tactical routines; queues execution waits for global system round reset calls.

## Engine Decision Elements

* enemyVisible validation metrics (Raycast line-of-sight validation checking + confirmation inside operational FOV limits and distance vectors).
* Direct tracking evaluation: health / maxHealth.
* Direct pathfinding distance checks to active mode objectives.
* Live tracking of remaining active friendly team assets.

## Targeting Behaviors

* Bot tracking structures turn toward target coordinates with a fixed maximum rotation rate to simulate human input constraints.
* Employs an artificial targeting variance parameter that scales accuracy up the longer a target remains tracked continuously inside fire vectors.
* Introduces an artificial sensory latency delay before the first weapon discharge fires after locking onto a new target vector.

## Bot Composition Logic
Bot class configuration distributions scale based on the needs of the chosen game mode:

* ELIMINATION: Clean, balanced utility distribution across all available asset packages.
* BUNKERS: Weighted heavily towards defensive classes: WARDEN, BREACHER, and MEDIC.
* SIEGE: Attack phase skews toward BREACHER profiles; defense phase skews toward WARDEN profiles.
* DOMINATION: Speed and visibility focused profiles: SCOUT, RAIDER, and MEDIC.

------------------------------
## 21. Round System
A mode-agnostic round controller drives all four modes via a small interface.
typescript interface GameMode { setup(world: object): void; // Spawns entities, places spatial objectives update(world: object, dt: number): void; // Per-tick core objective processing logic checkRoundEnd(world: object): Result | null; // Evaluates round conclusion triggers -> returns winner or null checkMatchEnd(world: object): Result | null; // Evaluates match conclusion triggers -> returns match winner or null getHudState(world: object): HudState; // Extracts active timer, score arrays, and round indices } 
## Game Core States

* FREEZE: 3s duration. Movement vectors are locked to starting positions, and spawn protection logic overrides damage inputs.
* COMBAT: Game clocks track downwards, spatial area interactive objectives process inputs natively.
* ROUND_END: 3s duration. Renders round result banner, blocks character movement vectors.
* MATCH_END: Displays definitive game completion stats banner, terminates match instance, routes back to index menus.

## Dynamic Banner Localization Copy

* WARDEN WINS THE ROUND
* BREAKER WINS THE ROUND
* TIME — WARDEN HOLDS
* WARDEN WINS THE MATCH
* BREAKER WINS THE MATCH

------------------------------
## 22. File Structure
text /project ├── index.html ├── SPEC.md ├── /assets │ └── /fonts │ ├── inter-msdf.png │ ├── inter-msdf.json │ ├── jetbrains-mono-msdf.png │ └── jetbrains-mono-msdf.json ├── /js │ ├── main.js │ ├── /gl │ │ ├── glContext.js │ │ ├── shaders.js │ │ ├── batchRenderer.js │ │ ├── shapeRenderer.js │ │ ├── lineRenderer.js │ │ ├── textRenderer.js │ │ ├── camera.js │ │ └── textureCache.js │ ├── /engine │ │ ├── input.js │ │ ├── loop.js │ │ ├── collision.js │ │ └── spatialHash.js │ ├── /entities │ │ ├── Player.js │ │ ├── Bullet.js │ │ └── Wall.js │ ├── /systems │ │ ├── combat.js │ │ ├── ai.js │ │ ├── vision.js │ │ ├── teams.js │ │ └── rounds.js │ ├── /modes │ │ ├── elimination.js │ │ ├── bunkers.js │ │ ├── siege.js │ │ └── domination.js │ ├── /maps │ │ └── static.js │ ├── /ui │ │ ├── hud.js │ │ └── banner.js │ └── /utils │ ├── vec2.js │ ├── math.js │ └── color.js 
------------------------------
## 23. Build Phases## Phase 1 — GL Skeleton (Current)

* WebGL2 rendering context instantiation, viewport resizing bounds listeners, clear color initialization loops.
* Core batch processing engine assembly (Procedural SDF shader generation drawing circles, rings, and base quadrilaterals).
* Hardware-accelerated line drawing batch module compilation.
* MSDF typography layout engine implementation (Resolving asset lookups across Inter + JetBrains Mono coordinate sheets).
* Structural perspective matrix control module + local pointer intercept listeners + fixed-timestep execution loop structure setup.
* STATIC layout test floor grid background rendering loop + peripheral vignette configuration array mapping.
* Deploy single user-controlled tracking object (VEX, assigned to WARDEN forces) providing:
* Positional gold indicator band + dynamic pulse sheen.
   * Active orientation guide vector line.
   * Text floating name array tracking utilizing the MSDF rendering layout stack.
* HUD card integration (Bottom-left screen space): dynamic profile canvas layout, graphical layout HP meters + numerical readouts, ammo status indexes, object metadata callouts class · subclass, and character reference string @username.
* Exclusions: Zero gun mechanics, zero simulated computer behaviors, zero geometric blockading collision zones.
* Phase Deliverable: A completely standalone executable index.html referencing internal script modules, loading inside target browsers cleanly to present structural components.

## Phase 2 — World & Combat

* Integration of STATIC structural wall layers + geometric object slide collision boundaries (Circle-vs-Wall deflection vectors, Ray-vs-Wall tracing checks).
* Operational hitscan trajectory resolution algorithms + visual tracer line arrays + dynamic structural flash elements.
* Absolute health pools, dynamic weapon damage allocations, structural character down states.

## Phase 3 — Bots & Teams

* Simulated entity behavior routines execution setup + baseline line-of-sight analytical parsing.
* $3\text{v}3$ match spatial grouping instantiation, structural color differentiation, target coordinate designation strings.
* Exhaustive system-wide UI/HUD tracking parameter integration.

## Phase 4 — Mode 1 (ELIMINATION)

* Central round management framework architecture layout: FREEZE $\rightarrow$ COMBAT $\rightarrow$ ROUND_END $\rightarrow$ Score tally adjustments.
* Team coordinate emergence node grids, vector banner presentation arrays, match completion evaluation methods (bestOf(7)).

## Phase 5 — Vision & Fog

* Hardware-accelerated visible area field mesh generation via radial ray trace casting.
* Obstructive geometric structure projection shadow tracking layers.
* Real-time opponent occlusion masking loops.

## Phase 6 — Modes 2, 3, 4 + Wildcard Roster

* Comprehensive integration of remaining objective structures: BUNKERS, SIEGE, and DOMINATION game systems.
* Integration of specialized character behavior structures: ECHO (OPERATOR profile) and SHIFT (GAMBIT profile).

## Phase 7 — Polish

* Particle effect acceleration pools, interface screen shaking algorithms, dynamic screen kill feed tracking.
* System audio sample management array parsing.
* Normalized overlay minimap viewport layout logic.
* Runtime user options customization menus.

## Phase 8+ — Multiplayer Expansion

* External authoritative networking context running via Node.js + secure high-speed WebSocket protocols.
* Execution of player position prediction models, network latency lag interpolation, client-side reconciliation.
* Matchmaking queues.

------------------------------
## 24. Open Questions
Note: These architectural decisions are left open until active development begins on their specific milestone cycles.

* Phase 2: Weapon reload durations: Should reload speeds be standard across all classes or change depending on the weapon type?
* Phase 2: Bullet damage drop-off curves: Is damage falloff necessary at long distances, and what math curve governs it?
* Phase 3: Computer tactical skill tiers: Should the engine use distinct behavioral difficulty levels (Easy / Normal / Hard) or target one highly optimized baseline skill configuration?
* Phase 4: Resource economies / Equipment loadout selectors: Should weapon purchasing phases be included or skipped for the core ELIMINATION loop?
* Phase 5: Vision field scope configurations: Should field-of-view parameters stay locked at $70^\circ$ or change depending on subclass choices?
* Phase 6: Objective destruction parameters: What structural health parameters govern objectives in BUNKERS and SIEGE modes?
* Phase 6: GAMBIT tactical layout changes: What explicit rules dictate which active traits are valid options for the class ability scramble?
* Phase 7: Audio layer choices: Can the project run natively using raw browser WebAudio processing API controls, or should it pull in a compact sound utility library?
* Phase 8: Server transaction synchronization speeds: What network update frequencies and client state override protocols best fit the engine's physics model?

## ```text## End of SPEC.md — v0.1
```


***

<FollowUp>
Now that the technical blueprint is clean, parsed, and properly structured, say **"go"** whenever you are ready to begin **Phase 1 code**. I will generate the complete, production-ready source code files listed in your structure—starting with the core `index.html` file, moving into the raw WebGL 2.0 context configurations, and setting up the procedural SDF batch renderers. Let me know if you would like to adjust any **subclass stats** or **color tokens** before we begin writing code!
</FollowUp>


