import { useState } from 'react';
import cv from '../cv/cvInstance.js';

export default function AdjustPanel({ mats, refreshDisplay, showToast }) {
  const [bri, setBri] = useState(0);
  const [con, setCon] = useState(100);
  const [sat, setSat] = useState(100);
  const [hasChanges, setHasChanges] = useState(false);

  // Применяет яркость/контраст/насыщенность к базе с явными значениями
  const buildAdjusted = (base, b, c, s) => {
    const m = new cv.Mat();
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

  // Вызывается при движении любого ползунка
  const onInput = (newBri, newCon, newSat) => {
    const m = mats.current;
    if (!m.cur) { showToast('Сначала загрузите изображение'); return; }

    // Запоминаем базу при первой правке
    if (!m.base) {
      m.base = m.cur.clone();
      if (m.before) m.before.delete();
      m.before = m.cur.clone();
    }

    const b = newBri;
    const c = newCon / 100;
    const s = newSat / 100;

    const res = buildAdjusted(m.base, b, c, s);
    m.cur.delete();
    m.cur = res;

    setHasChanges(true);
    refreshDisplay();
  };

  // Кнопка: если правки были — полный откат изображения; иначе — просто UI
  const reset = () => {
    const m = mats.current;

    setBri(0);
    setCon(100);
    setSat(100);

    if (m.base && m.cur) {
      // Возвращаем изображение к состоянию до первой правки слайдера
      const res = m.base.clone();
      m.cur.delete();
      m.cur = res;
      m.base.delete();
      m.base = null;
      if (m.before) { m.before.delete(); m.before = null; }

      refreshDisplay();
      setHasChanges(false);
      showToast('Изменения яркости/контраста/насыщенности отменены');
    } else {
      setHasChanges(false);
      showToast('Ползунки сброшены');
    }
  };

  return (
    <details>
      <summary>Яркость / Насыщенность / Контраст</summary>
      <div className="body">
        <label>Яркость: {bri}</label>
        <input
          type="range" min="-120" max="120" value={bri}
          onChange={(e) => {
            const v = +e.target.value;
            setBri(v);
            onInput(v, con, sat);
          }}
        />

        <label>Контраст: {(con / 100).toFixed(2)}</label>
        <input
          type="range" min="10" max="300" value={con}
          onChange={(e) => {
            const v = +e.target.value;
            setCon(v);
            onInput(bri, v, sat);
          }}
        />

        <label>Насыщенность: {(sat / 100).toFixed(2)}</label>
        <input
          type="range" min="0" max="300" value={sat}
          onChange={(e) => {
            const v = +e.target.value;
            setSat(v);
            onInput(bri, con, v);
          }}
        />

        <div className="btn-row">
          <button
            className={hasChanges ? 'green' : 'sec'}
            onClick={reset}
          >
            {hasChanges ? '↺ Отменить изменения' : '↺ Сбросить ползунки'}
          </button>
        </div>

        <div className="hint">
          {hasChanges
            ? <>Есть неотменённые правки. Кнопка вернёт изображение к состоянию <b>до</b> первой правки.</>
            : <>Слайдеры изменяют изображение сразу. Кнопка откатит их, если правки были сделаны.</>}
        </div>
      </div>
    </details>
  );
}