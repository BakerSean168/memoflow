export interface VisualCase {
  id: string;
  surface: string;
  owner: string;
  query: string;
  ready: string;
  theme: 'light' | 'dark';
  locale: 'en-US' | 'zh-CN';
  width: 'wide' | 'narrow';
}
export const requiredSurfaces: string[];
export const matrix: VisualCase[];
export function validateMatrix(entries: VisualCase[]): void;
export const desktopRunner: { target: string; config: string; acceptance: boolean; reason: string };
