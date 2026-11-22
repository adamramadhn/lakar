precision mediump float;

/** @resolution */
uniform vec2 u_resolution;

/** @time */
uniform float u_time;

/** @label Content */
uniform sampler2D u_content;

/**
 * @label Period (s)
 * @default 1.6
 * @range 0.4, 4
 */
uniform float u_period;

/**
 * @label Min opacity
 * @default 0.4
 * @range 0, 1
 */
uniform float u_min;

/**
 * @label Scale amount
 * @default 0
 * @range 0, 0.6
 */
uniform float u_scale;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float w = 0.5 + 0.5 * cos(6.2831853 * u_time / u_period);
  // optional breathing scale around the center (used for the layer-row halo)
  float s = 1.0 - u_scale * (1.0 - w);
  vec2 suv = (uv - 0.5) / s + 0.5;
  vec4 c = texture2D(u_content, suv);
  if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) c = vec4(0.0);
  gl_FragColor = c * mix(u_min, 1.0, w);
}
