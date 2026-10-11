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
import SimilarPanel from './components/SimilarPanel.jsx';

export default function App() {
  const { ready } = useOpenCV();
  const [meta, setMeta] = useState(null);
  const [profile, setProfile] = useState('sRGB');
  const [pixel, setPixel] = useState({ r: 79, g: 156, b: 249 });
  const [channels, setChannels] = useState({ r: true, g: true, b: true });
  const [toast, setToast] = useState('');
  const [historyLen, setHistoryLen] = useState(0);

  const [openAreas, setOpenAreas] = useState({
    image: true, similar: true, video: true
  });

  // Какие панели применили операцию
  const [panelApplied, setPanelApplied] = useState({
    bw: false, morph: false, filters: false, edge: false, keypoints: false
  });

  const mats = useRef({
    orig: null,
    cur: null,
    before: null,
    base: null,
    history: [],
    panelBases: {} // { bw: Mat, morph: Mat, ... }
  });

  const cvResultRef = useRef(null);
  const histAfterRef = useRef(null);
  const videoCanvasRef = useRef(null);
  const videoElRef = useRef(null);

  const showToast = useCallback((msg, ms = 1900) => {
    setToast(msg);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(''), ms);
  }, []);

  const refreshDisplay = useCallback(() => {
    if (openAreas.image) {
      showMat(mats.current.cur, cvResultRef.current);
      drawHistogram(histAfterRef.current, mats.current.cur, channels);
    }
    setHistoryLen(mats.current.history.length);
  }, [channels, openAreas.image]);

  useEffect(() => {
    if (openAreas.image && mats.current.cur) {
      showMat(mats.current.cur, cvResultRef.current);
      drawHistogram(histAfterRef.current, mats.current.cur, channels);
    }
  }, [openAreas.image, channels]);

  const clearHistory = useCallback(() => {
    const m = mats.current;
    while (m.history.length) {
      const h = m.history.pop();
      try { h.delete(); } catch (_) {}
    }
    setHistoryLen(0);
  }, []);

  const clearPanelBases = useCallback(() => {
    const m = mats.current;
    for (const key in m.panelBases) {
      try { m.panelBases[key].delete(); } catch (_) {}
    }
    m.panelBases = {};
    setPanelApplied({ bw: false, morph: false, filters: false, edge: false, keypoints: false });
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
        clearPanelBases();

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

        setOpenAreas((s) => s.image ? s : { ...s, image: true });

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
  }, [refreshDisplay, showToast, clearHistory, clearPanelBases]);

  const handleReset = useCallback(() => {
    const m = mats.current;
    if (!m.orig) { showToast('Изображение не загружено'); return; }
    if (m.cur) m.cur.delete();
    if (m.before) m.before.delete();
    if (m.base) m.base.delete();
    clearHistory();
    clearPanelBases();
    m.cur = m.orig.clone();
    m.before = null;
    m.base = null;
    refreshDisplay();
    showToast('Изображение сброшено к исходному');
  }, [refreshDisplay, showToast, clearHistory, clearPanelBases]);

  const handleUndo = useCallback(() => {
    const m = mats.current;
    if (!m.history.length) { showToast('Нечего откатывать'); return; }
    const prev = m.history.pop();
    if (m.before) m.before.delete();
    m.before = m.cur;
    m.cur = prev;
    if (m.base) { m.base.delete(); m.base = null; }
    // Сбрасываем флаги панелей — их базы больше невалидны после отката
    for (const key in m.panelBases) {
      try { m.panelBases[key].delete(); } catch (_) {}
    }
    m.panelBases = {};
    setPanelApplied({ bw: false, morph: false, filters: false, edge: false, keypoints: false });
    refreshDisplay();
    showToast('Откат выполнен');
  }, [refreshDisplay, showToast]);

  // applyOp с опциональным panelKey — при первом применении сохраняет базу панели
  const applyOp = useCallback((fn, opName, panelKey) => {
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

    // Запоминаем базу панели при первом успешном применении
    if (panelKey && !m.panelBases[panelKey]) {
      try {
        m.panelBases[panelKey] = m.cur.clone();
      } catch (e) {
        console.warn('panelBases clone:', e);
      }
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

    if (panelKey) {
      setPanelApplied((p) => (p[panelKey] ? p : { ...p, [panelKey]: true }));
    }

    refreshDisplay();
    if (opName) showToast(opName);
  }, [refreshDisplay, showToast]);

  // Отмена операции конкретной панели
  const resetPanel = useCallback((panelKey, label) => {
    const m = mats.current;
    const base = m.panelBases[panelKey];
    if (base && m.cur) {
      const res = base.clone();
      m.cur.delete();
      m.cur = res;
      try { base.delete(); } catch (_) {}
      delete m.panelBases[panelKey];

      if (m.before) { m.before.delete(); m.before = null; }
      if (m.base) { m.base.delete(); m.base = null; }

      setPanelApplied((p) => ({ ...p, [panelKey]: false }));
      refreshDisplay();
      showToast((label || 'Изменения') + ' отменены');
    } else {
      setPanelApplied((p) => ({ ...p, [panelKey]: false }));
      showToast('Параметры сброшены');
    }
  }, [refreshDisplay, showToast]);

  if (!ready) {
    return (
      <div className="loader">
        <div className="spinner" />
        <div>Загрузка OpenCV.js и jsfeat…</div>
      </div>
    );
  }

  const hasImage = !!mats.current.cur;

  const toggleArea = (key) => (e) => {
    if (e.target !== e.currentTarget) return;
    setOpenAreas((s) => ({ ...s, [key]: e.target.open }));
  };

  return (
    <>
      <div id="app">
        <details className="area" open={openAreas.image} onToggle={toggleArea('image')}>
          <summary className="area-header">
            <span className="area-num">1</span>
            <h2>Обработка изображений</h2>
            <span className="area-chevron" aria-hidden="true">▾</span>
          </summary>

          <div className="area-body area-image-body">
            <aside className="controls">
              <Section title="Загрузка изображения" defaultOpen>
                <input type="file" accept="image/*"
                  onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])} />
                <div className="btn-row">
                  <button className="sec" onClick={handleReset}>↺ Сброс</button>
                  <button className="sec" onClick={handleUndo}>↶ Откат ({historyLen})</button>
                </div>
                <div className="hint">Клик по изображению — «пипетка».</div>
              </Section>

              <Section title="Информация об изображении" defaultOpen>
                <ImageInfo meta={meta} curRGB={mats.current.cur} />
              </Section>

              <Section title="Цветовые модели и профиль" defaultOpen>
                <ColorProfileSelector profile={profile} onChange={setProfile} />
                <div style={{ height: 12 }} />
                <ColorModelPanel profile={profile} pixel={pixel} onPixelChange={setPixel} />
              </Section>

              <Section title="Градации серого">
                <button onClick={() => applyOp((src) => grayToRGB(toGray(src)), 'Полутоновое')}>
                  Преобразовать в оттенки серого
                </button>
              </Section>

              <AdjustPanel mats={mats} refreshDisplay={refreshDisplay} showToast={showToast} />

              <BWCorrectionPanel
                applyOp={applyOp}
                resetPanel={resetPanel}
                hasChanges={panelApplied.bw}
              />
              <MorphologyPanel
                applyOp={applyOp}
                resetPanel={resetPanel}
                hasChanges={panelApplied.morph}
              />
              <FiltersPanel
                applyOp={applyOp}
                resetPanel={resetPanel}
                hasChanges={panelApplied.filters}
              />
              <EdgePanel
                applyOp={applyOp}
                resetPanel={resetPanel}
                hasChanges={panelApplied.edge}
              />
              <KeypointsPanel
                applyOp={applyOp}
                resetPanel={resetPanel}
                hasChanges={panelApplied.keypoints}
                showToast={showToast}
              />
            </aside>

            <div className="viewer">
              <div className="pane pane-image">
                <div className="pane-title">
                  <span>Изображение</span>
                  <span>
                    {mats.current.cur
                      ? `${mats.current.cur.cols} × ${mats.current.cur.rows}`
                      : (meta ? `${meta.width} × ${meta.height}` : '')}
                  </span>
                </div>

                {!hasImage && (
                  <div className="image-placeholder">
                    Изображение не загружено.
                  </div>
                )}

                <canvas
                  ref={cvResultRef}
                  style={{ display: hasImage ? 'block' : 'none' }}
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

              <div className="pane pane-hist">
                <div className="pane-title">
                  <span>Гистограмма</span>
                  <div className="hist-channels">
                    {['r', 'g', 'b'].map((c) => (
                      <label key={c} className={`ch ch-${c} ${channels[c] ? 'on' : ''}`}>
                        <input type="checkbox" checked={channels[c]}
                          onChange={(e) => {
                            const nc = { ...channels, [c]: e.target.checked };
                            setChannels(nc);
                            drawHistogram(histAfterRef.current, mats.current.cur, nc);
                          }} />
                        {c.toUpperCase()}
                      </label>
                    ))}
                  </div>
                </div>
                <canvas ref={histAfterRef} />
              </div>
            </div>
          </div>
        </details>

        <details className="area" open={openAreas.similar} onToggle={toggleArea('similar')}>
          <summary className="area-header">
            <span className="area-num">2</span>
            <h2>Поиск похожих изображений</h2>
            <span className="area-chevron" aria-hidden="true">▾</span>
          </summary>
          <div className="area-body">
            <SimilarPanel showToast={showToast} />
          </div>
        </details>

        <details className="area" open={openAreas.video} onToggle={toggleArea('video')}>
          <summary className="area-header">
            <span className="area-num">3</span>
            <h2>Работа с видео</h2>
            <span className="area-chevron" aria-hidden="true">▾</span>
          </summary>
          <div className="area-body">
            <VideoPanel
              showToast={showToast}
              videoElRef={videoElRef}
              videoCanvasRef={videoCanvasRef}
            />
          </div>
        </details>
      </div>

      <video ref={videoElRef} style={{ display: 'none' }} playsInline muted loop />
      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </>
  );
}