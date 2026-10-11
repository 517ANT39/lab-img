import { useState } from 'react';
import cv from '../cv/cvInstance.js';
import jsfeat from '@webarkit/jsfeat-next';
import { toGray } from '../cv/utils.js';

const DEFAULTS = { type: 'harris', th: 25 };

export default function KeypointsPanel({ mats, applyOp, resetPanel, hasBase, showToast }) {
  const [type, setType] = useState(DEFAULTS.type);
  const [th, setTh] = useState(DEFAULTS.th);

  const run = () => {
    const m = mats.current;
    if (!m || !m.cur) { showToast('Сначала загрузите изображение'); return; }

    // ---- Детекция точек ----
    const g = toGray(m.cur);
    const points = [];
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
            if (v === dil.floatAt(y, x) && v > thr) points.push({ x, y });
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
        for (let i = 0; i < count; i++) points.push({ x: corners[i].x, y: corners[i].y });
      } else if (type === 'orb') {
        const orb = new cv.ORB(500);
        const kp = new cv.KeyPointVector();
        const mask = new cv.Mat();
        orb.detect(g, kp, mask);
        for (let i = 0; i < kp.size(); i++) {
          const p = kp.get(i);
          points.push({ x: Math.round(p.pt.x), y: Math.round(p.pt.y) });
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

    if (points.length === 0) {
      showToast('Не найдены — уменьшите порог');
      return;
    }

    // ---- Через applyOp, с panelKey='keypoints' — как все панели ----
    applyOp((src) => {
      const out = src.clone();
      for (const p of points) {
        cv.circle(out, new cv.Point(p.x, p.y), 4, new cv.Scalar(255, 40, 40), 2, cv.LINE_AA);
        cv.circle(out, new cv.Point(p.x, p.y), 1, new cv.Scalar(255, 255, 0), 1, cv.LINE_AA);
      }
      return out;
    }, `Найдено точек: ${points.length}`, 'keypoints');
  };

  const handleReset = () => {
    setType(DEFAULTS.type);
    setTh(DEFAULTS.th);
    resetPanel('keypoints', 'Ключевые точки');
  };

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
        <input type="range" min="1" max="120" value={th} onChange={(e) => setTh(+e.target.value)} />
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