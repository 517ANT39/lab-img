import { useState, useEffect, useRef, useCallback } from 'react';
import cv from './cv/cvInstance.js';
import { useOpenCV } from './hooks/useOpenCV.js';
import { showMat, toGray, grayToRGB } from './cv/utils.js';
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
  const [tick, setTick] = useState(0);

  const [openAreas, setOpenAreas] = useState({
    image: true, similar: true, video: true
  });

  const mats = useRef({
    orig: null,
    cur: null,
    before: null,
    base: null,
    kpBase: null,
    history: [],
    panelBases: {}
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
    setTick(t => t + 1);
  }, []);

  useEffect(() => {
    if (mats.current.cur && cvResultRef.current) {
      showMat(mats.current.cur, cvResultRef.current);
    }
    if (mats.current.cur && histAfterRef.current) {
      drawHistogram(histAfterRef.current, mats.current.cur, channels);
    }
  }, [tick, channels, openAreas.image]);

  const clearAllBases = useCallback(() => {
    const m = mats.current;
    while (m.history.length) {
      const h = m.history.pop();
      try { h.delete(); } catch (_) { }
    }
    for (const k in m.panelBases) {
      try { m.panelBases[k].delete(); } catch (_) { }
    }
    m.panelBases = {};
  }, []);

  const clearOtherBases = useCallback((keepKey) => {
    const m = mats.current;
    for (const k in m.panelBases) {
      if (k === keepKey) continue;
      try { m.panelBases[k].delete(); } catch (_) { }
      delete m.panelBases[k];
    }
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
        if (m.kpBase) { try { m.kpBase.delete(); } catch (_) { } m.kpBase = null; }
        clearAllBases();

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
        showToast('Ошибка: ' + e.message);
      }
    };
    img.onerror = () => { showToast('Не удалось открыть файл'); URL.revokeObjectURL(url); };
    img.src = url;
  }, [refreshDisplay, showToast, clearAllBases]);

  const handleReset = useCallback(() => {
    const m = mats.current;
    if (!m.orig) { showToast('Изображение не загружено'); return; }
    if (m.cur) m.cur.delete();
    if (m.before) m.before.delete();
    if (m.base) m.base.delete();
    if (m.kpBase) { try { m.kpBase.delete(); } catch (_) { } m.kpBase = null; }
    clearAllBases();
    m.cur = m.orig.clone();
    m.before = null;
    m.base = null;
    refreshDisplay();
    showToast('Сброшено к исходному');
  }, [refreshDisplay, showToast, clearAllBases]);

  const handleUndo = useCallback(() => {
    const m = mats.current;
    if (!m.history.length) { showToast('Нечего откатывать'); return; }
    const prev = m.history.pop();
    if (m.before) m.before.delete();
    m.before = m.cur;
    m.cur = prev;
    if (m.base) { m.base.delete(); m.base = null; }
    if (m.kpBase) { try { m.kpBase.delete(); } catch (_) { } m.kpBase = null; }
    clearAllBases();
    refreshDisplay();
    showToast('Откат выполнен');
  }, [refreshDisplay, showToast, clearAllBases]);

  // Панели 7-10 используют panelKey для своей отмены.
  // Панель 11 не передаёт panelKey — она сама управляет своим кэшем.
  const applyOp = useCallback((fn, opName, panelKey) => {
    const m = mats.current;
    if (!m.cur) { showToast('Сначала загрузите изображение'); return; }


    if (m.kpBase) { try { m.kpBase.delete(); } catch (_) { } m.kpBase = null; }
    let out;
    try { out = fn(m.cur); }
    catch (e) {
      console.error('applyOp:', e);
      showToast('Ошибка: ' + e.message);
      return;
    }
    if (!out) { showToast('Пустой результат'); return; }

    if (panelKey) {
      clearOtherBases(panelKey);
      if (!m.panelBases[panelKey]) {
        m.panelBases[panelKey] = m.cur.clone();
      }
    } else {
      clearOtherBases(null);
    }

    m.history.push(m.cur.clone());
    if (m.history.length > 20) {
      const old = m.history.shift();
      try { old.delete(); } catch (_) { }
    }

    if (m.before) m.before.delete();
    m.before = m.cur.clone();

    const oldCur = m.cur;
    m.cur = out;
    try { oldCur.delete(); } catch (_) { }

    if (m.base) { m.base.delete(); m.base = null; }

    refreshDisplay();
    if (opName) showToast(opName);
  }, [refreshDisplay, showToast, clearOtherBases]);

  const resetPanel = useCallback((panelKey, label) => {
    const m = mats.current;
    if (!m.cur) { showToast('Изображение не загружено'); return; }
    const base = m.panelBases[panelKey];
    if (base) {
      const res = base.clone();
      const oldCur = m.cur;
      m.cur = res;
      try { oldCur.delete(); } catch (_) { }
      try { base.delete(); } catch (_) { }
      delete m.panelBases[panelKey];
      if (m.before) { m.before.delete(); m.before = null; }
      if (m.base) { m.base.delete(); m.base = null; }
      refreshDisplay();
      showToast((label || 'Операция') + ' отменена');
    } else {
      refreshDisplay();
      showToast('Параметры сброшены');
    }
  }, [refreshDisplay, showToast]);

  if (!ready) {
    return (
      <div className="loader">
        <div className="spinner" />
        <div>Загрузка OpenCV.js…</div>
      </div>
    );
  }

  const hasImage = !!mats.current.cur;

  const toggleArea = (key) => (e) => {
    if (e.target !== e.currentTarget) return;
    setOpenAreas((s) => ({ ...s, [key]: e.target.open }));
  };

  const hasBaseBW = !!(mats.current.panelBases && mats.current.panelBases.bw);
  const hasBaseMorph = !!(mats.current.panelBases && mats.current.panelBases.morph);
  const hasBaseFilters = !!(mats.current.panelBases && mats.current.panelBases.filters);
  const hasBaseEdge = !!(mats.current.panelBases && mats.current.panelBases.edge);
  const hasBaseKeypoints = !!(mats.current.panelBases && mats.current.panelBases.keypoints);

  return (
    <>
      <div id="app" data-tick={tick}>
        <details className="area" open={openAreas.image} onToggle={toggleArea('image')}>
          <summary className="area-header">
            <span className="area-num">1</span>
            <h2>Обработка изображений</h2>
            <span className="area-chevron">▾</span>
          </summary>

          <div className="area-body area-image-body">
            <aside className="controls">
              <Section title="Загрузка изображения" defaultOpen>
                <input type="file" accept="image/*"
                  onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])} />
                <div className="btn-row">
                  <button className="sec" onClick={handleReset}>↺ Сброс</button>
                  <button className="sec" onClick={handleUndo}>↶ Откат ({mats.current.history.length})</button>
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
                mats={mats}
                applyOp={applyOp}
                resetPanel={resetPanel}
                hasChanges={hasBaseBW}
              />
              <MorphologyPanel
                mats={mats}
                applyOp={applyOp}
                resetPanel={resetPanel}
                hasChanges={hasBaseMorph}
              />
              <FiltersPanel
                mats={mats}
                applyOp={applyOp}
                resetPanel={resetPanel}
                hasChanges={hasBaseFilters}
              />
              <EdgePanel
                mats={mats}
                applyOp={applyOp}
                resetPanel={resetPanel}
                hasChanges={hasBaseEdge}
              />

              {/* Панель 11 — независимая, со своим кэшем */}
              <KeypointsPanel
                mats={mats}
                refreshDisplay={refreshDisplay}
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
                  key={`cv-${tick}`}
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
                          onChange={(e) => setChannels({ ...channels, [c]: e.target.checked })} />
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
            <span className="area-chevron">▾</span>
          </summary>
          <div className="area-body">
            <SimilarPanel showToast={showToast} />
          </div>
        </details>

        <details className="area" open={openAreas.video} onToggle={toggleArea('video')}>
          <summary className="area-header">
            <span className="area-num">3</span>
            <h2>Работа с видео</h2>
            <span className="area-chevron">▾</span>
          </summary>
          <div className="area-body">
            <VideoPanel showToast={showToast} videoElRef={videoElRef} videoCanvasRef={videoCanvasRef} />
          </div>
        </details>
      </div>

      <video ref={videoElRef} style={{ display: 'none' }} playsInline muted loop />
      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </>
  );
}