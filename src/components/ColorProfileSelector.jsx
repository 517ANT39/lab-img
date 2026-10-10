import { COLOR_PROFILES } from '../color/profiles.js';

export default function ColorProfileSelector({ profile, onChange }) {
  const P = COLOR_PROFILES[profile];
  return (
    <>
      <label>Цветовой профиль</label>
      <select className="profile-select" value={profile} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(COLOR_PROFILES).map(([key, p]) => (
          <option key={key} value={key}>{p.name}</option>
        ))}
      </select>
      <div className="profile-info">
        <b>Гамма:</b> {P.gamma.toFixed(2)} ({P.gammaType === 'srgb' ? 'sRGB-кривая' : 'степенная'}) ·{' '}
        <b>Белая точка:</b> {P.white}<br />
        <b>YCbCr:</b> {P.ycbcrStd} — коэффициенты [{P.ycbcr.map((x) => x.toFixed(4)).join(', ')}]
      </div>
    </>
  );
}