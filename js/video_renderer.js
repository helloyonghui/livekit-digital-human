(function (global) {
  'use strict';

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('createShader failed');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('Shader compile failed: ' + info);
    }
    return shader;
  }

  function createProgram(gl, vsSource, fsSource) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    if (!program) throw new Error('createProgram failed');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error('Program link failed: ' + info);
    }
    return program;
  }

  const VS = `
    attribute vec2 a_pos;
    attribute vec2 a_uv;
    varying vec2 v_uv;
    void main() {
      v_uv = a_uv;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  const FS = `
    precision mediump float;
    varying vec2 v_uv;
    uniform sampler2D u_tex;
    void main() {
      gl_FragColor = texture2D(u_tex, v_uv);
    }
  `;

  class WebGLVideoRendererBasic {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {{logFps?: boolean, contextAttributes?: WebGLContextAttributes}} [opts]
     */
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.logFps = !!opts.logFps;

      const ctxAttrs = Object.assign({
        alpha: false,
        antialias: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
        desynchronized: true
      }, opts.contextAttributes || {});

      const gl = canvas.getContext('webgl', ctxAttrs) || canvas.getContext('experimental-webgl', ctxAttrs);
      if (!gl) throw new Error('WebGL not supported');
      this.gl = gl;

      // context lost / restored
      this._onCtxLost = (e) => {
        try { e.preventDefault(); } catch (_) {}
        this._ctxLost = true;
        this._teardownGlResources(false);
      };
      this._onCtxRestored = () => {
        try { this._initGlResources(); } catch (err) { console.error('webgl restore failed', err); }
        this._ctxLost = false;
        if (this._video) this._kickLoop();
      };
      canvas.addEventListener('webglcontextlost', this._onCtxLost, false);
      canvas.addEventListener('webglcontextrestored', this._onCtxRestored, false);

      // resources
      this._program = null;
      this._posBuf = null;
      this._uvBuf = null;
      this._tex = null;
      this._uTex = null;
      this._posLoc = -1;
      this._uvLoc = -1;

      this._prevW = 0;
      this._prevH = 0;
      this._video = null;
      this._rid = null;
      this._ctxLost = false;

      this._fpsSecond = -1;
      this._fpsCnt = 0;

      this._initGlResources();
    }

    _initGlResources() {
      const gl = this.gl;
      this._program = createProgram(gl, VS, FS);
      gl.useProgram(this._program);

      this._posLoc = gl.getAttribLocation(this._program, 'a_pos');
      this._uvLoc = gl.getAttribLocation(this._program, 'a_uv');
      this._uTex = gl.getUniformLocation(this._program, 'u_tex');

      // Quad buffers
      this._posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this._posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1
      ]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this._posLoc);
      gl.vertexAttribPointer(this._posLoc, 2, gl.FLOAT, false, 0, 0);

      this._uvBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this._uvBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 0,
        1, 0,
        0, 1,
        1, 1
      ]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this._uvLoc);
      gl.vertexAttribPointer(this._uvLoc, 2, gl.FLOAT, false, 0, 0);

      // Texture
      this._tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.uniform1i(this._uTex, 0);

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);

      // reset size markers
      this._prevW = 0;
      this._prevH = 0;
    }

    _teardownGlResources(deleteProgram = true) {
      const gl = this.gl;
      try {
        if (this._tex) { gl.deleteTexture(this._tex); this._tex = null; }
        if (this._posBuf) { gl.deleteBuffer(this._posBuf); this._posBuf = null; }
        if (this._uvBuf) { gl.deleteBuffer(this._uvBuf); this._uvBuf = null; }
        if (deleteProgram && this._program) { gl.deleteProgram(this._program); this._program = null; }
      } catch (e) {
        console.warn('teardown failed', e);
      }
    }

    _ensureSize(width, height) {
      if (width <= 0 || height <= 0) return;

      const gl = this.gl;
      const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      width = Math.min(width, maxSize);
      height = Math.min(height, maxSize);

      if (width !== this._prevW || height !== this._prevH) {
        this._prevW = width;
        this._prevH = height;
        this.canvas.width = width;
        this.canvas.height = height;
        gl.viewport(0, 0, width, height);

        gl.bindTexture(gl.TEXTURE_2D, this._tex);
        // 使用 RGBA，兼容性更好
        gl.texImage2D(
          gl.TEXTURE_2D, 0,
          gl.RGBA, width, height, 0,
          gl.RGBA, gl.UNSIGNED_BYTE, null
        );
      }
    }

    _drawFrame() {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this._tex);
      // 将视频像素上传到纹理
      gl.texSubImage2D(
        gl.TEXTURE_2D, 0, 0, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, this._video
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    _nextTick() {
      if (!this._video) return;
      if (this._video.requestVideoFrameCallback) {
        this._rid = this._video.requestVideoFrameCallback(this._frame);
      } else {
        this._rid = global.requestAnimationFrame(() => this._frame(performance.now(), null));
      }
    }

    _frame = (now, metadata) => {
      try {
        if (!this._video || this._ctxLost) return;

        if (this._video.readyState < 2 || this._video.videoWidth <= 0 || this._video.videoHeight <= 0) {
          this._nextTick();
          return;
        }

        const vw = this._video.videoWidth;
        const vh = this._video.videoHeight;

        this._ensureSize(vw, vh);

        // 如果尺寸刚变化，texImage2D 已在 _ensureSize 里做了分配
        this._drawFrame();

        if (this.logFps) {
          const sec = new Date().getSeconds();
          if (sec !== this._fpsSecond) {
            if (this._fpsSecond !== -1) {
              console.log('[renderer] fps', this._fpsCnt);
            }
            this._fpsSecond = sec;
            this._fpsCnt = 1;
          } else {
            this._fpsCnt += 1;
          }
        }
      } catch (err) {
        console.warn('WebGLVideoRendererBasic frame error:', err);
      } finally {
        this._nextTick();
      }
    };

    _kickLoop() {
      if (!this._video) return;
      
      // 强制使用25fps渲染，与后端保持一致
      const targetFPS = 25;
      const frameInterval = 1000 / targetFPS; // 40ms per frame
      
      this._rid = setTimeout(() => {
        this._frame(performance.now(), null);
      }, frameInterval);
    }

    _nextTick() {
      // 使用固定帧率而不是requestAnimationFrame
      this._kickLoop();
    }

    /**
     * @param {HTMLVideoElement} video
     */
    start(video) {
      this._video = video;
      if (video.readyState >= 1) {
        this._kickLoop();
      } else {
        const startLoop = () => this._kickLoop();
        video.addEventListener('loadedmetadata', startLoop, { once: true });
      }
    }

    stop() {
      try {
        if (this._rid) {
          clearTimeout(this._rid);
        }
      } catch (_) {}
      this._rid = null;
      this._video = null;
    }
  }

  global.WebGLVideoRendererBasic = WebGLVideoRendererBasic;
})(window);