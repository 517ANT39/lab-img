import cv from './cvInstance.js';

export function showMat(mat, canvas) {
  if (!mat || !canvas) return;
  let rgba = new cv.Mat();
  if (mat.channels() === 3) cv.cvtColor(mat, rgba, cv.COLOR_RGB2RGBA);
  else if (mat.channels() === 1) cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA);
  else mat.copyTo(rgba);
  cv.imshow(canvas, rgba);
  rgba.delete();
}

export function toGray(mat) {
  const g = new cv.Mat();
  if (mat.channels() === 3) cv.cvtColor(mat, g, cv.COLOR_RGB2GRAY);
  else mat.copyTo(g);
  return g;
}

export function grayToRGB(g) {
  const out = new cv.Mat();
  cv.cvtColor(g, out, cv.COLOR_GRAY2RGB);
  return out;
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export function filter2DMat(src, kArr, delta = 0) {
  const rows = kArr.length, cols = kArr[0].length;
  const flat = [];
  for (const r of kArr) for (const v of r) flat.push(v);
  const kernel = cv.matFromArray(rows, cols, cv.CV_32F, flat);
  const dst32 = new cv.Mat();
  cv.filter2D(src, dst32, cv.CV_32F, kernel);
  if (delta) {
    const d = new cv.Mat(dst32.rows, dst32.cols, dst32.type(), new cv.Scalar(delta, delta, delta, 0));
    cv.add(dst32, d, dst32);
    d.delete();
  }
  const out = new cv.Mat();
  dst32.convertTo(out, cv.CV_8U);
  kernel.delete(); dst32.delete();
  return out;
}

export function matsAreEqual(a, b) {
  if (!a || !b) return false;
  if (a.rows !== b.rows || a.cols !== b.cols) return false;
  if (a.type() !== b.type()) return false;
  const da = a.data, db = b.data;
  if (!da || !db || da.length !== db.length) return false;
  for (let i = 0; i < da.length; i++) {
    if (da[i] !== db[i]) return false;
  }
  return true;
}