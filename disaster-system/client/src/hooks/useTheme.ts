import { useCallback, useEffect, useState } from 'react';

export type ThemeName = 'midnight' | 'daylight' | 'contrast' | 'emergency';

export const THEMES: { id: ThemeName; label: string; mode: 'dark' | 'light' }[] = [
  { id: 'midnight', label: '🌙 Midnight', mode: 'dark' },
  { id: 'daylight', label: '☀️ Daylight', mode: 'light' },
  { id: 'contrast', label: '◐ High Contrast', mode: 'dark' },
  { id: 'emergency', label: '🚨 Emergency Ops', mode: 'dark' },
];

const KEY = 'disaster-theme';
const DEFAULT_THEME: ThemeName = 'midnight';

function isTheme(value: unknown): value is ThemeName {
  return THEMES.some((t) => t.id === value);
}

/** Older builds stored plain "dark"/"light" — carry those choices forward. */
function migrate(stored: string | null): ThemeName {
  if (isTheme(stored)) return stored;
  if (stored === 'light') return 'daylight';
  if (stored === 'dark') return 'midnight';
  return DEFAULT_THEME;
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeName>(() => {
    if (typeof window === 'undefined') return DEFAULT_THEME;
    return migrate(window.localStorage.getItem(KEY));
  });

  /**
   * `appliedTheme` only advances once the attributes are live on <html>.
   * Charts read their palette through getComputedStyle() while rendering, so
   * handing them `theme` directly would rebuild them against the previous
   * theme's CSS variables. Passing `appliedTheme` forces one extra render
   * after the attributes change, which is when the new palette is readable.
   */
  const [appliedTheme, setAppliedTheme] = useState<ThemeName>(theme);

  useEffect(() => {
    const mode = THEMES.find((t) => t.id === theme)?.mode ?? 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mode', mode);
    window.localStorage.setItem(KEY, theme);
    setAppliedTheme(theme);
  }, [theme]);

  const set = useCallback((next: ThemeName) => setTheme(next), []);
  /** Cycles to the next theme — used by the compact toolbar control. */
  const cycle = useCallback(
    () => setTheme((t) => THEMES[(THEMES.findIndex((x) => x.id === t) + 1) % THEMES.length].id),
    [],
  );

  return { theme, appliedTheme, set, cycle, current: THEMES.find((t) => t.id === theme) };
}
