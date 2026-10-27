import { useState, useRef, useCallback } from 'react';
import cv from '../cv/cvInstance.js';

export default function SimilarPanel({ showToast }) {
  const [images, setImages] = useState([]);
  const [best, setBest] = useState(null);
  const [loading, setLoading] = useState(false);
  const imagesRef = useRef([]);

  const computeHSHist = (mat) => {
    const small = new cv.Mat();
    const k = Math.min(1, 256 / Math.max(mat.cols, mat.rows));
    cv.resize(
      mat, small,
      new cv.Size(Math.max(1, Math.round(mat.cols * k)), Math.max(1, Math.round(mat.rows * k))),
      0, 0, cv.INTER_AREA
    );
    const hsv = new cv.Mat();
    cv.cvtColor(small, hsv, cv.COLOR_RGB2HSV);
    const vec = new cv.MatVector();
    vec.push_back(hsv);
    const mask = new cv.Mat();
    const hist = new cv.Mat();
    cv.calcHist(vec, [0, 1], mask, hist, [30, 32], [0, 180, 0, 256], false);
    cv.normalize(hist, hist, 0, 1, cv.NORM_MINMAX);
    vec.delete(); mask.delete(); hsv.delete(); small.delete();
    return hist;
  };

  const clearAll = useCallback(() => {
    imagesRef.current.forEach((o) => {
      try { o.mat.delete(); o.hist.delete(); } catch (_) {}
      URL.revokeObjectURL(o.url);
    });
    imagesRef.current = [];
    setImages([]);
    setBest(null);
  }, []);

  const handleFiles = useCallback(async (files) => {
    const list = Array.from(files);

    // ПРОВЕРКА: от 3 до 10 файлов
    if (list.length < 3 || list.length > 10) {
      showToast(`Пожалуйста, выберите от 3 до 10 изображений (выбрано: ${list.length})`, 3000);
      return;
    }

    clearAll();
    setLoading(true);

    const results = [];
    for (const file of list) {
      try {
        const url = URL.createObjectURL(file);
        const img = await new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = rej;
          im.src = url;
        });

        const c = document.createElement('canvas');
        const scale = Math.min(1, 300 / Math.max(img.naturalWidth, img.naturalHeight));
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const idata = ctx.getImageData(0, 0, c.width, c.height);
        const rgba = cv.matFromImageData(idata);
        const rgb = new cv.Mat();
        cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
        rgba.delete();

        const hist = computeHSHist(rgb);
        results.push({ name: file.name, url, mat: rgb, hist });
      } catch (e) {
        console.error('load image:', e);
      }
    }

    imagesRef.current = results;
    setImages(results);
    setLoading(false);
    showToast(`Загружено: ${results.length}. Нажмите «Найти»`);
  }, [showToast, clearAll]);

  const findBest = useCallback(() => {
    const list = imagesRef.current;
    if (list.length < 2) { showToast('Для сравнения нужно минимум 2 изображения'); return; }
    let bestScore = -Infinity, bi = -1, bj = -1;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const s = cv.compareHist(list[i].hist, list[j].hist, cv.HISTCMP_CORREL);
        if (s > bestScore) { bestScore = s; bi = i; bj = j; }
      }
    }
    if (bi < 0) { showToast('Не удалось сравнить'); return; }
    setBest({ i: bi, j: bj, score: bestScore });
    showToast('Лучшая пара найдена');
  }, [showToast]);

  return (
    <div className="similar-panel">
      <div className="sim-controls">
        <div>
          {/* Обновленная подпись с диапазоном */}
          <label>Изображения (от 3 до 10 штук)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </div>

        <button onClick={findBest} disabled={images.length < 2 || loading}>
          🔎 Найти 2 самых похожих
        </button>

        <button className="red" onClick={clearAll} disabled={!images.length}>
          Очистить
        </button>

        {loading && <div className="hint">Загрузка изображений…</div>}

        {images.length > 0 && (
          <div className="sim-count">
            Загружено: <b>{images.length}</b>
            {images.length < 3 && ' (нужно минимум 3)'}
            {images.length > 10 && ' (максимум 10)'}
          </div>
        )}

      </div>

      <div className="sim-results">
        {images.length === 0 && !loading && (
          <div className="sim-empty">
            Изображений нет.<br/>Загрузите от 3 до 10 изображений для сравнения.
          </div>
        )}

        {images.length > 0 && (
          <div className="sim-grid">
            {images.map((im, idx) => {
              const isBest = best && (idx === best.i || idx === best.j);
              return (
                <div key={idx} className={`sim-card ${isBest ? 'best' : ''}`}>
                  <img src={im.url} alt={im.name} />
                  <div className="cap" title={im.name}>{im.name}</div>
                </div>
              );
            })}
          </div>
        )}

        {best && (
          <div className="sim-result">
            <div style={{ marginBottom: 6 }}>
              <b style={{ color: '#22c55e' }}>✓ Наиболее похожие изображения</b>
            </div>
            <div style={{ fontSize: 12, color: '#96a0b3', lineHeight: 1.7 }}>
              1. <b style={{ color: '#e9edf5' }}>{images[best.i].name}</b><br />
              2. <b style={{ color: '#e9edf5' }}>{images[best.j].name}</b><br />
              Корреляция HSV-гистограмм:{' '}
              <b style={{ color: '#4f9cf9' }}>{best.score.toFixed(4)}</b>
              <span className="badge">{(best.score * 100).toFixed(1)}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}