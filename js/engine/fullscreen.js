export class FullscreenManager {
  constructor(canvas, onResize) {
    this.canvas = canvas;
    this.onResize = onResize;
    this.active = false;

    // Fullscreen change (user pressed Esc, browser exited, etc.)
    document.addEventListener('fullscreenchange', () => {
      this.active = !!document.fullscreenElement;
      this._scheduleResize();
    });

    // Visual viewport changes (mobile keyboard, browser chrome)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this._scheduleResize());
      window.visualViewport.addEventListener('scroll', () => this._scheduleResize());
    }

    // Standard resize
    window.addEventListener('resize', () => this._scheduleResize());

    // Enter fullscreen on first gesture
    const enterOnce = () => {
      this.enter();
      window.removeEventListener('pointerdown', enterOnce);
      window.removeEventListener('keydown', enterOnce);
    };
    window.addEventListener('pointerdown', enterOnce);
    window.addEventListener('keydown', enterOnce);
  }

  enter() {
    if (this.active) return;
    const el = document.documentElement;   // fullscreen the whole page, not just canvas
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (!req) return;                       // not supported — game still runs windowed
    Promise.resolve(req.call(el)).catch(() => {
      // User denied or browser blocked — game still runs windowed
    });
  }

  _scheduleResize() {
    // Wait one frame so the browser has applied new dimensions
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.onResize());
    });
  }
}