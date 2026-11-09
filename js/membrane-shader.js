/* Grayscale folded membrane. uPhase is one full 24-second cycle in radians. */
window.MembraneShaders = {
  vertex: `
    attribute vec2 aPosition;
    void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
  `,
  fragment: `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform vec2 uResolution;
    uniform float uPhase;

    float band(float x, float low, float high, float aa) {
      // Only the central crease is sharp; outer edges dissolve into the background.
      return smoothstep(low, mix(low, high, 0.65), x)
        * (1.0 - smoothstep(high - aa, high + aa, x));
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution;
      vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
      // Fixed diagonal axes: the membrane deforms, the camera never rotates.
      float along = dot(p, vec2(0.80, 0.60));
      float across = dot(p, vec2(-0.60, 0.80));
      float phase = uPhase;
      float aa = 1.4 / uResolution.y;

      // A continuous, curved fold and two independently opening surfaces.
      float bend = 0.12 * sin(phase) + 0.09 * sin(2.0 * phase + 0.65);
      float crease = 0.05 + bend * sin(along * 2.1 + 0.4)
        + 0.095 * cos(phase + 0.3) * along
        + 0.11 * sin(along * 2.5 - phase) + 0.07 * along * along;
      float turn = 0.5 + 0.5 * sin(phase - 0.4);
      float frontWidth = 0.20 + 0.15 * turn
        + 0.055 * sin(along * 2.4 + phase + 0.3);
      float backWidth = 0.085 + 0.15 * (1.0 - turn)
        + 0.025 * cos(along * 3.0 - phase);
      float d = across - crease;
      float front = band(d, -frontWidth, -0.0007, aa);
      float back = band(-d, -backWidth, -0.0007, aa);
      float f = clamp(-d / frontWidth, 0.0, 1.0);
      float b = clamp(d / backWidth, 0.0, 1.0);

      // Grazing light rolls over both faces of the fold.
      float lightAlong = 0.57 + 0.43 * sin(along * 2.4 - phase + 0.8);
      float ridge = exp(-pow((f - (0.16 + 0.19 * turn)) / 0.28, 2.0));
      float frontShade = (0.055 + 0.34 * ridge * lightAlong)
        * pow(1.0 - f, 0.55);
      frontShade += 0.07 * exp(-f * 18.0) * (0.3 + 0.7 * turn);
      float backShade = (0.085 + 0.22 * (1.0 - turn))
        * exp(-b * (1.4 + 1.2 * turn))
        * (0.65 + 0.35 * cos(along * 2.0 + phase));
      float shade = front * frontShade + back * backShade;
      // Soft reflected light spreads beyond the opposite face, as in the reference.
      float backGlow = exp(-pow((d - backWidth * 0.42) / (backWidth + 0.14), 2.0))
        * smoothstep(-aa, 0.06, d);
      shade += 0.13 * backGlow * (0.65 + 0.35 * sin(along * 2.4 - phase + 0.8));

      // Keep the existing title and its surrounding whitespace comfortably dark.
      vec2 titleDistance = (uv - vec2(0.36, 0.50)) / vec2(0.29, 0.27);
      float titleProtect = smoothstep(0.35, 1.35, length(titleDistance));
      shade *= mix(0.08, 1.0, titleProtect);
      vec2 orbDistance = (uv - vec2(0.697, 0.50)) / vec2(0.13, 0.23);
      float orbProtect = smoothstep(0.35, 1.45, length(orbDistance));
      shade *= mix(0.12, 1.0, orbProtect);
      shade *= 0.76 + 0.24 * smoothstep(0.15, 0.9, uv.x);
      // Fine monochrome dither avoids visible banding on the broad dark gradients.
      float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      shade = max(0.0, shade + (grain - 0.5) / 510.0);
      gl_FragColor = vec4(vec3(shade), 1.0);
    }
  `
};
