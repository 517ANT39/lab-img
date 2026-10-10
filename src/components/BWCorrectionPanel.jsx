import { useState } from 'react';
import cv from '@/cv/cvInstance.js';
import { toGray, grayToRGB, clamp } from '../cv/utils.js';

function applyLUT(gray, fn) {
  const lut = new cv.Mat(1, 256, cv.CV_8UC1);
  for (let i = 0; i < 256; i++) lut.data[i] = clamp(Math.round(fn(i)), 0, 255);
  const out = new cv.Mat();
  cv.LUT(gray, lut, out);
  lut.delete();
  return out;
}

const DEFAULTS = { black: 0, white: 255, gamma: 100 };

export default function BWCorrectionPanel({ applyOp }) {
  const [black, setBlack] = useState(DEFAULTS.black);
  const [white, setWhite] = useState(DEFAULTS.white);
  const [gamma, setGamma] = useState(DEFAULTS.gamma);

  const doLinear = () => {
    if (white <= black) { alert('Белая точка должна быть больше чёрной'); return; }
    applyOp((src) => {
      const g = toGray(src);
      const res = applyLUT(g, (i) => (i - black) * 255 / (white - black));
      const rgb = grayToRGB(res);
      g.delete(); res.delete();
      return rgb;
    }, 'Линейная коррекция');
  };

  const doGamma = () => {
    const gVal = gamma / 100;
    applyOp((src) => {
      const g = toGray(src);
      const res = applyLUT(g, (i) => 255 * Math.pow(i / 255, gVal));
      const rgb = grayToRGB(res);
      g.delete(); res.delete();
      return rgb;
    }, `Гамма γ=${gVal.toFixed(2)}`);
  };

  const doLog = () => {
    applyOp((src) => {
      const g = toGray(src);
      const res = applyLUT(g, (i) => (255 * Math.log(1 + i)) / Math.log(256));
      const rgb = grayToRGB(res);
      g.delete(); res.delete();
      return rgb;
    }, 'Логарифмическая коррекция');
  };

  const doExp = () => {
    const k = 3;
    applyOp((src) => {
      const g = toGray(src);
      const res = applyLUT(g, (i) => (255 * (Math.exp((k * i) / 255) - 1)) / (Math.exp(k) - 1));
      const rgb = grayToRGB(res);
      g.delete(); res.delete();
      return rgb;
    }, 'Экспоненциальная коррекция');
  };

  const handleReset = () => {
    setBlack(DEFAULTS.black);
    setWhite(DEFAULTS.white);
    setGamma(DEFAULTS.gamma);
  };

  return (
    <details>
      <summary>7. Коррекция Ч/Б изображения</summary>
      <div className="body">
        <div style={{ fontWeight: 600, fontSize: 12 }}>Линейная (растяжение уровней)</div>
        <label>Чёрная точка: {black}</label>
        <input type="range" min="0" max="254" value={black} onChange={(e) => setBlack(+e.target.value)} />
        <label>Белая точка: {white}</label>
        <input type="range" min="1" max="255" value={white} onChange={(e) => setWhite(+e.target.value)} />
        <button style={{ marginTop: 7 }} onClick={doLinear}>Применить линейную коррекцию</button>

        <div style={{ fontWeight: 600, fontSize: 12, marginTop: 14 }}>Нелинейная</div>
        <label>γ (гамма): {(gamma / 100).toFixed(2)}</label>
        <input type="range" min="10" max="500" value={gamma} onChange={(e) => setGamma(+e.target.value)} />
        <div className="btn-row">
          <button onClick={doGamma}>Гамма</button>
          <button className="sec" onClick={doLog}>Лог</button>
          <button className="sec" onClick={doExp}>Эксп</button>
        </div>

        <div className="btn-row">
          <button className="sec" onClick={handleReset}>↺ Сбросить параметры</button>
        </div>
      </div>
    </details>
  );
}