import cv from './cvInstance.js';

// Красивое округление максимума вверх
function niceMax(v) {
  if (v <= 10) return 10;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const norm = v / base;
  let nice;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 2.5) nice = 2.5;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

// Короткая запись больших чисел: 1 234 → "1.2K"
function fmtCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
}

export function drawHistogram(canvas, mat, channels) {
  if (!canvas) return;

  // Получаем реальные размеры контейнера (высота задается в CSS)
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return; // Если скрыт

  const dpr = window.devicePixelRatio || 1;
  const W = rect.width;
  const H = rect.height;

  // Устанавливаем физические размеры canvas для идеальной четкости (Retina)
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width = W * dpr;
    canvas.height = H * dpr;
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // Масштабируем контекст под CSS-пиксели

  ctx.fillStyle = '#0f1116';
  ctx.fillRect(0, 0, W, H);

  // Отступы для осей
  const PAD_L = 45; 
  const PAD_R = 15;
  const PAD_T = 15;
  const PAD_B = 25; 

  const plotX = PAD_L;
  const plotY = PAD_T;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  if (!mat) {
    ctx.fillStyle = '#3b4354';
    ctx.font = '12px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText('нет данных', W / 2, H / 2);
    ctx.textAlign = 'left';
    return;
  }

  // ---- Считаем гистограммы по каналам ----
  let hists;
  try {
    const small = new cv.Mat();
    const maxSide = 480;
    const scale = Math.max(mat.cols, mat.rows) > maxSide
      ? maxSide / Math.max(mat.cols, mat.rows) : 1;
    if (scale < 1) {
      cv.resize(mat, small,
        new cv.Size(Math.round(mat.cols * scale), Math.round(mat.rows * scale)),
        0, 0, cv.INTER_AREA);
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
  } catch (e) {
    console.warn('histogram:', e);
    return;
  }

  // Пересчет в реальные пиксели (если изображение было уменьшено)
  const scaleFactor = (() => {
    const scale = Math.max(mat.cols, mat.rows) > 480
      ? 480 / Math.max(mat.cols, mat.rows) : 1;
    return scale < 1 ? 1 / (scale * scale) : 1;
  })();

  const realHists = hists.map(h => h.map(v => Math.round(v * scaleFactor)));

  // Максимум по видимым каналам
  const show = [channels.r, channels.g, channels.b];
  let maxVal = 0;
  for (let c = 0; c < 3; c++) {
    if (!show[c]) continue;
    for (let i = 0; i < 256; i++) {
      if (realHists[c][i] > maxVal) maxVal = realHists[c][i];
    }
  }
  if (maxVal === 0) maxVal = 1;
  const niceYMax = niceMax(maxVal);

  // ---- Ось Y: подписи и сетка ----
  const Y_TICKS = 4;
  ctx.font = '10px Segoe UI';
  ctx.textBaseline = 'middle';

  for (let t = 0; t <= Y_TICKS; t++) {
    const frac = t / Y_TICKS;
    const y = plotY + plotH - frac * plotH;
    const value = frac * niceYMax;

    ctx.strokeStyle = t === 0 ? '#3a4252' : '#232937';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotX, Math.round(y) + 0.5);
    ctx.lineTo(plotX + plotW, Math.round(y) + 0.5);
    ctx.stroke();

    ctx.fillStyle = '#7a869a';
    ctx.textAlign = 'right';
    ctx.fillText(fmtCount(value), plotX - 6, y);
  }

  // ---- Ось X ----
  ctx.font = '10px Segoe UI';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  const X_TICKS = [0, 64, 128, 192, 255];
  for (const xv of X_TICKS) {
    const x = plotX + (plotW * xv / 255);
    ctx.strokeStyle = '#1c2230';
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, plotY);
    ctx.lineTo(Math.round(x) + 0.5, plotY + plotH);
    ctx.stroke();

    ctx.fillStyle = '#7a869a';
    ctx.fillText(String(xv), x, plotY + plotH + 6);
  }

  // ---- Графики (заливка) ----
  const colors = ['#ff5c5c', '#4ade80', '#5c9bff'];

  ctx.globalCompositeOperation = 'lighter';
  for (let c = 0; c < 3; c++) {
    if (!show[c]) continue;
    const h = realHists[c];
    ctx.beginPath();
    ctx.moveTo(plotX, plotY + plotH);
    for (let i = 0; i < 256; i++) {
      const x = plotX + (plotW * i / 255);
      const y = plotY + plotH - (h[i] / niceYMax) * plotH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(plotX + plotW, plotY + plotH);
    ctx.closePath();
    ctx.fillStyle = colors[c] + '55';
    ctx.fill();
    ctx.strokeStyle = colors[c];
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  // ---- Легенда каналов ----
  ctx.font = '11px Segoe UI';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let lx = plotX + 6;
  ['R', 'G', 'B'].forEach((n, i) => {
    if (!show[i]) return;
    ctx.fillStyle = colors[i];
    ctx.fillRect(lx, plotY + 4, 8, 8);
    ctx.fillStyle = '#aab3c4';
    ctx.fillText(n, lx + 12, plotY + 9);
    lx += 30;
  });

  // ---- Максимум ----
  ctx.font = '10px Segoe UI';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7a869a';
  ctx.fillText(`макс: ${fmtCount(maxVal)} px`, W - PAD_R - 6, plotY + 9);
  ctx.textAlign = 'left';
}