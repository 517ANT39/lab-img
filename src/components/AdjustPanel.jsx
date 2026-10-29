import { useState, useEffect } from 'react';
import cv from '../cv/cvInstance.js';

export default function AdjustPanel({ mats, applyOp, resetPanel, showToast, hasChanges, isGrayMode }) {
  const [bri, setBri] = useState(0);
  const [con, setCon] = useState(100);
  const [sat, setSat] = useState(100);
  const [isDirty, setIsDirty] = useState(false);

  // Полный сброс, только если база была полностью уничтожена (сброс, откат, другой фильтр)
  useEffect(() => {
    if (!hasChanges) {
      setBri(0);
      setCon(100);
      setSat(100);
      setIsDirty(false);
    }
  }, [hasChanges]);

  // Сброс ТОЛЬКО насыщенности при включении градаций серого
  useEffect(() => {
    if (isGrayMode) {
      setSat(100);
    }
  }, [isGrayMode]);

  const onChangeBri = (v) => { setBri(v); setIsDirty(true); };
  const onChangeCon = (v) => { setCon(v); setIsDirty(true); };
  
  const onChangeSat = (v) => {
    if (isGrayMode && v > 0) {
      showToast('Применены градации серого — насыщенность недоступна', 2500);
      return;
    }
    setSat(v);
    setIsDirty(true);
  };

  const apply = () => {
    if (!isDirty) { showToast('Нет изменений для применения'); return; }

    const b = bri;
    const c = con / 100;
    const s = sat / 100;

    applyOp((src) => {
      const base = (mats.current.panelBases && mats.current.panelBases.adjust) 
        ? mats.current.panelBases.adjust 
        : src;
        
      const res = new cv.Mat();
      base.convertTo(res, -1, c, b);
      
      if (Math.abs(s - 1) > 0.001 && !isGrayMode) {
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

    setIsDirty(false);
  };

  const reset = () => {
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
          <button onClick={apply}>
            ✓ Применить
          </button>
          {/* <button className={hasChanges ? 'red' : 'sec'} onClick={reset}>
            ↺ Сброс
          </button> */}
        </div>
      </div>
    </details>
  );
}