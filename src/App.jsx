import { useState, useEffect, useRef, useCallback } from 'react';
import cv from './cv/cvInstance.js';
import { useOpenCV } from './hooks/useOpenCV.js';
import { showMat, toGray, grayToRGB } from './cv/utils.js';
import { drawHistogram } from './cv/histogram.js';

import Section from './components/Section.jsx';
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

const MAIN_PAGES = [
  { id: 'image', label: '1. Обработка изображений' },
  { id: 'compare', label: '2. Сравнение изображений' },
  { id: 'video', label: '3. Обработка видео' }
];

export default function App() {
  const { ready } = useOpenCV();
  const [meta, setMeta] = useState(null);
  const [profile, setProfile] = useState('sRGB');
  const [pixel, setPixel] = useState({ r: 79, g: 156, b: 249 });
  const [channels, setChannels] = useState({ r: true, g: true, b: true });
  const [toast, setToast] = useState('');
  const [tick, setTick] = useState(0);
  
  const [historyLen, setHistoryLen] = useState(0);
  const [globalResetTrigger, setGlobalResetTrigger] = useState(0);
  const [isGrayMode, setIsGrayMode] = useState(false);

  const [currentPage, setCurrentPage] = useState('image');
  const [zoom, setZoom] = useState(1);

  const [histHeight, setHistHeight] = useState(150);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const mats = useRef({
    orig: null, cur: null, before: null, base: null, kpBase: null,
    isGrayFilter: false,
    history: [], panelBases: {}
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
    setHistoryLen(mats.current.history.length);
    setTick(t => t + 1);
  }, []);

  const onMouseDown = (e) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = histHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isDragging.current) return;
      const delta = startY.current - e.clientY;
      const newHeight = Math.max(100, Math.min(600, startHeight.current + delta));
      setHistHeight(newHeight);
    };

    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  useEffect(() => {
    if (mats.current.cur && cvResultRef.current) {
      showMat(mats.current.cur, cvResultRef.current);
    }
    if (mats.current.cur && histAfterRef.current) {
      drawHistogram(histAfterRef.current, mats.current.cur, channels);
    }
  }, [tick, channels, currentPage, histHeight]);

  useEffect(() => {
    if (!histAfterRef.current) return;
    const observer = new ResizeObserver(() => {
      if (mats.current.cur && histAfterRef.current) {
        drawHistogram(histAfterRef.current, mats.current.cur, channels);
      }
    });
    observer.observe(histAfterRef.current);
    return () => observer.disconnect();
  }, [channels]);

  const clearAllBases = useCallback(() => {
    const m = mats.current;
    while (m.history.length) { const h = m.history.pop(); try { h.delete(); } catch (_) { } }
    for (const k in m.panelBases) { try { m.panelBases[k].delete(); } catch (_) { } }
    m.panelBases = {};
    if (m.kpBase) { try { m.kpBase.delete(); } catch (_) { } m.kpBase = null; }
    setHistoryLen(0);
  }, []);

  const clearOtherBases = useCallback((keepKey) => {
    const m = mats.current;
    for (const k in m.panelBases) {
      if (k === keepKey) continue;
      // Сохраняем базы 'gray' и 'adjust' друг для друга
      if ((keepKey === 'gray' || keepKey === 'adjust') && (k === 'gray' || k === 'adjust')) continue;
      try { m.panelBases[k].delete(); } catch (_) { }
      delete m.panelBases[k];
    }
    if (keepKey !== 'keypoints' && m.kpBase) { try { m.kpBase.delete(); } catch (_) { } m.kpBase = null; }
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
        clearAllBases();
        
        m.isGrayFilter = false;
        setIsGrayMode(false);

        m.orig = rgb;
        m.cur = rgb.clone();
        m.before = null;
        m.base = null;

        setMeta({
          name: file.name, type: file.type, size: file.size,
          lastModified: file.lastModified, width: img.naturalWidth, height: img.naturalHeight,
          hasAlpha, bitsPerChannelSource: 8, channelsSource: hasAlpha ? 4 : 3
        });

        setZoom(1);
        setGlobalResetTrigger(p => p + 1);
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
    clearAllBases();
    
    m.isGrayFilter = false;
    setIsGrayMode(false);

    m.cur = m.orig.clone();
    m.before = null;
    m.base = null;
    setZoom(1);
    setGlobalResetTrigger(p => p + 1);
    refreshDisplay();
    showToast('Сброшено к исходному');
  }, [refreshDisplay, showToast, clearAllBases]);

  const handleUndo = useCallback(() => {
    const m = mats.current;
    if (!m.history.length) { showToast('Нечего откатывать'); return; }
    
    const prev = m.history.pop();
    
    clearOtherBases(null);
    m.isGrayFilter = false;
    setIsGrayMode(false);

    if (m.before) m.before.delete();
    m.before = m.cur;
    m.cur = prev;
    if (m.base) { m.base.delete(); m.base = null; }

    setGlobalResetTrigger(p => p + 1);
    refreshDisplay();
    showToast('Откат выполнен');
  }, [refreshDisplay, showToast, clearOtherBases]);

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

    if (panelKey) {
      clearOtherBases(panelKey);
      if (!m.panelBases[panelKey]) m.panelBases[panelKey] = m.cur.clone();
    } else {
      clearOtherBases(null);
    }

    if (panelKey === 'gray') {
      m.isGrayFilter = true;
      setIsGrayMode(true);
    } else if (panelKey === 'adjust') {
      m.isGrayFilter = false;
      setIsGrayMode(false);
    }

    m.history.push(m.cur.clone());
    if (m.history.length > 20) { const old = m.history.shift(); try { old.delete(); } catch (_) { } }

    if (m.before) m.before.delete();
    m.before = m.cur.clone();

    const oldCur = m.cur;
    m.cur = out;
    try { oldCur.delete(); } catch (_) { }

    if (m.base) { m.base.delete(); m.base = null; }

    // НЕ сбрасываем AdjustPanel триггером при его собственных операциях и сером цвете
    if (panelKey !== 'adjust' && panelKey !== 'gray') {
      setGlobalResetTrigger(p => p + 1);
    }
    refreshDisplay();
    if (opName) showToast(opName);
  }, [refreshDisplay, showToast, clearOtherBases]);

  const resetPanel = useCallback((panelKey, label) => {
    const m = mats.current;
    if (!m.cur) { showToast('Изображение не загружено'); return; }
    const base = m.panelBases[panelKey];
    if (base) {
      const res = base.clone();
      
      m.history.push(m.cur.clone());
      if (m.history.length > 20) { const old = m.history.shift(); try { old.delete(); } catch (_) { } }

      const oldCur = m.cur;
      m.cur = res;
      try { oldCur.delete(); } catch (_) { }
      try { base.delete(); } catch (_) { }
      delete m.panelBases[panelKey];
      
      if (panelKey === 'gray' || panelKey === 'adjust') {
        m.isGrayFilter = false;
        setIsGrayMode(false);
      }

      if (m.before) { m.before.delete(); m.before = null; }
      if (m.base) { m.base.delete(); m.base = null; }

      clearOtherBases(panelKey); // Передаем panelKey, чтобы не задеть оставшуюся базу
      setGlobalResetTrigger(p => p + 1);
      refreshDisplay();
      showToast((label || 'Операция') + ' отменена');
    } else {
      refreshDisplay();
      showToast('Параметры сброшены');
    }
  }, [refreshDisplay, showToast, clearOtherBases]);

  if (!ready) {
    return (
      <div className="loader">
        <div className="spinner" />
        <div>Загрузка OpenCV.js…</div>
      </div>
    );
  }

  const hasImage = !!mats.current.cur;

  const hasBaseAdjust = !!(mats.current.panelBases && mats.current.panelBases.adjust);
  const hasBaseGray = !!(mats.current.panelBases && mats.current.panelBases.gray);
  const hasBaseBW = !!(mats.current.panelBases && mats.current.panelBases.bw);
  const hasBaseMorph = !!(mats.current.panelBases && mats.current.panelBases.morph);
  const hasBaseFilters = !!(mats.current.panelBases && mats.current.panelBases.filters);
  const hasBaseEdge = !!(mats.current.panelBases && mats.current.panelBases.edge);

  return (
    <>
      <div id="app" data-tick={tick}>
        <header className="main-nav">
          {MAIN_PAGES.map(page => (
            <button
              key={page.id}
              className={`nav-btn ${currentPage === page.id ? 'active' : ''}`}
              onClick={() => setCurrentPage(page.id)}
            >
              {page.label}
            </button>
          ))}
        </header>

        {currentPage === 'image' && (
          <div className="page-content image-page-layout">
            <aside className="controls">
              <Section title="Загрузка изображения" defaultOpen>
                <input type="file" accept="image/*"
                  onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])} />
                <div className="btn-row">
                  <button className="sec" onClick={handleReset}>↺ Сброс</button>
                  <button className="sec" onClick={handleUndo}>
                    ↶ Откат ({historyLen})
                  </button>
                </div>
                <div className="hint">Клик по изображению — «пипетка».</div>
              </Section>

              <Section title="Информация" defaultOpen>
                <ImageInfo meta={meta} curRGB={mats.current.cur} />
              </Section>

              <Section title="Цветовые модели" defaultOpen>
                <ColorModelPanel profile={profile} pixel={pixel} onPixelChange={setPixel} />
              </Section>

              <Section title="Градации серого">
                <div className="btn-row" style={{ marginTop: 0 }}>
                  <button onClick={() => applyOp((src) => grayToRGB(toGray(src)), 'Полутоновое', 'gray')}>
                    В оттенки серого
                  </button>
                  <button
                    className={hasBaseGray ? 'red' : 'sec'}
                    onClick={() => resetPanel('gray', 'Градации серого')}
                  >
                    ↺ Сброс
                  </button>
                </div>
              </Section>

              <AdjustPanel
                mats={mats}
                applyOp={applyOp}
                resetPanel={resetPanel}
                showToast={showToast}
                hasChanges={hasBaseAdjust}
                isGrayMode={isGrayMode}
              />
              
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
              <KeypointsPanel 
                mats={mats} 
                canvasRef={cvResultRef} 
                showToast={showToast} 
                historyLen={historyLen} 
              />
            </aside>

            <div className="viewer">
              <div className="pane pane-image">
                <div className="pane-title">
                  <span>Изображение</span>
                  
                  <div className="zoom-controls">
                    <button className="sec" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} title="Уменьшить">-</button>
                    <span className="zoom-label">{Math.round(zoom * 100)}%</span>
                    <button className="sec" onClick={() => setZoom(z => Math.min(4, z + 0.25))} title="Увеличить">+</button>
                    <button className="sec" onClick={() => setZoom(1)} title="Сбросить">1:1</button>
                  </div>

                  <span>
                    {mats.current.cur
                      ? `${mats.current.cur.cols} × ${mats.current.cur.rows}`
                      : (meta ? `${meta.width} × ${meta.height}` : '')}
                  </span>
                </div>

                <div className="image-scroll-container">
                  {!hasImage && (
                    <div className="image-placeholder">
                      Изображение не загружено.<br />Выберите файл в меню слева.
                    </div>
                  )}
                  
                  <canvas
                    ref={cvResultRef}
                    style={{
                      display: hasImage ? 'block' : 'none',
                      width: `${zoom * 100}%`,
                      maxWidth: zoom <= 1 ? '100%' : 'none',
                      height: 'auto',
                      maxHeight: zoom <= 1 ? '100%' : 'none'
                    }}
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

              <div className="resizer" onMouseDown={onMouseDown}>
                <div className="resizer-handle"></div>
              </div>

              <div className="pane pane-hist" style={{ height: `${histHeight}px` }}>
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
        )}

        {currentPage === 'compare' && (
          <div className="page-content single-page">
            <div className="pane">
              <div className="pane-title"><span>Поиск похожих изображений</span></div>
              <div className="pane-body">
                <SimilarPanel showToast={showToast} />
              </div>
            </div>
          </div>
        )}

        {currentPage === 'video' && (
          <div className="page-content single-page">
            <div className="pane">
              <div className="pane-title"><span>Обработка видео</span></div>
              <div className="pane-body">
                <VideoPanel
                  showToast={showToast}
                  videoElRef={videoElRef}
                  videoCanvasRef={videoCanvasRef}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <video ref={videoElRef} style={{ display: 'none' }} playsInline muted loop />
      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </>
  );
}