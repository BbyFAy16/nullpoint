import { TEXT_VS, TEXT_FS, createProgram } from './shaders.js';

// The MSDF atlases only cover printable ASCII (32-126). Anything else used
// to render as a blank gap, so map common typographic characters onto
// ASCII equivalents instead.
const GLYPH_FALLBACKS = {
  '\u00b7': '|',  '\u2022': '*',  '\u2014': '-',  '\u2013': '-',
  '\u2026': '...', '\u221e': 'INF', '\u2694': 'x',  '\u00d7': 'x',
  '\u2192': '>',  '\u2190': '<',  '\u2019': "'",  '\u2018': "'",
  '\u201c': '"',  '\u201d': '"',
};
const GLYPH_RE = /[^\x20-\x7e]/g;
export function asciiSafe(str) {
  const s = String(str);
  return GLYPH_RE.test(s) ? s.replace(GLYPH_RE, c => GLYPH_FALLBACKS[c] ?? '?') : s;
}

export class TextRenderer {
  constructor(gl) {
    this.gl = gl;
    this.program = createProgram(gl, TEXT_VS, TEXT_FS);
    this.uProjection = gl.getUniformLocation(this.program, 'u_projection');
    this.uAtlas = gl.getUniformLocation(this.program, 'u_atlas');
    this.uPxRange = gl.getUniformLocation(this.program, 'u_pxRange');
    this.uSizeScale = gl.getUniformLocation(this.program, 'u_sizeScale');

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const stride = (2 + 2 + 4) * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
    gl.bindVertexArray(null);

    this.fonts = new Map();       // name → font data
    this.cpu = new Float32Array(16384 * 8);
    this.cpuIndex = 0;
    this.vertexCount = 0;
    this.currentFont = null;
    this._lastFont = null;
    this._projection = null;
  }

  async loadFont(name, pngUrl, jsonUrl) {
    const [img, json] = await Promise.all([
      loadImage(pngUrl),
      fetch(jsonUrl).then(r => r.json()),
    ]);

    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // --- Normalize the JSON shape ---
    // Handles: { chars: [...] }, { glyphs: { chars: [...] } }, { glyphs: [...] }
    let rawChars =
      json.chars ||
      (json.glyphs && json.glyphs.chars) ||
      (Array.isArray(json.glyphs) ? json.glyphs : null) ||
      null;

    if (!rawChars || !Array.isArray(rawChars)) {
      console.error('Unrecognized font JSON shape. Keys:', Object.keys(json));
      throw new Error(`Font ${name}: cannot find glyph array in JSON`);
    }

    const glyphs = new Map();
    for (const g of rawChars) {
      const ch = g.char !== undefined
        ? g.char
        : String.fromCharCode(g.id);

      glyphs.set(ch, {
        char:    ch,
        x:       g.x,
        y:       g.y,
        width:   g.width,
        height:  g.height,
        offsetX: g.xoffset  ?? g.offsetX  ?? 0,
        offsetY: g.yoffset  ?? g.offsetY  ?? 0,
        advance: g.xadvance ?? g.advance  ?? 0,
      });
    }

    const distanceRange =
      (json.info && json.info.distanceRange) ||
      json.distanceRange ||
      4;

    const atlasSize =
      (json.info && json.info.size) ||
      json.size ||
      48;

    const common = json.common || {};

    // Cap-height top, taken from 'H' (BMFont yoffset is measured from the
    // top of the line cell). Used so alignY 'top' / 'middle' refer to the
    // visible capital letters instead of the empty line box.
    const capGlyph = glyphs.get('H') || glyphs.get('E') || glyphs.get('0');
    const capTop = capGlyph ? capGlyph.offsetY : Math.round(atlasSize * 0.2);

    this.fonts.set(name, {
      tex,
      capTop,
      glyphs,
      atlasSize,
      distanceRange,
      lineHeight: common.lineHeight || atlasSize,
      base:       common.base       || Math.floor(atlasSize * 0.8),
      scaleW:     common.scaleW     || img.width,
      scaleH:     common.scaleH     || img.height,
    });

    console.log(
      `[TextRenderer] Loaded ${name}: ${glyphs.size} glyphs, ` +
      `size=${atlasSize}, range=${distanceRange}, ` +
      `atlas=${common.scaleW || img.width}x${common.scaleH || img.height}`
    );
  }

  begin(projectionMatrix) {
    this._projection = projectionMatrix;
    this.cpuIndex = 0;
    this.vertexCount = 0;
    this._lastFont = null;
  }

  _pushVert(x, y, u, v, r, g, b, a) {
    const c = this.cpu;
    let i = this.cpuIndex;
    c[i++] = x; c[i++] = y;
    c[i++] = u; c[i++] = v;
    c[i++] = r; c[i++] = g; c[i++] = b; c[i++] = a;
    this.cpuIndex = i;
    this.vertexCount++;
  }

  /**
   * Draw text in screen-space pixels.
   * alignX: 'left' | 'center' | 'right'
   * alignY: 'top' | 'middle' | 'baseline'
   */
  draw(text, x, y, sizePx, color, fontName = 'inter', alignX = 'left', alignY = 'top') {
    const font = this.fonts.get(fontName);
    if (!font) return;
    text = asciiSafe(text);

    // If the font changed since last draw, flush the current batch first
    // so mixed-font frames render correctly.
    if (this._lastFont && this._lastFont !== font) {
      this._flushCurrent();
    }
    this._lastFont = font;

    const scale = sizePx / font.atlasSize;
    const [r, g, b, a] = color;

    // Measure total width first for alignment
    let totalWidth = 0;
    for (const ch of text) {
      const glyph = font.glyphs.get(ch);
      if (!glyph) continue;
      totalWidth += glyph.advance * scale;
    }

    let penX = x;
    if (alignX === 'center') penX -= totalWidth / 2;
    else if (alignX === 'right') penX -= totalWidth;

    // lineTop = y of the top of the BMFont line cell.
    //   top      -> y is the top of capital letters
    //   middle   -> y is the vertical centre of capital letters
    //   baseline -> y is the text baseline
    const base = font.base;
    const capTop = font.capTop;
    let lineTop;
    if (alignY === 'middle') lineTop = y - ((capTop + base) / 2) * scale;
    else if (alignY === 'baseline') lineTop = y - base * scale;
    else lineTop = y - capTop * scale;

    for (const ch of text) {
      const glyph = font.glyphs.get(ch);
      if (!glyph) { penX += sizePx * 0.3; continue; }

      if (glyph.width > 0) {
        const gx = penX + glyph.offsetX * scale;
        const gy = lineTop + glyph.offsetY * scale;
        const gw = glyph.width * scale;
        const gh = glyph.height * scale;

        const u0 = glyph.x / font.scaleW;
        const v0 = glyph.y / font.scaleH;
        const u1 = (glyph.x + glyph.width) / font.scaleW;
        const v1 = (glyph.y + glyph.height) / font.scaleH;

        this._pushVert(gx,      gy,      u0, v0, r, g, b, a);
        this._pushVert(gx + gw, gy,      u1, v0, r, g, b, a);
        this._pushVert(gx,      gy + gh, u0, v1, r, g, b, a);

        this._pushVert(gx + gw, gy,      u1, v0, r, g, b, a);
        this._pushVert(gx + gw, gy + gh, u1, v1, r, g, b, a);
        this._pushVert(gx,      gy + gh, u0, v1, r, g, b, a);
      }
      penX += glyph.advance * scale;
    }
  }

  measure(text, sizePx, fontName = 'inter') {
    const font = this.fonts.get(fontName);
    if (!font) return 0;
    text = asciiSafe(text);
    const scale = sizePx / font.atlasSize;
    let w = 0;
    for (const ch of text) {
      const g = font.glyphs.get(ch);
      if (!g) continue;
      w += g.advance * scale;
    }
    return w;
  }

  /** Flush currently batched glyphs using the currently bound font. */
  _flushCurrent() {
    const gl = this.gl;
    if (this.vertexCount === 0) return;
    const font = this._lastFont;
    if (!font) return;

    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uProjection, false, this._projection);
    gl.uniform1f(this.uPxRange, font.distanceRange);
    gl.uniform1f(this.uSizeScale, 1.1);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, font.tex);
    gl.uniform1i(this.uAtlas, 0);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.cpu.subarray(0, this.cpuIndex), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.bindVertexArray(null);

    // Reset for next batch
    this.cpuIndex = 0;
    this.vertexCount = 0;
  }

  flush() {
    this._flushCurrent();
    this._lastFont = null;
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}