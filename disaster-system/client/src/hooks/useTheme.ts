import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
const KEY = 'disaster-theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = window.localStorage.getItem(KEY) as Theme | null;
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  });

  /**
   * `appliedTheme` only advances once `data-theme` is live on <html>.
   * Charts read their palette through getComputedStyle() while rendering, so
   * handing them `theme` directly would rebuild them against the previous
   * theme's CSS variables. Passing `appliedTheme` forces one extra render
   * after the attribute changes, which is when the new palette is readable.
   */
  const [appliedTheme, setAppliedTheme] = useState<Theme>(theme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(KEY, theme);
    setAppliedTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const set = useCallback((next: Theme) => setTheme(next), []);

  return { theme, appliedTheme, toggle, set };
}
