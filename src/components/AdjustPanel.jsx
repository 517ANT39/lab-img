import { useState } from 'react';
import cv from '@/cv/cvInstance.js';

export default function AdjustPanel({ mats, refreshDisplay, showToast }) {
  const [bri, setBri] = useState(0);
  const [con, setCon] = useState(100);
  const [sat, setSat] = useState(100);

  const applyAdjust = (base) => {
    const b = bri, c = con / 100, s = sat / 100;
    let m = new cv.Mat();
    base.convertTo(m, -1, c, b);
    if (Math.abs(s - 1) > 0.001) {
      const hsv = new cv.Mat();
      cv.cvtColor(m, hsv, cv.COLOR_RGB2HSV);
      const ch = new cv.MatVector();
      cv.split(hsv, ch);
      const sCh = ch.get(1);
      const tmp = new cv.Mat();
      sCh.convertTo(tmp, -1, s, 0);
      tmp.copyTo(sCh);
      tmp.delete();
      cv.merge(ch, hsv);
      cv.cvtColor(hsv, m, cv.COLOR_HSV2RGB);
      ch.delete(); hsv.delete();
    }
    return m;
  };

  const onInput = () => {
    const m = mats.current;
    if (!m.cur) { showToast('Сначала загрузите изображение'); return; }
    if (!m.base) {
      m.base = m.cur.clone();
      if (m.before) m.before.delete();
      m.before = m.cur.clone();
    }
    const res = applyAdjust(m.base);
    if (m.cur) m.cur.delete();
    m.cur = res;
    refreshDisplay();
  };

  const reset = () => {
    setBri(0); setCon(100); setSat(100);
    const m = mats.current;
    if (m.base && m.cur) {
      const res = m.base.clone();
      m.cur.delete();
      m.cur = res;
      m.base.delete(); m.base = null;
      if (m.before) { m.before.delete(); m.before = null; }
      refreshDisplay();
    }
  };

  return (
    <details>
      <summary>5. Яркость / Насыщенность / Контраст</summary>
      <div className="body">
        <label>Яркость: {bri}</label>
        <input type="range" min="-120" max="120" value={bri}
          onChange={(e) => { setBri(+e.target.value); setTimeout(onInput, 0); }} />
        <label>Контраст: {(con / 100).toFixed(2)}</label>
        <input type="range" min="10" max="300" value={con}
          onChange={(e) => { setCon(+e.target.value); setTimeout(onInput, 0); }} />
        <label>Насыщенность: {(sat / 100).toFixed(2)}</label>
        <input type="range" min="0" max="300" value={sat}
          onChange={(e) => { setSat(+e.target.value); setTimeout(onInput, 0); }} />
        <div className="btn-row">
          <button className="sec" onClick={reset}>Сбросить ползунки</button>
        </div>
        <div className="hint">Слайдеры пересчитываются от состояния до правок. Сброс возвращает базу.</div>
      </div>
    </details>
  );
}