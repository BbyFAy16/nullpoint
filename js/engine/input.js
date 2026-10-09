export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false };
    this._handlers = { keydown: [], keyup: [] };

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      for (const h of this._handlers.keydown) h(e.code);
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "Space",
          "Tab",
          "KeyR",
          "KeyQ",
          "KeyE",
          "ShiftLeft",
          "ShiftRight",
          "F3",
          "Escape",
        ].includes(e.code)
      ) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      for (const h of this._handlers.keyup) h(e.code);
    });
    window.addEventListener("blur", () => this.keys.clear());

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = canvas.width / rect.width;
      this.mouse.x = (e.clientX - rect.left) * dpr;
      this.mouse.y = (e.clientY - rect.top) * dpr;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.mouse.down = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  isDown(code) {
    return this.keys.has(code);
  }
  onKeyDown(fn) {
    this._handlers.keydown.push(fn);
  }
  onKeyUp(fn) {
    this._handlers.keyup.push(fn);
  }
}
