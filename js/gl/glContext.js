export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: true,
    alpha: false,
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL2 not supported in this browser.');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Prefer visualViewport when present — it reflects the truly visible area
    // even when browser chrome is over the page.
    const vv = window.visualViewport;
    const cssW = Math.round(vv ? vv.width  : window.innerWidth);
    const cssH = Math.round(vv ? vv.height : window.innerHeight);

    // Set CSS size explicitly so the canvas always matches the visible viewport
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.style.position = 'fixed';
    canvas.style.left = '0';
    canvas.style.top  = '0';

    const devW = Math.floor(cssW * dpr);
    const devH = Math.floor(cssH * dpr);

    if (canvas.width !== devW || canvas.height !== devH) {
      canvas.width = devW;
      canvas.height = devH;
    }
    gl.viewport(0, 0, devW, devH);

    return {
      w: devW, h: devH,       // device pixels (renderer space)
      cssW, cssH,             // CSS pixels (HUD design space — we use these)
      dpr,
    };
  }

  return { gl, resize };
}