precision mediump float;

/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/**
 * @label Base
 * @color
 * @default #E9E9E9
 */
uniform vec3 u_base;

/**
 * @label Highlight
 * @color
 * @default #FFFFFF
 */
uniform vec3 u_highlight;

/**
 * @label Period (s)
 * @default 1.2
 * @range 0.4, 4
 */
uniform float u_period;

/**
 * @label Band width
 * @default 0.35
 * @range 0.05, 1
 */
uniform float u_band;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  // slanted coordinate so the band leans like the HTML prototype
  float x = uv.x + (uv.y - 0.5) * 0.35;
  float phase = fract(u_time / u_period);
  float center = mix(-0.6, 1.6, phase);
  float d = abs(x - center) / u_band;
  float glow = (1.0 - smoothstep(0.0, 1.0, d)) * 0.9;
  gl_FragColor = vec4(mix(u_base, u_highlight, glow), 1.0);
}
