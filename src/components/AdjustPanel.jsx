import { useState, useRef } from 'react';
import cv from '../cv/cvInstance.js';

export default function AdjustPanel({ mats, applyOp, resetPanel, showToast }) {
  const [bri, setBri] = useState(0);
  const [con, setCon] = useState(100);
  const [sat, setSat] = useState(100);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Запоминаем последние применённые значения
  const appliedRef = useRef({ bri: 0, con: 100, sat: 100 });

  // Проверяем глобальный флаг, а не просто цвет пикселей
  const isGrayFilter = !!(mats.current && mats.current.isGrayFilter);

  const updateHasChanges = (b, c, s) => {
    const a = appliedRef.current;
    setHasChanges(b !== a.bri || c !== a.con || s !== a.sat);
  };

  const onChangeBri = (v) => { setBri(v); updateHasChanges(v, con, sat); };
  const onChangeCon = (v) => { setCon(v); updateHasChanges(bri, v, sat); };
  
  const onChangeSat = (v) => {
    // Блокируем ТОЛЬКО если градации серого были применены кнопкой
    if (isGrayFilter && v > 0) {
      showToast('Применены градации серого — насыщенность недоступна', 2500);
      return;
    }
    setSat(v);
    updateHasChanges(bri, con, v);
  };

  const apply = () => {
    if (!hasChanges) { showToast('Нет изменений для применения'); return; }

    const b = bri;
    const c = con / 100;
    const s = sat / 100;

    // Используем общую систему App.jsx
    applyOp((src) => {
      const res = new cv.Mat();
      src.convertTo(res, -1, c, b);
      
      if (Math.abs(s - 1) > 0.001 && !isGrayFilter) {
        const hsv = new cv.Mat();
        cv.cvtColor(res, hsv, cv.COLOR_RGB2HSV);
        const ch = new cv.MatVector();
        cv.split(hsv, ch);
        const sCh = ch.get(1);
        const tmp = new cv.Mat();
        sCh.convertTo(tmp, -1, s, 0);
        tmp.copyTo(sCh);
        tmp.delete();
        cv.merge(ch, hsv);
        cv.cvtColor(hsv, res, cv.COLOR_HSV2RGB);
        ch.delete(); hsv.delete();
      }
      return res;
    }, 'Яркость/Контраст', 'adjust');

    appliedRef.current = { bri, con, sat };
    setHasChanges(false);
  };

  const reset = () => {
    setBri(0); 
    setCon(100); 
    setSat(100);
    appliedRef.current = { bri: 0, con: 100, sat: 100 };
    setHasChanges(false);
    
    // Используем общую систему для отмены
    resetPanel('adjust', 'Яркость/Контраст');
  };

  return (
    <details>
      <summary>Яркость / Насыщенность / Контраст</summary>
      <div className="body">
        <label>Яркость: {bri}</label>
        <input type="range" min="-120" max="120" value={bri} onChange={(e) => onChangeBri(+e.target.value)} />

        <label>Контраст: {(con / 100).toFixed(2)}</label>
        <input type="range" min="10" max="300" value={con} onChange={(e) => onChangeCon(+e.target.value)} />

        <label>Насыщенность: {(sat / 100).toFixed(2)}</label>
        <input type="range" min="0" max="300" value={sat} onChange={(e) => onChangeSat(+e.target.value)} />

        <div className="btn-stack">
          <button className={hasChanges ? 'green' : 'sec'} onClick={apply}>
            ✓ Применить
          </button>
          <button className="sec" onClick={reset}>
            ↺ Сбросить параметры
          </button>
        </div>

        <div className="hint">
          Ползунки изменяют значения. Картинка меняется только по кнопке <b>Применить</b>.
        </div>
      </div>
    </details>
  );
}