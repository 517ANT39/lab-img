// src/cv/cvInstance.js
import * as cvModule from '@techstark/opencv-js';

// Извлекаем сам модуль — в зависимости от версии он может быть
// либо default-экспортом, либо namespace-объектом
let cvRaw = cvModule.default || cvModule;

// Если это Promise — ждём разрешения через top-level await
let cv = (cvRaw instanceof Promise) ? await cvRaw : cvRaw;

// Если cv уже готов — проверяем наличие Mat
if (!cv.Mat) {
  // Иначе ждём onRuntimeInitialized (WASM-инициализация)
  await new Promise((resolve) => {
    if (typeof cv.onRuntimeInitialized === 'function') {
      const orig = cv.onRuntimeInitialized;
      cv.onRuntimeInitialized = () => {
        try { orig(); } catch (_) {}
        resolve();
      };
    } else {
      cv.onRuntimeInitialized = resolve;
    }
  });
}

// Финальная проверка — если Mat всё ещё нет, это ошибка конфигурации
if (!cv.Mat) {
  throw new Error('OpenCV.js не инициализирован: cv.Mat не найден');
}

export default cv;