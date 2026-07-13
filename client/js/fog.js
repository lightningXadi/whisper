// Reusable procedural fog/noise background shader — no stock images needed.
function initFogCanvas(containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);

  function syncSize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  new ResizeObserver(syncSize).observe(canvas);
  syncSize();

  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return;

  const vs = `attribute vec2 a_position; varying vec2 v_uv;
    void main(){ v_uv = a_position*0.5+0.5; gl_Position = vec4(a_position,0.0,1.0); }`;
  const fs = `precision highp float; varying vec2 v_uv; uniform float u_time;
    vec3 permute(vec3 x){ return mod(((x*34.0)+1.0)*x,289.0); }
    float snoise(vec2 v){
      const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
      vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
      vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod(i, 289.0);
      vec3 p = permute(permute(i.y + vec3(0.0,i1.y,1.0)) + i.x + vec3(0.0,i1.x,1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m; m = m*m;
      vec3 x = 2.0*fract(p*C.www)-1.0; vec3 h = abs(x)-0.5;
      vec3 ox = floor(x+0.5); vec3 a0 = x-ox;
      m *= 1.79284291400159 - 0.85373472095314*(a0*a0+h*h);
      vec3 g; g.x = a0.x*x0.x + h.x*x0.y; g.yz = a0.yz*x12.xz + h.yz*x12.yw;
      return 130.0*dot(m,g);
    }
    void main(){
      vec2 uv = v_uv;
      vec3 c1 = vec3(0.102,0.169,0.137); vec3 c2 = vec3(0.059,0.102,0.082); vec3 fogc = vec3(0.545,0.659,0.604);
      float n1 = snoise(uv*2.0 + u_time*0.04); float n2 = snoise(uv*4.0 - u_time*0.025);
      float fog = smoothstep(-0.5,1.5,n1+n2);
      vec3 base = mix(c1, c2, uv.y);
      vec3 col = mix(base, fogc, fog*0.14);
      float grain = fract(sin(dot(uv, vec2(12.9898,78.233)))*43758.5453);
      col += (grain-0.5)*0.015;
      gl_FragColor = vec4(col,1.0);
    }`;

  function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(prog, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  const uTime = gl.getUniformLocation(prog, 'u_time');

  function render(t) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(uTime, t * 0.001);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}
