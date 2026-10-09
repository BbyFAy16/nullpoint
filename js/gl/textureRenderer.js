import { createProgram } from './shaders.js';

const TEX_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_position;
layout(location=1) in vec2 a_uv;
uniform mat3 u_projection;
out vec2 v_uv;
void main() {
  vec3 p = u_projection * vec3(a_position, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  v_uv = a_uv;
}
`;

const TEX_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_tex;
uniform vec4 u_tint;
void main() {
  vec4 c = texture(u_tex, v_uv);
  outColor = c * u_tint;
}
`;

export class TextureRenderer {
  constructor(gl) {
    this.gl = gl;
    this.program = createProgram(gl, TEX_VS, TEX_FS);
    this.uProjection = gl.getUniformLocation(this.program, 'u_projection');
    this.uTex = gl.getUniformLocation(this.program, 'u_tex');
    this.uTint = gl.getUniformLocation(this.program, 'u_tint');

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const stride = (2 + 2) * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.bindVertexArray(null);

    this.cpu = new Float32Array(4 * 4);   // 4 verts × 4 floats
    this.ibo = gl.createBuffer();
    const indices = new Uint32Array([0, 1, 2, 2, 1, 3]);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    this._projection = null;
  }

  begin(projectionMatrix) {
    this._projection = projectionMatrix;
  }

  /**
   * Draw a texture into a screen-space rect.
   * x, y = top-left in CSS pixels. w, h = size.
   * tint = [r,g,b,a] (default [1,1,1,1])
   */
  draw(tex, x, y, w, h, tint = [1, 1, 1, 1]) {
    const gl = this.gl;
    const c = this.cpu;

    // TL, TR, BL, BR
    c[0]  = x;     c[1]  = y;     c[2]  = 0; c[3]  = 0;
    c[4]  = x + w; c[5]  = y;     c[6]  = 1; c[7]  = 0;
    c[8]  = x;     c[9]  = y + h; c[10] = 0; c[11] = 1;
    c[12] = x + w; c[13] = y + h; c[14] = 1; c[15] = 1;

    gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.uProjection, false, this._projection);
    gl.uniform4fv(this.uTint, tint);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.uTex, 0);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, c, gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }
}