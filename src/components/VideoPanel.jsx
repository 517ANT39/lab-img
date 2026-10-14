import { useState, useRef, useEffect } from 'react';
import cv from '../cv/cvInstance.js';
import { showMat } from '../cv/utils.js';

export default function VideoPanel({ showToast, videoElRef, videoCanvasRef }) {
  const [mode, setMode] = useState('mask');
  const [blur, setBlur] = useState(15);
  const [running, setRunning] = useState(false);
  const [loadedName, setLoadedName] = useState('');

  const runningRef = useRef(false);
  const modeRef = useRef(mode);
  const blurRef = useRef(blur);
  const fgbgRef = useRef(null);
  const rafRef = useRef(null);
  const workCanvasRef = useRef(null);
  const workCtxRef = useRef(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { blurRef.current = blur; }, [blur]);

  const init = (file) => {
    const v = videoElRef.current;
    if (!v || !file) return;
    stop();
    v.src = URL.createObjectURL(file);
    v.load();
    if (fgbgRef.current) { try { fgbgRef.current.delete(); } catch (_) {} }
    // MOG2: history=100, varThreshold=30, detectShadows=false
    fgbgRef.current = new cv.BackgroundSubtractorMOG2(100, 30, false);
    setLoadedName(file.name);
    showToast('Видео загружено. Нажмите «Старт»');
  };

  const loop = () => {
    if (!runningRef.current) return;

    try {
      const v = videoElRef.current;
      if (!v || v.readyState < 2 || v.videoWidth === 0) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // Ограничиваем размер кадра для производительности
      const MAX_W = 640;
      const scale = v.videoWidth > MAX_W ? MAX_W / v.videoWidth : 1;
      const w = Math.round(v.videoWidth * scale);
      const h = Math.round(v.videoHeight * scale);

      if (!workCanvasRef.current) {
        workCanvasRef.current = document.createElement('canvas');
        workCtxRef.current = workCanvasRef.current.getContext('2d', { willReadFrequently: true });
      }
      const wc = workCanvasRef.current;
      const wctx = workCtxRef.current;
      if (wc.width !== w || wc.height !== h) { wc.width = w; wc.height = h; }
      wctx.drawImage(v, 0, 0, w, h);

      const rgba = cv.imread(wc);
      const rgb = new cv.Mat();
      cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
      rgba.delete();

      // ---- MOG2 ----
      const fg = new cv.Mat();
      fgbgRef.current.apply(rgb, fg, 0.01);

      // Лёгкая морфология — убираем шум, сохраняем силуэты
      const k3 = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
      cv.morphologyEx(fg, fg, cv.MORPH_OPEN, k3);
      cv.morphologyEx(fg, fg, cv.MORPH_CLOSE, k3);
      k3.delete();

      let out = new cv.Mat();

      if (modeRef.current === 'mask') {
        // ===== Режим 1: цветные объекты на чёрном фоне =====
        // Маска — три канала, потом bitwise_and(rgb, mask3):
        // где маска белая — пиксели оригинала,
        // где чёрная — нули, т.е. чёрный фон.
        const mask3 = new cv.Mat();
        cv.cvtColor(fg, mask3, cv.COLOR_GRAY2RGB);
        cv.bitwise_and(rgb, mask3, out);
        mask3.delete();

      } else {
        // ===== Режим 2: размытие движущихся =====
        const ksize = blurRef.current % 2 === 0 ? blurRef.current + 1 : blurRef.current;
        const blurred = new cv.Mat();
        cv.GaussianBlur(rgb, blurred, new cv.Size(ksize, ksize), 0, 0, cv.BORDER_DEFAULT);

        const mask3 = new cv.Mat();
        cv.cvtColor(fg, mask3, cv.COLOR_GRAY2RGB);
        const inv = new cv.Mat();
        cv.bitwise_not(mask3, inv);

        const a = new cv.Mat(), b = new cv.Mat();
        cv.bitwise_and(blurred, mask3, a);  // движущееся — размытое
        cv.bitwise_and(rgb, inv, b);        // фон — резкий
        cv.bitwise_or(a, b, out);

        blurred.delete(); mask3.delete(); inv.delete();
        a.delete(); b.delete();
      }

      if (videoCanvasRef.current) {
        showMat(out, videoCanvasRef.current);
      }

      out.delete(); fg.delete(); rgb.delete();
    } catch (e) {
      console.error('video loop:', e);
    }

    rafRef.current = requestAnimationFrame(loop);
  };

  const start = () => {
    const v = videoElRef.current;
    if (!v || !v.src) { showToast('Сначала выберите видео'); return; }
    if (runningRef.current) return;
    if (!fgbgRef.current) {
      fgbgRef.current = new cv.BackgroundSubtractorMOG2(100, 30, false);
    }
    runningRef.current = true;
    setRunning(true);
    v.play().catch(() => {});
    rafRef.current = requestAnimationFrame(loop);
  };

  const stop = () => {
    runningRef.current = false;
    setRunning(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const v = videoElRef.current;
    if (v) v.pause();
  };

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (fgbgRef.current) { try { fgbgRef.current.delete(); } catch (_) {} }
    };
  }, []);

  return (
    <div className="video-panel">
      <div className="pane">
        <div className="pane-title">
          <span>Результат обработки</span>
          {loadedName && <span style={{ fontSize: 11, opacity: 0.75 }}>{loadedName}</span>}
        </div>
        <canvas ref={videoCanvasRef} className="video-canvas" />
      </div>

      <div className="video-settings">
        <div className="pane">
          <div className="pane-title"><span>Загрузка видео</span></div>
          <div className="pane-body">
            <input type="file" accept="video/*"
              onChange={(e) => e.target.files[0] && init(e.target.files[0])} />
          </div>
        </div>

        <div className="pane">
          <div className="pane-title"><span>Настройки</span></div>
          <div className="pane-body">
            <label>Режим</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="mask">Вычитание фона (объекты на чёрном)</option>
              <option value="motionblur">Размытие движущихся</option>
            </select>

            <label style={{ marginTop: 10 }}>
              Сила размытия: {blur}
            </label>
            <input type="range" min="5" max="51" step="2" value={blur}
              onChange={(e) => setBlur(+e.target.value)}
              disabled={mode !== 'motionblur'} />

            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="green" disabled={running} onClick={start}>
                ▶ Старт
              </button>
              <button className="danger" disabled={!running} onClick={stop}>
                ■ Стоп
              </button>
            </div>
          </div>
        </div>

        <div className="pane">
          <div className="pane-title"><span>Справка</span></div>
          <div className="pane-body">
            <div className="hint">
              <b>Вычитание фона</b> — цветные движущиеся объекты на чёрном фоне.<br />
              <b>Размытие движущихся</b> — движущиеся объекты размыты, фон резкий.<br /><br />
              Работает лучше на видео со <b>статичной камерой</b>.
              Первые 1–2 секунды алгоритм обучается — маска может быть неполной.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}