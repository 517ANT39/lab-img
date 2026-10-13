import { useState, useEffect, useRef } from 'react';
import cv from '../cv/cvInstance.js';
import jsfeat from '@webarkit/jsfeat-next';
import { toGray, showMat } from '../cv/utils.js';

const DEFAULTS = { type: 'harris', th: 25 };

export default function KeypointsPanel({ mats, canvasRef, showToast }) {
  const [type, setType] = useState(DEFAULTS.type);
  const [th, setTh] = useState(DEFAULTS.th);
  const [points, setPoints] = useState([]);

  // Перерисовка canvas при изменении points
  useEffect(() => {
    const m = mats.current;
    const c = canvasRef && canvasRef.current;
    if (!m || !m.cur || !c) return;

    // 1. Показать изображение
    showMat(m.cur, c);

    // 2. Нарисовать точки поверх
    if (points.length === 0) return;
    const ctx = c.getContext('2d');
    for (const p of points) {
      // Внешний кружок
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,40,40,1)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Внутренняя точка
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,0,1)';
      ctx.fill();
    }
  }, [points]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = () => {
    const m = mats.current;
    if (!m || !m.cur) { showToast('Сначала загрузите изображение'); return; }

    const g = toGray(m.cur);
    const detected = [];
    try {
      if (type === 'harris') {
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
        const orb = new cv.ORB(500);
        const kp = new cv.KeyPointVector();
        const mask = new cv.Mat();
        orb.detect(g, kp, mask);
        for (let i = 0; i < kp.size(); i++) {
          const p = kp.get(i);
          detected.push({ x: Math.round(p.pt.x), y: Math.round(p.pt.y) });
        }
        kp.delete(); mask.delete(); orb.delete();
      }
    } catch (e) {
      console.error(e);
      g.delete();
      showToast('Ошибка: ' + e.message);
      return;
    }
    g.delete();

    if (detected.length === 0) {
      showToast('Не найдены — уменьшите порог');
      return;
    }

    // Только setState — точка появится через useEffect
    setPoints(detected);
    showToast(`Найдено точек: ${detected.length}`);
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
      <summary>11. Ключевые точки</summary>
      <div className="body">
        <label>Детектор</label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="harris">Харрис (Harris) — OpenCV</option>
          <option value="fast">FAST — jsfeat</option>
          <option value="orb">ORB — OpenCV</option>
        </select>
        <label>Порог: {th}</label>
        <input type="range" min="1" max="120" value={th}
          onChange={(e) => setTh(+e.target.value)} />
        <button style={{ marginTop: 8 }} onClick={run}>Найти ключевые точки</button>

        <div className="btn-row">
          <button className={hasBase ? 'green' : 'sec'} onClick={handleReset}>
            {hasBase ? '↺ Отменить операцию' : '↺ Сбросить параметры'}
          </button>
        </div>
      </div>
    </details>
  );
}