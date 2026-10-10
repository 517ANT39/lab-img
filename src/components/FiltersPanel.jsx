import { useState } from 'react';
import cv from '@/cv/cvInstance.js';
import { filter2DMat } from '../cv/utils.js';

const DEFAULTS = { sharp: 100, mbLen: 15, mbAng: 0, med: 5 };

export default function FiltersPanel({ applyOp }) {
  const [sharp, setSharp] = useState(DEFAULTS.sharp);
  const [mbLen, setMbLen] = useState(DEFAULTS.mbLen);
  const [mbAng, setMbAng] = useState(DEFAULTS.mbAng);
  const [med, setMed] = useState(DEFAULTS.med);

  const doSharp = () => {
    const a = sharp / 100;
    const k = [[0, -a, 0], [-a, 1 + 4 * a, -a], [0, -a, 0]];
    applyOp((src) => filter2DMat(src, k, 0), 'Повышение резкости');
  };

  const doMotion = () => {
    const half = Math.floor(mbLen / 2);
    const size = half * 2 + 1;
    const k = Array.from({ length: size }, () => new Array(size).fill(0));
    const rad = (mbAng * Math.PI) / 180;
    const dx = Math.cos(rad), dy = Math.sin(rad);
    let count = 0;
    for (let i = -half; i <= half; i++) {
      const x = Math.round(half + i * dx);
      const y = Math.round(half + i * dy);
      if (x >= 0 && x < size && y >= 0 && y < size && k[y][x] === 0) { k[y][x] = 1; count++; }
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) k[y][x] /= (count || 1);
    applyOp((src) => filter2DMat(src, k, 0), 'Размытие в движении');
  };

  const doEmboss = () => {
    const k = [[-2, -1, 0], [-1, 1, 1], [0, 1, 2]];
    applyOp((src) => filter2DMat(src, k, 128), 'Тиснение');
  };

  const doMedian = () => {
    applyOp((src) => {
      const ch = new cv.MatVector();
      cv.split(src, ch);
      const outCh = new cv.MatVector();
      for (let i = 0; i < 3; i++) {
        const m = ch.get(i);
        const r = new cv.Mat();
        cv.medianBlur(m, r, med);
        outCh.push_back(r);
        r.delete();
      }
      const out = new cv.Mat();
      cv.merge(outCh, out);
      ch.delete(); outCh.delete();
      return out;
    }, 'Медианная фильтрация');
  };

  const handleReset = () => {
    setSharp(DEFAULTS.sharp);
    setMbLen(DEFAULTS.mbLen);
    setMbAng(DEFAULTS.mbAng);
    setMed(DEFAULTS.med);
  };

  return (
    <details>
      <summary>9. Фильтры и эффекты</summary>
      <div className="body">
        <label>Резкость: {(sharp / 100).toFixed(1)}</label>
        <input type="range" min="10" max="300" value={sharp} onChange={(e) => setSharp(+e.target.value)} />
        <button style={{ marginTop: 6 }} onClick={doSharp}>Повысить резкость</button>

        <label style={{ marginTop: 12 }}>Размытие в движении — длина: {mbLen}</label>
        <input type="range" min="3" max="51" step="2" value={mbLen} onChange={(e) => setMbLen(+e.target.value)} />
        <label>Угол: {mbAng}°</label>
        <input type="range" min="0" max="180" value={mbAng} onChange={(e) => setMbAng(+e.target.value)} />
        <button style={{ marginTop: 6 }} onClick={doMotion}>Размытие в движении</button>

        <button style={{ marginTop: 12 }} onClick={doEmboss}>Тиснение (Emboss)</button>

        <label style={{ marginTop: 12 }}>Медианный фильтр — ядро: {med}</label>
        <input type="range" min="3" max="31" step="2" value={med} onChange={(e) => setMed(+e.target.value)} />
        <button style={{ marginTop: 6 }} onClick={doMedian}>Медианная фильтрация</button>

        <div className="btn-row">
          <button className="sec" onClick={handleReset}>↺ Сбросить параметры</button>
        </div>
      </div>
    </details>
  );
}