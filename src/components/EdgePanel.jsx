import cv from '../cv/cvInstance.js';
import { toGray, grayToRGB } from '../cv/utils.js';

const DEFAULTS = { t1: 80, t2: 180 };

export default function EdgePanel({ applyOp, resetPanel, hasChanges, params, setParams }) {
  const { t1, t2 } = params;

  const doCanny = () => {
    applyOp((src) => {
      const g = toGray(src);
      const edges = new cv.Mat();
      cv.Canny(g, edges, t1, t2, 3, false);
      const rgb = grayToRGB(edges);
      g.delete(); edges.delete();
      return rgb;
    }, 'Детектор Canny', 'edge');
  };

  const doRoberts = () => {
    applyOp((src) => {
      const g = toGray(src);
      const kx = cv.matFromArray(2, 2, cv.CV_32F, [1, 0, 0, -1]);
      const ky = cv.matFromArray(2, 2, cv.CV_32F, [0, 1, -1, 0]);
      const dx = new cv.Mat(), dy = new cv.Mat();
      cv.filter2D(g, dx, cv.CV_32F, kx);
      cv.filter2D(g, dy, cv.CV_32F, ky);
      const mag = new cv.Mat();
      cv.magnitude(dx, dy, mag);
      const norm = new cv.Mat();
      cv.normalize(mag, norm, 0, 255, cv.NORM_MINMAX);
      const out8 = new cv.Mat();
      norm.convertTo(out8, cv.CV_8U);
      const rgb = grayToRGB(out8);
      kx.delete(); ky.delete(); dx.delete(); dy.delete();
      mag.delete(); norm.delete(); out8.delete(); g.delete();
      return rgb;
    }, 'Оператор Робертса', 'edge');
  };

  const handleReset = () => {
    setParams(DEFAULTS);
    resetPanel('edge', 'Детекторы границ');
  };

  return (
    <details>
      <summary>Детекторы границ</summary>
      <div className="body">
        <label>Canny — нижний порог: {t1}</label>
        <input type="range" min="0" max="255" value={t1} onChange={(e) => setParams({ t1: +e.target.value })} />
        <label>Canny — верхний порог: {t2}</label>
        <input type="range" min="0" max="255" value={t2} onChange={(e) => setParams({ t2: +e.target.value })} />
        <button style={{ marginTop: 6 }} onClick={doCanny}>Детектор Canny</button>
        <button className="sec" style={{ marginTop: 10 }} onClick={doRoberts}>Оператор Робертса</button>

        {/* <div className="btn-row">
          <button className={hasChanges ? 'red' : 'sec'} onClick={handleReset}>
            ↺ Сброс
          </button>
        </div> */}
      </div>
    </details>
  );
}