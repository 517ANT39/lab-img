import { useState, useMemo, useEffect } from 'react';
import { COLOR_PROFILES } from '../color/profiles.js';
import {
  rgb2cmyk, cmyk2rgb, rgb2hsl, hsl2rgb,
  rgb2lab, lab2rgb, rgb2hsv, hsv2rgb,
  rgb2ycbcr, ycbcr2rgb
} from '../color/conversions.js';

const MODEL_DEFS = [
  {
    key: 'rgb', label: 'RGB', color: '#ff5c5c',
    fields: [
      { name: 'R', min: 0, max: 255, step: 1, dec: 0 },
      { name: 'G', min: 0, max: 255, step: 1, dec: 0 },
      { name: 'B', min: 0, max: 255, step: 1, dec: 0 }
    ]
  },
  {
    key: 'cmyk', label: 'CMYK', color: '#22c55e',
    fields: [
      { name: 'C', min: 0, max: 100, step: 0.1, dec: 1, unit: '%' },
      { name: 'M', min: 0, max: 100, step: 0.1, dec: 1, unit: '%' },
      { name: 'Y', min: 0, max: 100, step: 0.1, dec: 1, unit: '%' },
      { name: 'K', min: 0, max: 100, step: 0.1, dec: 1, unit: '%' }
    ]
  },
  {
    key: 'hsl', label: 'HSL', color: '#4f9cf9',
    fields: [
      { name: 'H', min: 0, max: 360, step: 1, dec: 0, unit: '°' },
      { name: 'S', min: 0, max: 100, step: 0.1, dec: 1, unit: '%' },
      { name: 'L', min: 0, max: 100, step: 0.1, dec: 1, unit: '%' }
    ]
  },
  {
    key: 'lab', label: 'LAB', color: '#f59e0b',
    fields: [
      { name: 'L', min: 0, max: 100, step: 0.01, dec: 2 },
      { name: 'a', min: -128, max: 127, step: 0.01, dec: 2 },
      { name: 'b', min: -128, max: 127, step: 0.01, dec: 2 }
    ]
  },
  {
    key: 'hsv', label: 'HSV', color: '#a855f7',
    fields: [
      { name: 'H', min: 0, max: 360, step: 1, dec: 0, unit: '°' },
      { name: 'S', min: 0, max: 100, step: 0.1, dec: 1, unit: '%' },
      { name: 'V', min: 0, max: 100, step: 0.1, dec: 1, unit: '%' }
    ]
  },
  {
    key: 'ycbcr', label: 'YCbCr', color: '#06b6d4',
    fields: [
      { name: 'Y',  min: 0, max: 255, step: 0.1, dec: 1 },
      { name: 'Cb', min: 0, max: 255, step: 0.1, dec: 1 },
      { name: 'Cr', min: 0, max: 255, step: 0.1, dec: 1 }
    ]
  }
];

const MODEL_VALUES = {
  rgb:   (p) => [p.r, p.g, p.b],
  cmyk:  (p) => rgb2cmyk(p.r, p.g, p.b),
  hsl:   (p) => rgb2hsl(p.r, p.g, p.b),
  lab:   (p, prof) => rgb2lab(p.r, p.g, p.b, prof),
  hsv:   (p) => rgb2hsv(p.r, p.g, p.b),
  ycbcr: (p, prof) => rgb2ycbcr(p.r, p.g, p.b, prof)
};

const MODEL_TO_RGB = {
  rgb:   (v) => v,
  cmyk:  (v) => cmyk2rgb(v[0], v[1], v[2], v[3]),
  hsl:   (v) => hsl2rgb(v[0], v[1], v[2]),
  lab:   (v, prof) => lab2rgb(v[0], v[1], v[2], prof),
  hsv:   (v) => hsv2rgb(v[0], v[1], v[2]),
  ycbcr: (v, prof) => ycbcr2rgb(v[0], v[1], v[2], prof)
};

function fmt(v, dec) {
  if (!isFinite(v)) return '0';
  let s = Number(v).toFixed(dec);
  if (s.includes('.')) {
    s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '' || s === '-') s = '0';
  }
  return s;
}

function ChannelRow({ def, value, onChange }) {
  const [local, setLocal] = useState(() => fmt(value, def.dec));
  const [focused, setFocused] = useState(false);

  // Вне фокуса — синхронизируем с внешним значением
  useEffect(() => {
    if (!focused) setLocal(fmt(value, def.dec));
  }, [value, def.dec, focused]);

  const commit = (raw) => {
    const v = parseFloat(String(raw).replace(',', '.'));
    if (isNaN(v)) {
      setLocal(fmt(value, def.dec));
      return;
    }
    const clamped = Math.max(def.min, Math.min(def.max, v));
    setLocal(fmt(clamped, def.dec));
    onChange(clamped);
  };

  return (
    <div className="cm-row">
      <span className="cm-name" title={`${def.name} (${def.min}…${def.max})`}>
        {def.name}
      </span>
      <input
        type="range"
        className="cm-slider"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        title={`${def.min}…${def.max}`}
      />
      <input
        type="number"
        className="cm-input"
        min={def.min}
        max={def.max}
        step={def.step}
        value={local}
        onFocus={() => setFocused(true)}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={(e) => { setFocused(false); commit(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { setLocal(fmt(value, def.dec)); e.currentTarget.blur(); }
        }}
      />
      <span className="cm-unit">{def.unit || ''}</span>
    </div>
  );
}

export default function ColorModelPanel({ profile, pixel, onPixelChange }) {
  const [visible, setVisible] = useState({
    rgb: true, cmyk: false, hsl: true, lab: true, hsv: false, ycbcr: true
  });

  const values = useMemo(() => {
    const out = {};
    for (const m of MODEL_DEFS) out[m.key] = MODEL_VALUES[m.key](pixel, profile);
    return out;
  }, [pixel, profile]);

  const hex = useMemo(() => {
    const r = Math.round(pixel.r), g = Math.round(pixel.g), b = Math.round(pixel.b);
    return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  }, [pixel]);

  const handleChannelChange = (modelKey, idx, newVal) => {
    const arr = [...values[modelKey]];
    arr[idx] = newVal;
    const rgb = MODEL_TO_RGB[modelKey](arr, profile);
    onPixelChange({
      r: Math.max(0, Math.min(255, rgb[0])),
      g: Math.max(0, Math.min(255, rgb[1])),
      b: Math.max(0, Math.min(255, rgb[2]))
    });
  };

  return (
    <>
      <div className="model-toggles">
        {MODEL_DEFS.map((m) => (
          <label
            key={m.key}
            className={visible[m.key] ? 'on' : ''}
            style={visible[m.key] ? { borderColor: m.color, color: m.color } : {}}
          >
            <input
              type="checkbox"
              checked={visible[m.key]}
              onChange={(e) => setVisible((v) => ({ ...v, [m.key]: e.target.checked }))}
            />
            {m.label}
          </label>
        ))}
      </div>

      <div className="cm-picker">
        <input
          type="color"
          value={hex}
          onChange={(e) => {
            const h = e.target.value;
            onPixelChange({
              r: parseInt(h.substr(1, 2), 16),
              g: parseInt(h.substr(3, 2), 16),
              b: parseInt(h.substr(5, 2), 16)
            });
          }}
          className="swatch"
        />
        <input
          type="text"
          className="cm-hex"
          value={hex.toUpperCase()}
          onChange={(e) => {
            const v = e.target.value.trim().replace('#', '');
            if (/^[0-9a-fA-F]{6}$/.test(v)) {
              onPixelChange({
                r: parseInt(v.substr(0, 2), 16),
                g: parseInt(v.substr(2, 2), 16),
                b: parseInt(v.substr(4, 2), 16)
              });
            }
          }}
        />
      </div>

      {MODEL_DEFS.map((model) => {
        if (!visible[model.key]) return null;
        const arr = values[model.key];
        const achromatic = (model.key === 'hsl' || model.key === 'hsv') && arr[1] < 1.5;

        return (
          <div className="cm-card" key={model.key}>
            <div className="cm-card-header" style={{ borderLeftColor: model.color }}>
              <span style={{ color: model.color }}>{model.label}</span>
              {achromatic && (
                <span className="cm-warn" title="S ≈ 0 — оттенок не влияет на цвет">
                  ⚠ серый: H не влияет
                </span>
              )}
            </div>
            {model.fields.map((def, i) => (
              <ChannelRow
                key={def.name}
                def={def}
                value={arr[i] ?? 0}
                onChange={(v) => handleChannelChange(model.key, i, v)}
              />
            ))}
          </div>
        );
      })}

      {/* <div className="hint">
        Слайдер — мгновенно, поле ввода — по <b>Enter</b> или при потере фокуса.{' '}
        <b>Esc</b> отменяет набор. LAB и YCbCr пересчитаны для профиля{' '}
        <b>{COLOR_PROFILES[profile].name}</b>.
      </div> */}
    </>
  );
}