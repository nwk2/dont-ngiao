// Generates src/themes.css from themes.json. Same model as Haven:
// <html data-theme="kopitiam|market|tomato|night" data-mode="system|light|dark">.
// Every theme gets full light and dark variable sets; data-mode="system"
// picks one with prefers-color-scheme. Selectors aren't :root-only, so any
// element can wear a theme (the swatches in You > Appearance do).
import { readFileSync, writeFileSync } from 'node:fs';

const t = JSON.parse(readFileSync(new URL('../themes.json', import.meta.url)));
const stack = (f) => (f === 'system-ui' ? 'system-ui, -apple-system, "Segoe UI", sans-serif' : `"${f}", system-ui, -apple-system, "Segoe UI", sans-serif`);
const block = (vars, indent = '  ') => Object.entries(vars).map(([k, v]) => `${indent}--${k}: ${v};`).join('\n');
const shapeVars = (s) => ({
  'radius-card': s['radius-card'], 'radius-control': s['radius-control'], 'radius-pill': s['radius-pill'],
  'border-w': s['border-w'], 'outline-w': s['outline-w'],
  display: stack(s['font-heading']), 'font-body': stack(s['font-body']),
  'heading-weight': s['heading-weight'], 'heading-tracking': s['heading-tracking'],
  'row-height': s['row-height'] || '56px', 'min-target': '44px',
});

const base = t.themes[t.base.theme];
let css = `/* Generated from themes.json by scripts/generate-themes.mjs. Do not edit. */\n`;
// Fallback before any attribute is set: base theme, dark.
css += `:root {\n${block(shapeVars(base.shape))}\n${block(base.dark)}\n  color-scheme: dark;\n}\n`;
for (const [id, theme] of Object.entries(t.themes)) {
  css += `\n[data-theme="${id}"] {\n${block(shapeVars(theme.shape))}\n}\n`;
  for (const mode of ['light', 'dark']) {
    const colors = `${block(theme[mode])}\n  color-scheme: ${mode};`;
    css += `[data-theme="${id}"][data-mode="${mode}"] {\n${colors}\n}\n`;
    css += `@media (prefers-color-scheme: ${mode}) {\n  [data-theme="${id}"][data-mode="system"] {\n${colors.replace(/^/gm, '  ')}\n  }\n}\n`;
  }
}
writeFileSync(new URL('../src/themes.css', import.meta.url), css);
console.log(`themes.css: ${Object.keys(t.themes).length} themes x 3 modes, ${css.length} bytes`);
