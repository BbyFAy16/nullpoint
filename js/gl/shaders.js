// ---------- SHAPE (circles, rings, rects via SDF) ----------
export const SHAPE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_position;   // world-space corner
layout(location=1) in vec2 a_local;      // local-space offset
layout(location=2) in vec4 a_color;
layout(location=3) in vec4 a_params;     // (kind, aa, r0, r1)
layout(location=4) in vec4 a_extra;      // (cornerRadius, arcStart, arcSweep, outlineThickness)

uniform mat3 u_camera;

out vec2 v_local;
out vec4 v_color;
out vec4 v_params;
out vec4 v_extra;

void main() {
  vec3 world = u_camera * vec3(a_position, 1.0);
  gl_Position = vec4(world.xy, 0.0, 1.0);
  v_local = a_local;
  v_color = a_color;
  v_params = a_params;
  v_extra = a_extra;
}
`;

// kind: 0 = circle, 1 = ring, 2 = rect
// params.x = kind
// params.y = aa width
// params.z = r0 (radius OR halfW)
// params.w = r1 (innerRadius OR halfH)
export const SHAPE_FS = `#version 300 es
precision highp float;

in vec2 v_local;
in vec4 v_color;
in vec4 v_params;
in vec4 v_extra;

out vec4 outColor;

const float TAU = 6.28318530718;

void main() {
  float kind = v_params.x;
  float aa   = v_params.y;
  float r0   = v_params.z;
  float r1   = v_params.w;

  float alpha = 1.0;

  if (kind < 0.5) {
    // filled circle
    float d = length(v_local);
    alpha = smoothstep(r0, r0 - aa, d);
  } else if (kind < 1.5) {
    // ring, optionally an arc: extra.y = start angle, extra.z = sweep (0 = full)
    float d = length(v_local);
    float outer = smoothstep(r0, r0 - aa, d);
    float inner = smoothstep(r1, r1 + aa, d);
    alpha = outer * inner;
    if (v_extra.z > 0.0) {
      float a = atan(v_local.y, v_local.x) - v_extra.y;
      a = a - TAU * floor(a / TAU);          // wrap to [0, TAU)
      float edge = aa / max(r1, 1.0);        // angular AA width
      alpha *= 1.0 - smoothstep(v_extra.z - edge, v_extra.z, a);
    }
  } else {
    // (rounded) rect: r0 = halfW, r1 = halfH, extra.x = corner radius,
    // extra.w > 0 draws an inner-edge outline of that thickness only.
    float rad = clamp(v_extra.x, 0.0, min(r0, r1));
    vec2 d = abs(v_local) - vec2(r0 - rad, r1 - rad);
    float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - rad;
    alpha = smoothstep(0.0, -aa, sd);
    if (v_extra.w > 0.0) {
      alpha *= smoothstep(-v_extra.w - aa, -v_extra.w, sd);
    }
  }

  if (alpha <= 0.001) discard;
  outColor = vec4(v_color.rgb, v_color.a * alpha);
}
`;

// ---------- LINE ----------
export const LINE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_position;
layout(location=1) in vec4 a_color;
uniform mat3 u_camera;
out vec4 v_color;
void main() {
  vec3 world = u_camera * vec3(a_position, 1.0);
  gl_Position = vec4(world.xy, 0.0, 1.0);
  v_color = a_color;
}
`;

export const LINE_FS = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() { outColor = v_color; }
`;

// ---------- TEXT (MSDF) ----------
export const TEXT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_position;
layout(location=1) in vec2 a_uv;
layout(location=2) in vec4 a_color;
uniform mat3 u_projection;
out vec2 v_uv;
out vec4 v_color;
void main() {
  vec3 p = u_projection * vec3(a_position, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
}
`;

export const TEXT_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_color;
out vec4 outColor;
uniform sampler2D u_atlas;
uniform float u_pxRange;     // distance range of the atlas, in atlas pixels
uniform float u_sizeScale;   // outline thickness in screen px (0 = none)

float median(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

void main() {
  // The atlas is a true MSDF: the signed distance is the median of R, G, B.
  vec3 msd = texture(u_atlas, v_uv).rgb;
  float d = median(msd.r, msd.g, msd.b);

  // Convert the atlas distance range into screen pixels so edges are
  // exactly ~1px soft at any size.
  vec2 unitRange = vec2(u_pxRange) / vec2(textureSize(u_atlas, 0));
  vec2 screenTexSize = vec2(1.0) / fwidth(v_uv);
  float screenPxRange = max(0.5 * dot(unitRange, screenTexSize), 1.0);
  float sd = screenPxRange * (d - 0.5);

  float fillA = clamp(sd + 0.5, 0.0, 1.0);
  float outA  = clamp(sd + 0.5 + u_sizeScale, 0.0, 1.0) * 0.85;

  vec3 col = mix(vec3(0.015, 0.025, 0.04), v_color.rgb, fillA);
  float a = max(fillA, outA) * v_color.a;
  if (a <= 0.003) discard;
  outColor = vec4(col, a);
}
`;

// ---------- Helpers ----------
export function compileShader(gl, type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile error:\n${log}\n\nSource:\n${source}`);
  }
  return sh;
}

export function createProgram(gl, vsSource, fsSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    throw new Error(`Program link error:\n${log}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}