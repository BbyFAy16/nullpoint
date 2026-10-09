import { SHAPE_VS, SHAPE_FS, createProgram } from './shaders.js';
import { hexToRgba } from '../utils/color.js';

export class PortraitRenderer {
  constructor(gl) {
    this.gl = gl;
    this.size = 128;

    // FBO
    this.fbo = gl.createFramebuffer();
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.size, this.size, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D, this.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Shape program (reuse the main shape shader)
    this.program = createProgram(gl, SHAPE_VS, SHAPE_FS);
    this.uCamera = gl.getUniformLocation(this.program, 'u_camera');

    // Vertex buffer for one quad (4 verts) we mutate per draw
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const stride = (2 + 2 + 4 + 4) * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 32);
    gl.bindVertexArray(null);

    // This layout has no a_extra attribute; pin its constant value to zero.
    gl.vertexAttrib4f(4, 0, 0, 0, 0);

    this.cpu = new Float32Array(4 * 12);   // 4 verts
    this.ibo = gl.createBuffer();
    const indices = new Uint32Array([0, 1, 2, 2, 1, 3]);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  /**
   * Render a portrait for a character into the FBO texture.
   * character = { color, subclass, name }
   */
  render(character) {
    const gl = this.gl;
    const S = this.size;
    const viewport = gl.getParameter(gl.VIEWPORT);

    gl.vertexAttrib4f(4, 0, 0, 0, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, S, S);

    // Background (dark panel)
    gl.clearColor(0.07, 0.09, 0.12, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Ortho projection: pixels → clip. Size S, centered.
    // map [0,S]×[0,S] → [-1,1]×[-1,1] with y flip
    const camMat = new Float32Array([
      2 / S, 0,     0,
      0,    -2 / S, 0,
      -1,    1,     1,
    ]);

    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, camMat);

    const cx = S / 2;
    const cy = S / 2;
    const bodyR = S * 0.22;

    // Body
    this._quad(cx, cy, bodyR + 2, bodyR + 2,
      hexToRgba(character.color, 1.0), [0, 1, bodyR, 0]);

    // Subclass ring style
    this._applyRing(cx, cy, bodyR, character.subclass, character.team);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
    return this.tex;
  }

  _applyRing(cx, cy, r, subclass, team) {
    switch (subclass) {
      case 'BREACHER':
        // thin bright ring
        this._quad(cx, cy, r + 8, r + 8,
          hexToRgba('#ffffff', 0.9), [1, 1, r + 6, r + 3]);
        break;
      case 'RAIDER':
        // dashed look — 4 small arcs approximated as dots
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const dx = Math.cos(a) * (r + 8);
          const dy = Math.sin(a) * (r + 8);
          this._quad(cx + dx, cy + dy, 3, 3,
            hexToRgba('#ffffff', 0.8), [0, 1, 2.5, 0]);
        }
        break;
      case 'WARDEN':
        // thick double ring
        this._quad(cx, cy, r + 10, r + 10,
          hexToRgba('#ffffff', 0.85), [1, 1, r + 8, r + 4]);
        this._quad(cx, cy, r + 16, r + 16,
          hexToRgba('#ffffff', 0.6), [1, 1, r + 14, r + 11]);
        break;
      case 'PALADIN':
        // soft outer glow (large low-alpha ring)
        this._quad(cx, cy, r + 20, r + 20,
          hexToRgba(team === 'WARDEN' ? '#3b82f6' : '#ef4444', 0.35),
          [1, 1, r + 18, r + 10]);
        break;
      case 'MEDIC':
        // plus sign
        this._quad(cx, cy, 4, 12,
          hexToRgba('#ffffff', 0.95), [2, 1, 4, 12]);
        this._quad(cx, cy, 12, 4,
          hexToRgba('#ffffff', 0.95), [2, 1, 12, 4]);
        break;
      case 'HYBRID':
        // half ring (draw as ring, will revisit arc support later)
        this._quad(cx, cy, r + 8, r + 8,
          hexToRgba('#ffffff', 0.75), [1, 1, r + 6, r + 3]);
        break;
      case 'SCOUT':
        // 4 crosshair ticks
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          const dx = Math.cos(a) * (r + 10);
          const dy = Math.sin(a) * (r + 10);
          this._quad(cx + dx, cy + dy, 2, 5,
            hexToRgba('#ffffff', 0.85), [2, 1, 2, 5]);
        }
        break;
      case 'LONG':
        // 4 longer ticks at 90° (compass rose)
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const dx = Math.cos(a) * (r + 12);
          const dy = Math.sin(a) * (r + 12);
          this._quad(cx + dx, cy + dy, 2, 6,
            hexToRgba('#ffffff', 0.9), [2, 1, 2, 6]);
        }
        break;
      case 'OPERATOR':
        // clean, no extras
        break;
      case 'GAMBIT':
        // dashed color-shift ring
        this._quad(cx, cy, r + 8, r + 8,
          hexToRgba('#a855f7', 0.85), [1, 1, r + 6, r + 3]);
        break;
      default:
        break;
    }
  }

  _quad(cx, cy, hx, hy, color, params) {
    const [r, g, b, a] = color;
    const [p0, p1, p2, p3] = params;
    const x0 = cx - hx, y0 = cy - hy;
    const x1 = cx + hx, y1 = cy + hy;
    const c = this.cpu;

    const write = (x, y, lx, ly) => {
      c[0] = x;  c[1] = y;
      c[2] = lx; c[3] = ly;
      c[4] = r;  c[5] = g; c[6] = b; c[7] = a;
      c[8] = p0; c[9] = p1; c[10] = p2; c[11] = p3;
    };

    // We rebuild the buffer for each quad and draw immediately.
    // Slow but fine — portraits render once at load.
    const buf = new Float32Array(4 * 12);
    const set = (i, x, y, lx, ly) => {
      buf[i * 12 + 0] = x;  buf[i * 12 + 1] = y;
      buf[i * 12 + 2] = lx; buf[i * 12 + 3] = ly;
      buf[i * 12 + 4] = r;  buf[i * 12 + 5] = g;
      buf[i * 12 + 6] = b;  buf[i * 12 + 7] = a;
      buf[i * 12 + 8] = p0; buf[i * 12 + 9] = p1;
      buf[i * 12 + 10] = p2; buf[i * 12 + 11] = p3;
    };
    set(0, x0, y0, -hx, -hy);
    set(1, x1, y0,  hx, -hy);
    set(2, x0, y1, -hx,  hy);
    set(3, x1, y1,  hx,  hy);

    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, buf, gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }
}