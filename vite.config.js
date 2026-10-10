// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    // Плагин для полифилов Node.js-модулей
    nodePolyfills({
      // Исключаем fs, path и crypto — OpenCV.js проверяет ENVIRONMENT_IS_NODE
      // и не должен пытаться их использовать в браузере
      exclude: ['fs', 'path', 'crypto'],
      globals: {
        // OpenCV.js ожидает глобальную переменную process в некоторых местах
        process: true,
        // Глобальная переменная для совместимости
        global: true,
        Buffer: true
      },
      protocolImports: true
    }),
    // Поддержка WebAssembly (WASM) — необходима для OpenCV.js
    wasm(),
    // Поддержка top-level await — используется при инициализации OpenCV.js
    topLevelAwait()
  ],
  define: {
    // OpenCV.js ожидает глобальную переменную Module
    Module: {}
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
      // ❌ НЕ добавляем fs, path, crypto сюда — это вызывает ошибку
    }
  },
  optimizeDeps: {
    // Включаем OpenCV.js в предварительную сборку
    include: ['@techstark/opencv-js'],
    esbuildOptions: {
      // OpenCV.js использует top-level await, нужен esnext
      target: 'esnext'
    }
  },
  build: {
    // Указываем target, поддерживающий top-level await
    target: 'esnext',
    // Явно указываем, что @techstark/opencv-js должен обрабатываться
    // встроенным @rollup/plugin-commonjs
    commonjsOptions: {
      transformMixedEsModules: true,
      include: [/node_modules/, /@techstark\/opencv-js/]
    }
  }
});