import { COLOR_PROFILES } from './profiles.js';
import { invert3x3, gammaExpand, gammaCompress } from './matrix.js';

export function rgb2lab(r, g, b, profileKey) {
  const P = COLOR_PROFILES[profileKey];
  const rl = gammaExpand(r / 255, P.gammaType, P.gamma);
  const gl = gammaExpand(g / 255, P.gammaType, P.gamma);
  const bl = gammaExpand(b / 255, P.gammaType, P.gamma);
  const M = P.rgb2xyz;
  const X = M[0][0] * rl + M[0][1] * gl + M[0][2] * bl;
  const Y = M[1][0] * rl + M[1][1] * gl + M[1][2] * bl;
  const Z = M[2][0] * rl + M[2][1] * gl + M[2][2] * bl;
  const W = P.whiteXYZ;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X / W[0]), fy = f(Y / W[1]), fz = f(Z / W[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function lab2rgb(L, a, b, profileKey) {
  const P = COLOR_PROFILES[profileKey];
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const g = (t) => {
    const t3 = t * t * t;
    return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
  };
  const W = P.whiteXYZ;
  const X = g(fx) * W[0], Y = g(fy) * W[1], Z = g(fz) * W[2];
  const M = invert3x3(P.rgb2xyz);
  const rl = M[0][0] * X + M[0][1] * Y + M[0][2] * Z;
  const gl = M[1][0] * X + M[1][1] * Y + M[1][2] * Z;
  const bl = M[2][0] * X + M[2][1] * Y + M[2][2] * Z;
  return [
    gammaCompress(Math.max(0, rl), P.gammaType, P.gamma) * 255,
    gammaCompress(Math.max(0, gl), P.gammaType, P.gamma) * 255,
    gammaCompress(Math.max(0, bl), P.gammaType, P.gamma) * 255
  ];
}

export function rgb2ycbcr(r, g, b, profileKey) {
  const [Kr, Kg, Kb] = COLOR_PROFILES[profileKey].ycbcr;
  const Y = Kr * r + Kg * g + Kb * b;
  const Cb = (b - Y) / (2 * (1 - Kb)) + 128;
  const Cr = (r - Y) / (2 * (1 - Kr)) + 128;
  return [Y, Cb, Cr];
}

export function ycbcr2rgb(Y, Cb, Cr, profileKey) {
  const [Kr, Kg, Kb] = COLOR_PROFILES[profileKey].ycbcr;
  Cb -= 128; Cr -= 128;
  const R = Y + 2 * (1 - Kr) * Cr;
  const B = Y + 2 * (1 - Kb) * Cb;
  const G = (Y - Kr * R - Kb * B) / Kg;
  return [R, G, B];
}

export function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (mx === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s * 100, l * 100];
}

export function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, (mx === 0 ? 0 : d / mx) * 100, mx * 100];
}

export function hsv2rgb(h, s, v) {
  h = ((h % 360) + 360) % 360; s /= 100; v /= 100;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function rgb2cmyk(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 0.999) return [0, 0, 0, 100];
  return [(1 - r - k) / (1 - k) * 100, (1 - g - k) / (1 - k) * 100, (1 - b - k) / (1 - k) * 100, k * 100];
}

export function cmyk2rgb(c, m, y, k) {
  c /= 100; m /= 100; y /= 100; k /= 100;
  return [255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k)];
}