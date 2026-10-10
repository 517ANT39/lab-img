import { useState, useRef, useEffect } from 'react';
import cv from '@/cv/cvInstance.js';

export default function VideoPanel({ showToast, videoCanvasRef, videoElRef }) {
  const [mode, setMode] = useState('bg');
  const [blur, setBlur] = useState(21);
  const [running, setRunning] = useState(false);
  const fgbgRef = useRef(null);
  const vidCanvasRef = useRef(null);
  const vidCtxRef = useRef(null);

  const init = (file) => {
    const v = videoElRef.current;
    if (!v || !file) return;
    v.src = URL.createObjectURL(file);
    v.play().catch(() => {});
    fgbgRef.current = new cv.BackgroundSubtractorMOG2(500, 24, false);
    showToast('Видео загружено. Нажмите «Старт».');
  };

  const loop = () => {
    if (!running) return;
    try {
      const v = videoElRef.current;
      if (v && v.readyState >= 2 && v.videoWidth > 0) {
        if (!vidCanvasRef.current) {
          vidCanvasRef.current = document.createElement('canvas');
          vidCtxRef.current = vidCanvasRef.current.getContext('2d', { willReadFrequently: true });
        }
        const canvas = vidCanvasRef.current;
        const ctx = vidCtxRef.current;
        if (canvas.width !== v.videoWidth || canvas.height !== v.videoHeight) {
          canvas.width = v.videoWidth; canvas.height = v.videoHeight;
        }
        ctx.drawImage(v, 0, 0);

        const rgba = cv.imread(canvas);
        const rgb = new cv.Mat();
        cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
        rgba.delete();

        let out;
        if (mode === 'bg') {
          const fg = new cv.Mat();
          fgbgRef.current.apply(rgb, fg);
          const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
          cv.morphologyEx(fg, fg, cv.MORPH_OPEN, k);
          cv.dilate(fg, fg, k, new cv.Point(-1, -1), 2);
          k.delete();

          const gray = new cv.Mat();
          cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
          const grayRGB = new cv.Mat();
          cv.cvtColor(gray, grayRGB, cv.COLOR_GRAY2RGB);
          grayRGB.convertTo(grayRGB, -1, 0.5, 0);

          const mask3 = new cv.Mat();
          cv.cvtColor(fg, mask3, cv.COLOR_GRAY2RGB);
          const inv = new cv.Mat();
          cv.bitwise_not(mask3, inv);
          const a = new cv.Mat(), b = new cv.Mat();
          cv.bitwise_and(rgb, mask3, a);
          cv.bitwise_and(grayRGB, inv, b);
          out = new cv.Mat();
          cv.bitwise_or(a, b, out);

          gray.delete(); grayRGB.delete(); mask3.delete(); inv.delete();
          a.delete(); b.delete(); fg.delete();
        } else {
          const fg = new cv.Mat();
          fgbgRef.current.apply(rgb, fg);
          const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
          cv.morphologyEx(fg, fg, cv.MORPH_OPEN, k);
          cv.dilate(fg, fg, k, new cv.Point(-1, -1), 3);
          k.delete();

          const blurred = new cv.Mat();
          cv.blur(rgb, blurred, new cv.Size(blur, blur));
          const mask3 = new cv.Mat();
          cv.cvtColor(fg, mask3, cv.COLOR_GRAY2RGB);
          const inv = new cv.Mat();
          cv.bitwise_not(mask3, inv);
          const a = new cv.Mat(), b = new cv.Mat();
          cv.bitwise_and(blurred, mask3, a);
          cv.bitwise_and(rgb, inv, b);
          out = new cv.Mat();
          cv.bitwise_or(a, b, out);

          blurred.delete(); mask3.delete(); inv.delete();
          a.delete(); b.delete(); fg.delete();
        }

        const outRGBA = new cv.Mat();
        cv.cvtColor(out, outRGBA, cv.COLOR_RGB2RGBA);
        if (videoCanvasRef.current) cv.imshow(videoCanvasRef.current, outRGBA);
        outRGBA.delete(); out.delete(); rgb.delete();
      }
    } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  };

  useEffect(() => {
    if (running) {
      const v = videoElRef.current;
      if (v) {
        v.play().catch(() => {});
        requestAnimationFrame(loop);
      }
    }
    // eslint-disable-next-line
  }, [running]);

  return (
    <details>
      <summary>12. Видео: фон и движение</summary>
      <div className="body">
        <input type="file" accept="video/*"
          onChange={(e) => e.target.files[0] && init(e.target.files[0])} />
        <label>Режим</label>
        <select value={mode} onChange={(e) => {
          setMode(e.target.value);
          if (fgbgRef.current) {
            fgbgRef.current.delete();
            fgbgRef.current = new cv.BackgroundSubtractorMOG2(500, 24, false);
          }
        }}>
          <option value="bg">Вычитание фона (MOG2)</option>
          <option value="motionblur">Размытие движущихся объектов</option>
        </select>
        <label>Сила размытия: {blur}</label>
        <input type="range" min="3" max="61" step="2" value={blur}
          onChange={(e) => setBlur(+e.target.value)} />
        <div className="btn-row">
          <button className="green" onClick={() => {
            if (!videoElRef.current?.src) { showToast('Сначала выберите видео'); return; }
            if (!fgbgRef.current) fgbgRef.current = new cv.BackgroundSubtractorMOG2(500, 24, false);
            setRunning(true);
          }}>▶ Старт</button>
          <button className="danger" onClick={() => {
            setRunning(false);
            videoElRef.current?.pause();
          }}>■ Стоп</button>
        </div>
      </div>
    </details>
  );
}