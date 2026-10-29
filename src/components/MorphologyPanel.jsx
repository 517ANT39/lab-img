import cv from '../cv/cvInstance.js';
import { toGray, grayToRGB } from '../cv/utils.js';

const DEFAULTS = { op: 'erode', shape: 0, ksize: 3, iter: 1 };

export default function MorphologyPanel({ applyOp, resetPanel, hasChanges, params, setParams, setIsGrayMode }) {
  const { op, shape, ksize, iter } = params;

  const run = () => {
    setIsGrayMode(true);
    applyOp((src) => {
      const kernel = cv.getStructuringElement(shape, new cv.Size(ksize, ksize));
      const g = toGray(src);
      const dst = new cv.Mat();
      const anchor = new cv.Point(-1, -1);
      switch (op) {
        case 'erode': cv.erode(g, dst, kernel, anchor, iter); break;
        case 'dilate': cv.dilate(g, dst, kernel, anchor, iter); break;
        case 'open': cv.morphologyEx(g, dst, cv.MORPH_OPEN, kernel, anchor, iter); break;
        case 'close': cv.morphologyEx(g, dst, cv.MORPH_CLOSE, kernel, anchor, iter); break;
        case 'gradient': cv.morphologyEx(g, dst, cv.MORPH_GRADIENT, kernel, anchor, iter); break;
      }
      const rgb = grayToRGB(dst);
      kernel.delete(); g.delete(); dst.delete();
      return rgb;
    }, 'Морфология применена', 'morph');
  };

  const handleReset = () => {
    setParams(DEFAULTS);
    resetPanel('morph', 'Морфология');
  };

  return (
    <details>
      <summary>Морфологические операции</summary>
      <div className="body">
        <label>Операция</label>
        <select value={op} onChange={(e) => setParams({ op: e.target.value })}>
          <option value="erode">Эрозия</option>
          <option value="dilate">Дилатация</option>
          <option value="open">Открытие</option>
          <option value="close">Закрытие</option>
          <option value="gradient">Градиент</option>
        </select>
        <label>Форма ядра</label>
        <select value={shape} onChange={(e) => setParams({ shape: +e.target.value })}>
          <option value="0">Прямоугольник</option>
          <option value="1">Крест</option>
          <option value="2">Эллипс</option>
        </select>
        <label>Размер ядра: {ksize}</label>
        <input type="range" min="3" max="31" step="2" value={ksize} onChange={(e) => setParams({ ksize: +e.target.value })} />
        <label>Итерации: {iter}</label>
        <input type="range" min="1" max="8" value={iter} onChange={(e) => setParams({ iter: +e.target.value })} />
        <button style={{ marginTop: 8 }} onClick={run}>Применить</button>
      </div>
    </details>
  );
}