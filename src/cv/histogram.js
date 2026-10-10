import cv from './cvInstance.js';

export function drawHistogram(canvas, mat, channels) {
  if (!canvas) return;
  const W = 620, H = 210;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f1116';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#232937';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = 12 + ((H - 40) * i) / 4;
    ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(W - 12, y); ctx.stroke();
  }
  ctx.fillStyle = '#4a5468';
  ctx.font = '10px Segoe UI';
  ctx.fillText('0', 12, H - 8);
  ctx.fillText('128', W / 2 - 10, H - 8);
  ctx.fillText('255', W - 26, H - 8);

  if (!mat) {
    ctx.fillStyle = '#3b4354';
    ctx.font = '13px Segoe UI';
    ctx.fillText('нет данных', W / 2 - 36, H / 2);
    return;
  }

  let hists;
  try {
    const small = new cv.Mat();
    const maxSide = 480;
    const scale = Math.max(mat.cols, mat.rows) > maxSide
      ? maxSide / Math.max(mat.cols, mat.rows) : 1;
    if (scale < 1) {
      cv.resize(mat, small, new cv.Size(Math.round(mat.cols * scale), Math.round(mat.rows * scale)), 0, 0, cv.INTER_AREA);
    } else mat.copyTo(small);

    const ch = new cv.MatVector();
    cv.split(small, ch);
    hists = [];
    for (let i = 0; i < 3; i++) {
      const m = ch.get(i);
      const vec = new cv.MatVector();
      vec.push_back(m);
      const hist = new cv.Mat();
      const mask = new cv.Mat();
      cv.calcHist(vec, [0], mask, hist, [256], [0, 256], false);
      hists.push(Array.from(hist.data32F));
      vec.delete(); hist.delete(); mask.delete();
    }
    ch.delete(); small.delete();
  } catch (e) { console.warn(e); return; }

  let maxV = 1;
  for (const h of hists) for (let i = 0; i < 256; i++) if (h[i] > maxV) maxV = h[i];

  const show = [channels.r, channels.g, channels.b];
  const colors = ['#ff5c5c', '#4ade80', '#5c9bff'];
  const plotH = H - 40;

  ctx.globalCompositeOperation = 'lighter';
  for (let c = 0; c < 3; c++) {
    if (!show[c]) continue;
    const h = hists[c];
    ctx.beginPath();
    ctx.moveTo(12, H - 25);
    for (let i = 0; i < 256; i++) {
      const x = 12 + ((W - 24) * i) / 255;
      const y = H - 25 - (h[i] / maxV) * plotH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W - 12, H - 25);
    ctx.closePath();
    ctx.fillStyle = colors[c] + '55';
    ctx.fill();
    ctx.strokeStyle = colors[c];
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.font = '11px Segoe UI';
  let lx = 14;
  ['R', 'G', 'B'].forEach((n, i) => {
    if (!show[i]) return;
    ctx.fillStyle = colors[i];
    ctx.fillRect(lx, 8, 10, 10);
    ctx.fillStyle = '#aab3c4';
    ctx.fillText(n, lx + 14, 17);
    lx += 34;
  });
}