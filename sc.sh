# Найти все файлы с прямым импортом
grep -rl "@techstark/opencv-js" src/

# Заменить импорт во всех файлах
grep -rl "@techstark/opencv-js" src/ | while read f; do
  sed -i "s|import cv from '@techstark/opencv-js';|import cv from '@/cv/cvInstance.js';|g" "$f"
  sed -i "s|import cv from \"@techstark/opencv-js\";|import cv from '@/cv/cvInstance.js';|g" "$f"
done

# Проверить, что замен не осталось
grep -r "@techstark/opencv-js" src/
