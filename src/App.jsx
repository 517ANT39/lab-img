import { useState, useEffect, useRef, useCallback } from 'react';
import cv from './cv/cvInstance.js';
import { useOpenCV } from './hooks/useOpenCV.js';
import { showMat, toGray, grayToRGB, matsAreEqual } from './cv/utils.js';
import { drawHistogram } from './cv/histogram.js';

import Section from './components/Section.jsx';
import ColorProfileSelector from './components/ColorProfileSelector.jsx';
import ColorModelPanel from './components/ColorModelPanel.jsx';
import ImageInfo from './components/ImageInfo.jsx';
import AdjustPanel from './components/AdjustPanel.jsx';
import BWCorrectionPanel from './components/BWCorrectionPanel.jsx';
import MorphologyPanel from './components/MorphologyPanel.jsx';
import FiltersPanel from './components/FiltersPanel.jsx';
import EdgePanel from './components/EdgePanel.jsx';
import KeypointsPanel from './components/KeypointsPanel.jsx';
import VideoPanel from './components/VideoPanel.jsx';

export default function App() {
  const { ready } = useOpenCV();
  const [meta, setMeta] = useState(null);
  const [profile, setProfile] = useState('sRGB');
  const [pixel, setPixel] = useState({ r: 79, g: 156, b: 249 });
  const [channels, setChannels] = useState({ r: true, g: true, b: true });
  const [toast, setToast] = useState('');
  const [historyLen, setHistoryLen] = useState(0);

  const mats = useRef({
    orig: null,
    cur: null,
    before: null,
    base: null,
    history: []
  });

  const cvOriginalRef = useRef(null);
  const cvResultRef = useRef(null);
  const histBeforeRef = useRef(null);
  const histAfterRef = useRef(null);
  const videoCanvasRef = useRef(null);
  const videoElRef = useRef(null);

  const showToast = useCallback((msg, ms = 1900) => {
    setToast(msg);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(''), ms);
  }, []);

  const refreshDisplay = useCallback(() => {
    showMat(mats.current.cur, cvResultRef.current);
    drawHistogram(histBeforeRef.current, mats.current.before, channels);
    drawHistogram(histAfterRef.current, mats.current.cur, channels);
    setHistoryLen(mats.current.history.length);
  }, [channels]);

  const clearHistory = useCallback(() => {
    const m = mats.current;
    while (m.history.length) {
      const h = m.history.pop();
      try { h.delete(); } catch (_) {}
    }
    setHistoryLen(0);
  }, []);

  const handleFileUpload = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) { showToast('Это не изображение'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const idata = ctx.getImageData(0, 0, c.width, c.height);

        let hasAlpha = false;
        const totalPx = idata.data.length / 4;
        const stepPx = Math.max(1, Math.floor(totalPx / 2000));
        for (let p = 0; p < totalPx; p += stepPx) {
          if (idata.data[p * 4 + 3] < 250) { hasAlpha = true; break; }
        }

        const rgba = cv.matFromImageData(idata);
        const rgb = new cv.Mat();
        cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
        rgba.delete();

        const m = mats.current;
        if (m.orig) m.orig.delete();
        if (m.cur) m.cur.delete();
        if (m.before) m.before.delete();
        if (m.base) m.base.delete();
        clearHistory();

        m.orig = rgb;
        m.cur = rgb.clone();
        m.before = null;
        m.base = null;

        setMeta({
          name: file.name, type: file.type, size: file.size,
          lastModified: file.lastModified,
          width: img.naturalWidth, height: img.naturalHeight,
          hasAlpha,
          bitsPerChannelSource: 8,
          channelsSource: hasAlpha ? 4 : 3
        });

        showMat(m.orig, cvOriginalRef.current);
        refreshDisplay();
        showToast('Изображение загружено');
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error(e);
        showToast('Ошибка обработки: ' + e.message);
      }
    };
    img.onerror = () => { showToast('Не удалось открыть файл'); URL.revokeObjectURL(url); };
    img.src = url;
  }, [refreshDisplay, showToast, clearHistory]);

  const handleReset = useCallback(() => {
    const m = mats.current;
    if (!m.orig) { showToast('Изображение не загружено'); return; }
    if (m.cur) m.cur.delete();
    if (m.before) m.before.delete();
    if (m.base) m.base.delete();
    clearHistory();
    m.cur = m.orig.clone();
    m.before = null;
    m.base = null;
    refreshDisplay();
    showToast('Изображение сброшено к исходному');
  }, [refreshDisplay, showToast, clearHistory]);

  const handleUndo = useCallback(() => {
    const m = mats.current;
    if (!m.history.length) { showToast('Нечего откатывать'); return; }
    const prev = m.history.pop();
    if (m.before) m.before.delete();
    m.before = m.cur;
    m.cur = prev;
    if (m.base) { m.base.delete(); m.base = null; }
    refreshDisplay();
    showToast('Откат выполнен');
  }, [refreshDisplay, showToast]);

  const applyOp = useCallback((fn, opName) => {
    const m = mats.current;
    if (!m.cur) { showToast('Сначала загрузите изображение'); return; }

    let out;
    try { out = fn(m.cur); }
    catch (e) {
      console.error('applyOp:', e);
      showToast('Ошибка: ' + e.message);
      return;
    }
    if (!out) { showToast('Пустой результат'); return; }

    if (matsAreEqual(m.cur, out)) {
      out.delete();
      showToast('Результат не отличается от текущего');
      return;
    }

    try {
      m.history.push(m.cur.clone());
      while (m.history.length > 20) {
        const old = m.history.shift();
        try { old.delete(); } catch (_) {}
      }
    } catch (e) { console.warn('history push:', e); }

    const before = m.cur.clone();
    if (m.before) m.before.delete();
    m.before = before;

    m.cur = out;

    if (m.base) { m.base.delete(); m.base = null; }

    refreshDisplay();
    if (opName) showToast(opName);
  }, [refreshDisplay, showToast]);

  if (!ready) {
    return (
      <div className="loader">
        <div className="spinner" />
        <div>Загрузка OpenCV.js и jsfeat…</div>
      </div>
    );
  }

  return (
    <>
      <div id="app">
        <aside id="sidebar">
          <h2>⚙ Обработка изображений</h2>

          <Section title="1. Загрузка изображения" defaultOpen>
            <input type="file" accept="image/*"
              onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])} />
            <div className="btn-row">
              <button className="sec" onClick={handleReset}>↺ Сбросить к исходному</button>
              <button className="sec" onClick={handleUndo}>↶ Откатить ({historyLen})</button>
            </div>
            <div className="hint">Клик по результату — «пипетка».</div>
          </Section>

          <Section title="2. Информация об изображении" defaultOpen>
            <ImageInfo meta={meta} curRGB={mats.current.cur} />
          </Section>

          <Section title="3. Цветовые модели и профиль" defaultOpen>
            <ColorProfileSelector profile={profile} onChange={setProfile} />
            <div style={{ height: 12 }} />
            <ColorModelPanel profile={profile} pixel={pixel} onPixelChange={setPixel} />
          </Section>

          <Section title="4. Градации серого">
            <button onClick={() => applyOp((src) => grayToRGB(toGray(src)), 'Полутоновое')}>
              Преобразовать в оттенки серого
            </button>
          </Section>

          <AdjustPanel mats={mats} refreshDisplay={refreshDisplay} showToast={showToast} />

          <Section title="6. Гистограмма (каналы)">
            <div className="grid3">
              {['r', 'g', 'b'].map((c) => (
                <label key={c} style={{ margin: 0 }}>
                  <input type="checkbox" checked={channels[c]}
                    onChange={(e) => {
                      const nc = { ...channels, [c]: e.target.checked };
                      setChannels(nc);
                      drawHistogram(histBeforeRef.current, mats.current.before, nc);
                      drawHistogram(histAfterRef.current, mats.current.cur, nc);
                    }} />
                  {' '}{c.toUpperCase()}
                </label>
              ))}
            </div>
          </Section>

          <BWCorrectionPanel applyOp={applyOp} />
          <MorphologyPanel applyOp={applyOp} />
          <FiltersPanel applyOp={applyOp} />
          <EdgePanel applyOp={applyOp} />
          <KeypointsPanel applyOp={applyOp} showToast={showToast} />
          <VideoPanel showToast={showToast} videoElRef={videoElRef} videoCanvasRef={videoCanvasRef} />
        </aside>

        <main>
          <div className="viewer">
            <div className="pane">
              <div className="pane-title">
                <span>Исходное изображение</span>
                <span>{meta ? `${meta.width} × ${meta.height}` : ''}</span>
              </div>
              <canvas ref={cvOriginalRef} />
            </div>
            <div className="pane">
              <div className="pane-title">
                <span>Результат</span>
                <span>{mats.current.cur ? `${mats.current.cur.cols} × ${mats.current.cur.rows}` : ''}</span>
              </div>
              <canvas
                ref={cvResultRef}
                onClick={(e) => {
                  const m = mats.current.cur;
                  if (!m) return;
                  const rect = e.target.getBoundingClientRect();
                  const x = Math.floor((e.clientX - rect.left) * m.cols / rect.width);
                  const y = Math.floor((e.clientY - rect.top) * m.rows / rect.height);
                  if (x < 0 || y < 0 || x >= m.cols || y >= m.rows) return;
                  const px = m.ucharPtr(y, x);
                  setPixel({ r: px[0], g: px[1], b: px[2] });
                  showToast(`Пиксель (${x},${y}) = RGB(${px[0]},${px[1]},${px[2]})`);
                }}
              />
            </div>
          </div>

          <div className="hist-row">
            <div className="pane">
              <div className="pane-title">Гистограмма «ДО»</div>
              <canvas ref={histBeforeRef} />
            </div>
            <div className="pane">
              <div className="pane-title">Гистограмма «ПОСЛЕ»</div>
              <canvas ref={histAfterRef} />
            </div>
          </div>

          <div className="pane" id="videoPanel" style={{ marginTop: 12 }}>
            <div className="pane-title"><span>Обработка видео</span></div>
            <canvas ref={videoCanvasRef} />
          </div>
        </main>
      </div>

      <video ref={videoElRef} style={{ display: 'none' }} playsInline muted loop />
      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </>
  );
}