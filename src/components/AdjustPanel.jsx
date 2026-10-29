import { useEffect } from 'react';
import cv from '../cv/cvInstance.js';

export default function AdjustPanel({
  mats, applyOp, resetPanel, showToast, hasChanges, isGrayMode,
  params, setParams,
}) {
  const { bri, con, sat } = params;

  // Сброс ТОЛЬКО насыщенности при включении градаций серого
  useEffect(() => {
    if (isGrayMode && sat !== 100) {
      setParams({ sat: 100 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGrayMode]);

  const onChangeBri = (v) => setParams({ bri: v });
  const onChangeCon = (v) => setParams({ con: v });
  
  const onChangeSat = (v) => {
    if (isGrayMode && v > 0) {
      showToast('Применены градации серого — насыщенность недоступна', 2500);
      return;
    }
    setParams({ sat: v });
  };

  const apply = () => {
    const isDefault = bri === 0 && con === 100 && sat === 100;
    const hasBase = !!(mats.current.panelBases && mats.current.panelBases.adjust);
    if (isDefault && !hasBase) {
      showToast('Нет изменений для применения');
      return;
    }

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
  };

  const reset = () => {
    setParams({ bri: 0, con: 100, sat: 100 });
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
            Применить
          </button>
          {/* <button className={hasChanges ? 'red' : 'sec'} onClick={reset}>
            ↺ Сброс
          </button> */}
        </div>
      </div>
    </details>
  );
}