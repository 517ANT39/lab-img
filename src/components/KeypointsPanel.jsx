import { useState, useEffect } from 'react';
import cv from '../cv/cvInstance.js';
import jsfeat from '@webarkit/jsfeat-next';
import { toGray, showMat } from '../cv/utils.js';

const DEFAULTS = { type: 'harris', th: 25 };

/**
 * Самописная реализация детектора SIFT.
 * Возвращает массив { x, y, size, angle }:
 *   size  — радиус круга (пропорционален σ точки)
 *   angle — доминирующая ориентация градиента (радианы)
 */
function detectSIFT(grayU8, threshold) {
  const rawPoints = [];

  const NUM_OCTAVES = 3;
  const SCALES_PER_OCTAVE = 3;
  const SIGMA = 1.6;
  const K = Math.pow(2, 1 / SCALES_PER_OCTAVE);
  const BORDER = 8;
  const CONTRAST_THRESHOLD = Math.max(0.5, threshold * 0.15);

  const baseFloat = new cv.Mat();
  grayU8.convertTo(baseFloat, cv.CV_32F);

  let currentBase = baseFloat.clone();

  try {
    for (let o = 0; o < NUM_OCTAVES; o++) {
      if (o > 0) {
        const ds = new cv.Mat();
        cv.resize(currentBase, ds,
          new cv.Size(
            Math.max(4, Math.floor(currentBase.cols / 2)),
            Math.max(4, Math.floor(currentBase.rows / 2))
          ),
          0, 0, cv.INTER_LINEAR);
        currentBase.delete();
        currentBase = ds;
      }

      const NUM_SCALES = SCALES_PER_OCTAVE + 3;
      const gaussians = [];
      const dogs = [];

      for (let s = 0; s < NUM_SCALES; s++) {
        const curSigma = SIGMA * Math.pow(K, s - 1);
        const ksize = Math.max(3, (Math.ceil(curSigma * 6) | 1));
        const blurred = new cv.Mat();
        cv.GaussianBlur(currentBase, blurred,
          new cv.Size(ksize, ksize), curSigma, 0, cv.BORDER_REPLICATE);
        gaussians.push(blurred);
      }

      for (let s = 0; s < NUM_SCALES - 1; s++) {
        const dog = new cv.Mat();
        cv.subtract(gaussians[s + 1], gaussians[s], dog);
        dogs.push(dog);
      }

      const octaveScale = Math.pow(2, o);

      for (let s = 1; s < dogs.length - 1; s++) {
        const dog = dogs[s];
        const prev = dogs[s - 1];
        const next = dogs[s + 1];
        const rows = dog.rows;
        const cols = dog.cols;

        // Реальная сигма этого уровня — нужна для радиуса круга
        const sigmaAtLevel = SIGMA * Math.pow(K, s) * octaveScale;

        for (let y = BORDER; y < rows - BORDER; y++) {
          for (let x = BORDER; x < cols - BORDER; x++) {
            const v = dog.floatAt(y, x);
            const absV = Math.abs(v);
            if (absV < CONTRAST_THRESHOLD) continue;

            let isMax = true;
            let isMin = true;
            for (let dy = -1; dy <= 1 && (isMax || isMin); dy++) {
              for (let dx = -1; dx <= 1 && (isMax || isMin); dx++) {
                if (dx === 0 && dy === 0) continue;
                const vp = prev.floatAt(y + dy, x + dx);
                const vn = next.floatAt(y + dy, x + dx);
                if (vp >= v || vn >= v) isMax = false;
                if (vp <= v || vn <= v) isMin = false;
              }
            }

            if (isMax || isMin) {
              // Ориентация — по оператору Собеля 3×3 в точке
              const gx =
                dog.floatAt(y - 1, x + 1) + 2 * dog.floatAt(y, x + 1) + dog.floatAt(y + 1, x + 1) -
                dog.floatAt(y - 1, x - 1) - 2 * dog.floatAt(y, x - 1) - dog.floatAt(y + 1, x - 1);
              const gy =
                dog.floatAt(y + 1, x - 1) + 2 * dog.floatAt(y + 1, x) + dog.floatAt(y + 1, x + 1) -
                dog.floatAt(y - 1, x - 1) - 2 * dog.floatAt(y - 1, x) - dog.floatAt(y - 1, x + 1);
              const angle = Math.atan2(gy, gx);

              const px = Math.round(x * octaveScale);
              const py = Math.round(y * octaveScale);

              if (px >= 0 && py >= 0 && px < grayU8.cols && py < grayU8.rows) {
                rawPoints.push({
                  x: px,
                  y: py,
                  size: Math.max(4, sigmaAtLevel * 3),
                  angle,
                  v: absV
                });
              }
            }
          }
        }
      }

      gaussians.forEach(m => m.delete());
      dogs.forEach(m => m.delete());

      if (currentBase.cols < 30 || currentBase.rows < 30) break;
    }
  } finally {
    currentBase.delete();
  }

  rawPoints.sort((a, b) => b.v - a.v);

  // Дедупликация с учётом размера круга — не накладываем круги друг на друга
  const filtered = [];
  for (const p of rawPoints) {
    let keep = true;
    const minDist = Math.max(4, p.size * 0.5);
    const minDist2 = minDist * minDist;
    for (const q of filtered) {
      const dx = p.x - q.x, dy = p.y - q.y;
      if (dx * dx + dy * dy < minDist2) { keep = false; break; }
    }
    if (keep) filtered.push(p);
    if (filtered.length >= 300) break;
  }

  return filtered.map(p => ({ x: p.x, y: p.y, size: p.size, angle: p.angle }));
}

export default function KeypointsPanel({ mats, canvasRef, showToast }) {
  const [type, setType] = useState(DEFAULTS.type);
  const [th, setTh] = useState(DEFAULTS.th);
  const [points, setPoints] = useState([]);

  // Перерисовка canvas при изменении points
  useEffect(() => {
    const m = mats.current;
    const c = canvasRef && canvasRef.current;
    if (!m || !m.cur || !c) return;

    showMat(m.cur, c);

    if (points.length === 0) return;
    const ctx = c.getContext('2d');

    for (const p of points) {
      // Если у точки есть size и angle — рисуем SIFT-стиль: круг + вектор
      const isSift = typeof p.size === 'number' && typeof p.angle === 'number';
      const size = isSift ? p.size : 6;

      // Внешний круг — масштаб точки
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (isSift) {
        // Внутренний круг — ядро
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.5, size * 0.3), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.9)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Вектор ориентации с наконечником
        const len = size;
        const ex = p.x + Math.cos(p.angle) * len;
        const ey = p.y + Math.sin(p.angle) * len;

        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = 'rgba(0, 255, 100, 1)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Наконечник стрелки
        const headLen = Math.max(3, size * 0.25);
        const headAngle = Math.PI / 6;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(
          ex - headLen * Math.cos(p.angle - headAngle),
          ey - headLen * Math.sin(p.angle - headAngle)
        );
        ctx.moveTo(ex, ey);
        ctx.lineTo(
          ex - headLen * Math.cos(p.angle + headAngle),
          ey - headLen * Math.sin(p.angle + headAngle)
        );
        ctx.stroke();
      } else {
        // Harris / FAST — маленькая точка в центре, как было раньше
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 0, 1)';
        ctx.fill();
      }
    }
  }, [points]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = () => {
    const m = mats.current;
    if (!m || !m.cur) { showToast('Сначала загрузите изображение'); return; }

    const g = toGray(m.cur);
    const detected = [];

    try {
      if (type === 'harris') {
        // ========== HARRIS ==========
        const dst = new cv.Mat();
        cv.cornerHarris(g, dst, 2, 3, 0.04);
        const dil = new cv.Mat();
        const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
        cv.dilate(dst, dil, k);
        const mm = cv.minMaxLoc(dst, new cv.Mat());
        const thr = mm.maxVal * (th / 100) * 0.2;
        for (let y = 0; y < dst.rows; y++) {
          for (let x = 0; x < dst.cols; x++) {
            const v = dst.floatAt(y, x);
            if (v === dil.floatAt(y, x) && v > thr) detected.push({ x, y });
          }
        }
        dst.delete(); dil.delete(); k.delete();

      } else if (type === 'fast') {
        // ========== FAST (jsfeat) ==========
        if (typeof jsfeat === 'undefined') throw new Error('jsfeat не загружен');
        const width = g.cols, height = g.rows;
        const imgU8 = new jsfeat.matrix_t(width, height, jsfeat.U8C1_t);
        for (let i = 0; i < g.data.length; i++) imgU8.data[i] = g.data[i];
        jsfeat.fast_corners.set_threshold(th);
        const corners = [];
        for (let i = 0; i < 500; i++) corners[i] = new jsfeat.keypoint_t(0, 0, 0, 0, 0);
        const count = jsfeat.fast_corners.detect(imgU8, corners, 3);
        for (let i = 0; i < count; i++) detected.push({ x: corners[i].x, y: corners[i].y });

      } else if (type === 'orb') {
        // ========== ORB ==========
        const orb = new cv.ORB(500);
        const kp = new cv.KeyPointVector();
        const mask = new cv.Mat();
        orb.detect(g, kp, mask);
        for (let i = 0; i < kp.size(); i++) {
          const p = kp.get(i);
          detected.push({ x: Math.round(p.pt.x), y: Math.round(p.pt.y) });
        }
        kp.delete(); mask.delete(); orb.delete();

      } else if (type === 'sift') {
        // ========== SIFT (самописный) ==========
        const result = detectSIFT(g, th);
        for (const p of result) detected.push(p);
      }

    } catch (e) {
      console.error('Keypoints error:', e);
      g.delete();
      showToast('Ошибка: ' + e.message);
      return;
    }
    g.delete();

    if (detected.length === 0) {
      showToast('Не найдены — уменьшите порог');
      return;
    }

    setPoints(detected);
    // showToast(`Найдено точек: ${detected.length}`);
  };

  const handleReset = () => {
    setPoints([]);
    setType(DEFAULTS.type);
    setTh(DEFAULTS.th);
    showToast('Ключевые точки отменены');
  };

  const hasBase = points.length > 0;

  return (
    <details>
      <summary>Ключевые точки</summary>
      <div className="body">
        <label>Детектор</label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="harris">Харрис (Harris)</option>
          <option value="orb">FAST</option>
          <option value="sift">SIFT</option>
        </select>

        <label>Порог: {th}</label>
        <input
          type="range" min="1" max="120" value={th}
          onChange={(e) => setTh(+e.target.value)}
        />

        <button style={{ marginTop: 8 }} onClick={run}>
          Найти ключевые точки
        </button>

        <div className="btn-row">
          <button className={hasBase ? 'red' : 'sec'} onClick={handleReset}>
            {hasBase ? '↺ Отменить операцию' : '↺ Сбросить параметры'}
          </button>
        </div>
      </div>
    </details>
  );
}