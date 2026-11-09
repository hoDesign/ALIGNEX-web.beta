(() => {
  'use strict';

  // 배경 전용 WebGL: 24초 루프, 가시성·재생 상태·모션 설정에 맞춰 렌더링.
  const instances = new WeakMap();
  class MembraneBackground {
    constructor(root) {
      this.root = root;
      this.canvas = root.querySelector('canvas');
      this.preference = matchMedia('(prefers-reduced-motion: reduce)');
      this.mobile = matchMedia('(max-width: 767px)');
      this.mode = new URLSearchParams(location.search).get('valuesBackground') === 'original' ? 'original' : 'membrane';
      this.root.dataset.mode = this.mode;
      this.active = false;
      this.visible = false;
      this.elapsed = 0;
      this.lastTick = null;
      this.lastDraw = -Infinity;
      this.frame = 0;
      this.draws = 0;
      this.gl = null;
      this.lost = false;
      this.failed = false;
      this.root.dataset.renderer = 'static';
      this.onVisibility = () => this.sync();
      document.addEventListener('visibilitychange', this.onVisibility);
      this.preference.addEventListener('change', this.onVisibility);
      this.mobile.addEventListener('change', () => { this.resize(); this.sync(); });
      this.observer = new IntersectionObserver(entries => {
        this.visible = entries[0].isIntersecting && entries[0].intersectionRatio > .05;
        this.sync();
      }, { threshold: [0, .05] });
      this.observer.observe(root);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(root);
      this.canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        this.lost = true;
        this.stop();
        this.root.dataset.renderer = 'static';
      });
      this.canvas.addEventListener('webglcontextrestored', () => {
        this.gl = null;
        this.lost = false;
        this.failed = false;
        this.sync();
      });
    }
    initialize() {
      if (this.gl || this.failed || this.lost || this.preference.matches || this.mode === 'original') return;
      try {
        const shaders = window.MembraneShaders;
        if (!shaders) throw new Error('Membrane shaders unavailable');
        const gl = this.canvas.getContext('webgl', {
          alpha: false, antialias: false, depth: false, stencil: false,
          premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power'
        });
        if (!gl) throw new Error('WebGL unavailable');
        this.gl = gl;
        const compile = (type, source) => {
          const shader = gl.createShader(type);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(message);
          }
          return shader;
        };
        const vertex = compile(gl.VERTEX_SHADER, shaders.vertex);
        const fragment = compile(gl.FRAGMENT_SHADER, shaders.fragment);
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        this.program = program;
        gl.useProgram(program);
        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'aPosition');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        this.resolution = gl.getUniformLocation(program, 'uResolution');
        this.phase = gl.getUniformLocation(program, 'uPhase');
        this.resize();
      } catch (_) {
        this.failed = true;
        this.gl = null;
        this.root.dataset.renderer = 'static';
      }
    }
    resize() {
      if (!this.gl || this.lost) return;
      const { width, height } = this.root.getBoundingClientRect();
      if (!width || !height) return;
      const budget = this.mobile.matches ? 420000 : 1100000;
      const scale = Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(budget / (width * height)));
      this.canvas.width = Math.max(1, Math.round(width * scale));
      this.canvas.height = Math.max(1, Math.round(height * scale));
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      if (!this.preference.matches) this.draw();
    }
    draw() {
      if (!this.gl || this.lost || this.preference.matches) return;
      const gl = this.gl;
      gl.uniform2f(this.resolution, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.phase, (this.elapsed % 24000) / 24000 * Math.PI * 2);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.draws++;
      this.root.dataset.renderer = 'webgl';
    }
    canRun() {
      return this.mode === 'membrane' && this.active && this.visible && !document.hidden &&
        !this.preference.matches && !this.lost && !this.failed;
    }
    setActive(active) {
      if (active === this.active) return;
      this.active = active;
      this.sync();
    }
    stop() {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.lastTick = null;
    }
    sync() {
      this.stop();
      if (this.preference.matches || this.mode === 'original' || this.lost) {
        this.root.dataset.renderer = 'static';
      }
      if (!this.canRun()) return;
      this.initialize();
      if (!this.gl || this.failed) return;
      this.draw();
      this.lastDraw = -Infinity;
      this.frame = requestAnimationFrame(time => this.tick(time));
    }
    tick(time) {
      this.frame = 0;
      if (!this.canRun()) { this.stop(); return; }
      if (this.lastTick !== null) this.elapsed += Math.min(100, time - this.lastTick);
      this.lastTick = time;
      const interval = 1000 / (this.mobile.matches ? 24 : 30);
      if (time - this.lastDraw >= interval - .5) {
        this.draw();
        this.lastDraw = time;
      }
      this.frame = requestAnimationFrame(next => this.tick(next));
    }
    getState() {
      return { mode: this.mode, renderer: this.root.dataset.renderer, running: Boolean(this.frame),
        elapsedMs: this.elapsed, durationMs: 24000, draws: this.draws,
        width: this.canvas.width, height: this.canvas.height, reducedMotion: this.preference.matches };
    }
  }
  window.ALIGNEXMembrane = Object.freeze({
    mount(root) {
      if (!root) return null;
      if (!instances.has(root)) instances.set(root, new MembraneBackground(root));
      return instances.get(root);
    }
  });
})();
