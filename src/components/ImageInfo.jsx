import cv from '@/cv/cvInstance.js';

const DEPTH_BITS = { 0: 8, 1: 8, 2: 16, 3: 16, 4: 32, 5: 32, 6: 64 };
const DEPTH_NAMES = {
  0: 'CV_8U', 1: 'CV_8S', 2: 'CV_16U', 3: 'CV_16S',
  4: 'CV_32S', 5: 'CV_32F', 6: 'CV_64F'
};

function computeDepthInfo(meta, curRGB) {
  const workingBpc = DEPTH_BITS[curRGB.depth()] ?? 8;
  const workingCh  = curRGB.channels();
  const workingTotal = workingBpc * workingCh;
  const workingTypeName = DEPTH_NAMES[curRGB.depth()] ?? 'CV_8U';

  const chLabel = workingCh === 1 ? 'Grayscale'
                : workingCh === 3 ? 'R, G, B'
                : workingCh === 4 ? 'R, G, B, A'
                : `${workingCh} кан.`;

  const sourceBpc = meta.bitsPerChannelSource ?? 8;
  const sourceCh  = meta.channelsSource ?? 3;
  const sourceTotal = sourceBpc * sourceCh;
  const sourceAlphaNote = meta.hasAlpha ? ', с α-каналом' : '';

  return {
    workingTotal,
    workingBpc,
    workingCh,
    workingTypeName,
    workingLabel: `${workingTotal} бит (${workingBpc} бит/канал × ${workingCh}, ${chLabel})`,
    sourceTotal,
    sourceLabel: `${sourceTotal} бит`,
    channelsLabel: `${workingCh} (${chLabel})`,
    bytesPerPixel: (workingTotal / 8).toFixed(2)
  };
}

export default function ImageInfo({ meta, curRGB }) {
  if (!meta || !curRGB) return <div className="hint">Изображение не загружено.</div>;

  const depth = computeDepthInfo(meta, curRGB);

  let mR = '—', mG = '—', mB = '—', brightness = '—', contrast = '—';
  try {
    const mean = new cv.Mat(), stddev = new cv.Mat();
    cv.meanStdDev(curRGB, mean, stddev);
    const m = mean.data64F, s = stddev.data64F;
    mR = m[0].toFixed(1); mG = m[1].toFixed(1); mB = m[2].toFixed(1);
    brightness = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]).toFixed(1);
    contrast = ((s[0] + s[1] + s[2]) / 3).toFixed(1);
    mean.delete(); stddev.delete();
  } catch (e) { console.warn(e); }

  const W = meta.width, H = meta.height;
  const fmtB = (b) =>
    b < 1024 ? b + ' Б'
    : b < 1048576 ? (b / 1024).toFixed(2) + ' КБ'
    : (b / 1048576).toFixed(2) + ' МБ';
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(W, H);

  const rows = [
    ['Имя файла', meta.name],
    ['Формат', (meta.type.split('/')[1] || '?').toUpperCase()],
    ['Размер на диске', fmtB(meta.size)],
    ['Разрешение', `${W} × ${H} px`],
    ['Глубина цвета', depth.sourceLabel],
  ];

  return (
    <div id="info">
      <table>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}><td>{r[0]}</td><td>{r[1]}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}