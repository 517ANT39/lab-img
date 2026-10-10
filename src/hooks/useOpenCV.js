import { useState, useEffect } from 'react';
import jsfeat from '@webarkit/jsfeat-next';

export function useOpenCV() {
  const [jsfeatReady, setJsfeatReady] = useState(false);

  useEffect(() => {
    if (typeof jsfeat !== 'undefined') {
      setJsfeatReady(true);
      return;
    }
    const check = setInterval(() => {
      if (typeof jsfeat !== 'undefined') {
        clearInterval(check);
        setJsfeatReady(true);
      }
    }, 100);
    return () => clearInterval(check);
  }, []);

  return { jsfeat, jsfeatReady, ready: jsfeatReady };
}