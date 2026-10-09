import { SHAPE_VS, SHAPE_FS, LINE_VS, LINE_FS, createProgram } from './shaders.js';

// params = (kind, aa, r0, r1)
//   kind: 0=circle, 1=ring, 2=rect
//   circle:  r0 = radius,    r1 = unused
//   ring:    r0 = outer,     r1 = inner
//   rect:    r0 = halfW,     r1 = halfH

const ZERO_EXTRA = [0, 0, 0, 0];

export class ShapeRenderer {
  constructor(gl) {
    this.gl = gl;
    this.program = createProgram(gl, SHAPE_VS, SHAPE_FS);
    this.uCamera = gl.getUniformLocation(this.program, 'u_camera');

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    const stride = (2 + 2 + 4 + 4 + 4) * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 32);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, stride, 48);
    gl.bindVertexArray(null);

    this.maxQuads = 16384;
    this.cpu = new Float32Array(this.maxQuads * 4 * 16);
    this.cpuIndex = 0;
    this.indexCount = 0;

    this.ibo = gl.createBuffer();
    const maxIdx = this.maxQuads * 6;
    const indices = new Uint32Array(maxIdx);
    for (let i = 0, v = 0; i < maxIdx; i += 6, v += 4) {
      indices[i + 0] = v + 0;
      indices[i + 1] = v + 1;
      indices[i + 2] = v + 2;
      indices[i + 3] = v + 2;
      indices[i + 4] = v + 1;
      indices[i + 5] = v + 3;
    }
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  begin() {
    this.cpuIndex = 0;
    this.indexCount = 0;
  }

  _pushVertex(x, y, lx, ly, r, g, b, a, p0, p1, p2, p3, e0, e1, e2, e3) {
    const c = this.cpu;
    let i = this.cpuIndex;
    c[i++] = x; c[i++] = y;
    c[i++] = lx; c[i++] = ly;
    c[i++] = r; c[i++] = g; c[i++] = b; c[i++] = a;
    c[i++] = p0; c[i++] = p1; c[i++] = p2; c[i++] = p3;
    c[i++] = e0; c[i++] = e1; c[i++] = e2; c[i++] = e3;
    this.cpuIndex = i;
  }

  _pushQuad(cx, cy, hx, hy, color, params, extra = ZERO_EXTRA) {
    if (this.indexCount >= this.maxQuads * 6) return;
    const [r, g, b, a] = color;
    const [p0, p1, p2, p3] = params;
    const [e0, e1, e2, e3] = extra;
    const x0 = cx - hx, y0 = cy - hy;
    const x1 = cx + hx, y1 = cy + hy;
    const lx0 = -hx, ly0 = -hy;
    const lx1 = hx,  ly1 = hy;

    this._pushVertex(x0, y0, lx0, ly0, r, g, b, a, p0, p1, p2, p3, e0, e1, e2, e3);
    this._pushVertex(x1, y0, lx1, ly0, r, g, b, a, p0, p1, p2, p3, e0, e1, e2, e3);
    this._pushVertex(x0, y1, lx0, ly1, r, g, b, a, p0, p1, p2, p3, e0, e1, e2, e3);
    this._pushVertex(x1, y1, lx1, ly1, r, g, b, a, p0, p1, p2, p3, e0, e1, e2, e3);
    this.indexCount += 6;
  }

  circle(x, y, radius, color, aa = 1.0) {
    const pad = aa + 1;
    this._pushQuad(x, y, radius + pad, radius + pad, color, [0, aa, radius, 0]);
  }

  ring(x, y, radius, inner, color, aa = 1.0) {
    const pad = aa + 1;
    this._pushQuad(x, y, radius + pad, radius + pad, color, [1, aa, radius, inner]);
  }

  /** Real rect with per-axis half-extents. */
  rect(x, y, halfW, halfH, color, aa = 1.0) {
    const pad = aa + 1;
    this._pushQuad(x, y, halfW + pad, halfH + pad, color, [2, aa, halfW, halfH]);
  }

  /** Rounded rectangle. `radius` is the corner radius in the same units. */
  roundRect(x, y, halfW, halfH, radius, color, aa = 1.0) {
    const pad = aa + 1;
    this._pushQuad(x, y, halfW + pad, halfH + pad, color, [2, aa, halfW, halfH], [radius, 0, 0, 0]);
  }

  /** Rounded rectangle outline drawn inside the shape edge. */
  roundRectOutline(x, y, halfW, halfH, radius, thickness, color, aa = 1.0) {
    const pad = aa + 1;
    this._pushQuad(x, y, halfW + pad, halfH + pad, color, [2, aa, halfW, halfH], [radius, 0, 0, thickness]);
  }

  /**
   * Ring arc. `start` is the start angle in radians (0 = +x, clockwise on
   * screen because +y is down) and `sweep` the arc length in radians.
   */
  arc(x, y, radius, inner, start, sweep, color, aa = 1.0) {
    const pad = aa + 1;
    this._pushQuad(x, y, radius + pad, radius + pad, color, [1, aa, radius, inner], [0, start, sweep, 0]);
  }

  flush(camera, viewportW, viewportH) {
    const gl = this.gl;
    if (this.indexCount === 0) return;

    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, camera);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.cpu.subarray(0, this.cpuIndex), gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }
}

export class LineRenderer {
  constructor(gl) {
    this.gl = gl;
    this.program = createProgram(gl, LINE_VS, LINE_FS);
    this.uCamera = gl.getUniformLocation(this.program, 'u_camera');

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const stride = (2 + 4) * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 8);
    gl.bindVertexArray(null);

    this.maxVerts = 32768;
    this.cpu = new Float32Array(this.maxVerts * 6);
    this.cpuIndex = 0;
    this.vertexCount = 0;
  }

  begin() {
    this.cpuIndex = 0;
    this.vertexCount = 0;
  }

  _pushVert(x, y, r, g, b, a) {
    const c = this.cpu;
    let i = this.cpuIndex;
    c[i++] = x; c[i++] = y;
    c[i++] = r; c[i++] = g; c[i++] = b; c[i++] = a;
    this.cpuIndex = i;
    this.vertexCount++;
  }

  line(x0, y0, x1, y1, width, color) {
    if (this.vertexCount + 6 > this.maxVerts) return;
    const [r, g, b, a] = color;
    const dx = x1 - x0, dy = y1 - y0;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l * (width / 2);
    const ny =  dx / l * (width / 2);

    const ax0 = x0 + nx, ay0 = y0 + ny;
    const ax1 = x0 - nx, ay1 = y0 - ny;
    const bx0 = x1 + nx, by0 = y1 + ny;
    const bx1 = x1 - nx, by1 = y1 - ny;

    this._pushVert(ax0, ay0, r, g, b, a);
    this._pushVert(bx0, by0, r, g, b, a);
    this._pushVert(ax1, ay1, r, g, b, a);

    this._pushVert(bx0, by0, r, g, b, a);
    this._pushVert(bx1, by1, r, g, b, a);
    this._pushVert(ax1, ay1, r, g, b, a);
  }

  filledPolygon(points, color) {
    if (points.length < 3) return;
    const [r, g, b, a] = color;
    const origin = points[0];
    for (let i = 1; i < points.length - 1; i++) {
      if (this.vertexCount + 3 > this.maxVerts) return;
      const pointA = points[i];
      const pointB = points[i + 1];
      this._pushVert(origin.x, origin.y, r, g, b, a);
      this._pushVert(pointA.x, pointA.y, r, g, b, a);
      this._pushVert(pointB.x, pointB.y, r, g, b, a);
    }
  }

  /** One triangle with an individual colour per vertex (gradients). */
  triangle(x0, y0, c0, x1, y1, c1, x2, y2, c2) {
    if (this.vertexCount + 3 > this.maxVerts) return;
    this._pushVert(x0, y0, c0[0], c0[1], c0[2], c0[3]);
    this._pushVert(x1, y1, c1[0], c1[1], c1[2], c1[3]);
    this._pushVert(x2, y2, c2[0], c2[1], c2[2], c2[3]);
  }

  /** Gradient quad between two edges: (a0,a1) coloured ca, (b0,b1) coloured cb. */
  strip(a0, a1, ca, b0, b1, cb) {
    this.triangle(a0.x, a0.y, ca, a1.x, a1.y, ca, b0.x, b0.y, cb);
    this.triangle(a1.x, a1.y, ca, b1.x, b1.y, cb, b0.x, b0.y, cb);
  }

  flush(camera, additive = false) {
    const gl = this.gl;
    if (this.vertexCount === 0) return;
    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uCamera, false, camera);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.cpu.subarray(0, this.cpuIndex), gl.DYNAMIC_DRAW);
    if (additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    if (additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(null);
  }
}