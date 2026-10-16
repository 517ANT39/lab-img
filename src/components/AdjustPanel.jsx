import { useState, useEffect, useRef } from 'react';
import cv from '../cv/cvInstance.js';

const DEFAULTS = { bri: 0, con: 100, sat: 100 };

export default function AdjustPanel({ mats, refreshDisplay, showToast, tick }) {
  const [bri, setBri] = useState(DEFAULTS.bri);
  const [con, setCon] = useState(DEFAULTS.con);
  const [sat, setSat] = useState(DEFAULTS.sat);
  const [hasChanges, setHasChanges] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);

  const appliedRef = useRef({ bri: DEFAULTS.bri, con: DEFAULTS.con, sat: DEFAULTS.sat });

  // Синхронизация с внешним сбросом.
  // Срабатывает при tick — то есть после любого refreshDisplay.
  // Если у панели ЕСТЬ база (m.base) — не трогаем ползунки.
  // Если базы нет — значит App сделал сброс/откат/загрузил новый файл.
  useEffect(() => {
    const m = mats.current;
    if (m && m.base) return;

    // Базы нет — обнуляем всё
    setBri(DEFAULTS.bri);
    setCon(DEFAULTS.con);
    setSat(DEFAULTS.sat);
    setHasChanges(false);
    setHasApplied(false);
    appliedRef.current = { bri: DEFAULTS.bri, con: DEFAULTS.con, sat: DEFAULTS.sat };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const isGrayscale = (mat) => {
    if (!mat) return false;
    const w = mat.cols, h = mat.rows;
    const total = w * h;
    const step = Math.max(1, Math.floor(total / 1000));
    let checked = 0;
    for (let p = 0; p < total; p += step) {
      const y = Math.floor(p / w);
      const x = p % w;
      const px = mat.ucharPtr(y, x);
      if (Math.abs(px[0] - px[1]) > 2 || Math.abs(px[1] - px[2]) > 2) {
        return false;
      }
      checked++;
      if (checked >= 1000) break;
    }
    return true;
  };

  const buildAdjusted = (base, b, c, s) => {
    const m = new cv.Mat();
    base.convertTo(m, -1, c, b);
    if (Math.abs(s - 1) > 0.001) {
      const hsv = new cv.Mat();
      cv.cvtColor(m, hsv, cv.COLOR_RGB2HSV);
      const ch = new cv.MatVector();
      cv.split(hsv, ch);
      const sCh = ch.get(1);
      const tmp = new cv.Mat();
      sCh.convertTo(tmp, -1, s, 0);
      tmp.copyTo(sCh);
      tmp.delete();
      cv.merge(ch, hsv);
      cv.cvtColor(hsv, m, cv.COLOR_HSV2RGB);
      ch.delete(); hsv.delete();
    }
    return m;
  };

  const updateHasChanges = (newBri, newCon, newSat) => {
    const a = appliedRef.current;
    setHasChanges(newBri !== a.bri || newCon !== a.con || newSat !== a.sat);
  };

  const onChangeBri = (v) => { setBri(v); updateHasChanges(v, con, sat); };
  const onChangeCon = (v) => { setCon(v); updateHasChanges(bri, v, sat); };
  const onChangeSat = (v) => { setSat(v); updateHasChanges(bri, con, v); };

  // ПРИМЕНИТЬ
  const apply = () => {
    const m = mats.current;
    if (!m.cur) { showToast('Сначала загрузите изображение'); return; }
    if (!hasChanges) { showToast('Значения не изменились'); return; }

    // База — сохраняется один раз, до первого применения
    if (!m.base) {
      m.base = m.cur.clone();
    }

    const b = bri;
    const c = con / 100;
    const s = sat / 100;

    const satDiffers = Math.abs(s - 1) > 0.001;
    const satBlocked = satDiffers && isGrayscale(m.base);
    if (satBlocked) {
      showToast('Изображение серое — насыщенность пропущена', 2500);
    }
    const effectiveSat = satBlocked ? 1 : s;

    // Снимок для истории и гистограммы
    if (m.before) m.before.delete();
    m.before = m.cur.clone();
    m.history.push(m.cur.clone());
    if (m.history.length > 20) {
      const old = m.history.shift();
      try { old.delete(); } catch (_) {}
    }

    // Пересчитываем от базы с текущими значениями ползунков
    const res = buildAdjusted(m.base, b, c, effectiveSat);
    const oldCur = m.cur;
    m.cur = res;
    try { oldCur.delete(); } catch (_) {}

    // Запоминаем, что именно применили — флаг hasChanges будет
    // сравнивать ползунки с этим состоянием
    appliedRef.current = { bri, con, sat };
    setHasChanges(false);
    setHasApplied(true);

    // refreshDisplay меняет tick — но useEffect выше увидит,
    // что m.base существует, и НЕ тронет ползунки.
    refreshDisplay();
    showToast('Изменения применены');
  };

  // СБРОС — вернуть к базе, ползунки в нейтраль
  const reset = () => {
    const m = mats.current;

    // Сначала сбрасываем m.base — тогда useEffect на следующий tick
    // увидит, что базы нет, но мы и так уже всё сбрасываем сами.
    // А чтобы ползунки не мигнули — устанавливаем их синхронно.
    setBri(DEFAULTS.bri);
    setCon(DEFAULTS.con);
    setSat(DEFAULTS.sat);
    setHasChanges(false);
    setHasApplied(false);
    appliedRef.current = { bri: DEFAULTS.bri, con: DEFAULTS.con, sat: DEFAULTS.sat };

    if (m.base && m.cur) {
      const res = m.base.clone();
      const oldCur = m.cur;
      m.cur = res;
      try { oldCur.delete(); } catch (_) {}
      try { m.base.delete(); } catch (_) {}
      m.base = null;
      if (m.before) { m.before.delete(); m.before = null; }
      refreshDisplay();
      showToast('Сброшено к исходному');
    }
  };

  return (
    <details>
      <summary>Яркость / Насыщенность / Контраст</summary>
      <div className="body">
        <label>Яркость: {bri}</label>
        <input
          type="range" min="-120" max="120" value={bri}
          onChange={(e) => onChangeBri(+e.target.value)}
        />

        <label>Контраст: {(con / 100).toFixed(2)}</label>
        <input
          type="range" min="10" max="300" value={con}
          onChange={(e) => onChangeCon(+e.target.value)}
        />

        <label>Насыщенность: {(sat / 100).toFixed(2)}</label>
        <input
          type="range" min="0" max="300" value={sat}
          onChange={(e) => onChangeSat(+e.target.value)}
        />

        {/* Кнопки друг под другом с отступом */}
        <button
          style={{
            marginTop: 12,
            background: '#333c4e'
          }}
          onClick={apply}
        >
          ✓ Применить
        </button>
        <button
          style={{
            marginTop: 8,
            background: hasApplied ? 'var(--danger)' : '#333c4e'
          }}
          onClick={reset}
        >
          ↺ Сброс
        </button>

        <div className="hint" style={{ marginTop: 10 }}>
          Ползунки остаются на своих значениях после применения.
          <b> Применить</b> пересчитывает изображение, <b>Сброс</b> — возвращает к исходному.
        </div>
      </div>
    </details>
  );
}