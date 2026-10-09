export class Loop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.STEP = 1 / 60;
    this.acc = 0;
    this.last = 0;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.1) dt = 0.1;
      this.acc += dt;
      while (this.acc >= this.STEP) {
        this.update(this.STEP);
        this.acc -= this.STEP;
      }
      this.render(this.acc / this.STEP);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop() { this.running = false; }
}