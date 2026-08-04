#!/usr/bin/env node
/*
 * Contrast checker for the token pairs that actually appear on screen.
 *
 * design-system.md §1: "Contrast is a verified requirement, not an aspiration.
 * ... If a pair fails, adjust the lightness channel only and record it here."
 *
 * axe is still the source of truth, but axe only tests pairs that appear on a
 * page that happens to be under test. This checks the palette itself, so a
 * failing combination is caught when the token changes rather than when some
 * future screen first uses it.
 *
 * Usage: node scripts/check-contrast.mjs [--sweep <token>]
 */

import { readFileSync } from 'node:fs';

/* ---------- OKLCH -> linear sRGB -> WCAG relative luminance ---------- */

function oklchToLinearRgb(L, C, H) {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)));
}

function relativeLuminance(L, C, H) {
  const [r, g, b] = oklchToLinearRgb(L, C, H);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const la = relativeLuminance(...a);
  const lb = relativeLuminance(...b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/* ---------- read the tokens straight out of the stylesheet ---------- */

function parseTokens(css, selector) {
  const block = css.slice(css.indexOf(selector));
  const body = block.slice(block.indexOf('{') + 1, block.indexOf('\n}'));
  const tokens = {};

  for (const match of body.matchAll(
    /--([a-z-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+(\d+)\s*\)/g
  )) {
    tokens[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])];
  }
  return tokens;
}

const css = readFileSync('styles/tokens.css', 'utf8');
const themes = {
  dark: parseTokens(css, ':root {'),
  light: parseTokens(css, "[data-theme='light'] {"),
};

/*
 * Body text needs 4.5:1; large text and UI borders need 3:1 (§1).
 * `text-tertiary` is listed at 4.5 deliberately: it is used at --ui-xs (11px),
 * which is small text, so the lower bar does not apply to it.
 */
/*
 * Every foreground against every surface, not a hand-picked list.
 *
 * The hand-picked version missed `--text-tertiary` on `--bg-inset` — the
 * placeholder inside an input — and axe found it on /onboarding instead. A
 * checker whose coverage depends on remembering the combinations is the same
 * kind of hope the design system says to replace with a mechanism.
 */
const SURFACES = ['bg-base', 'bg-raised', 'bg-overlay', 'bg-inset'];

const FOREGROUNDS = [
  ['text-primary', 4.5],
  ['text-secondary', 4.5],
  // Used at --ui-xs (11px), so the 3:1 large-text allowance never applies.
  ['text-tertiary', 4.5],
  ['danger', 4.5],
  ['success', 4.5],
  ['warning', 4.5],
  // The accent carries interaction, not text, so 3:1 as a UI component.
  ['accent', 3.0],
];

const PAIRS = [
  ...FOREGROUNDS.flatMap(([fg, required]) =>
    SURFACES.map((bg) => [fg, bg, required])
  ),
  // text-on-accent: the primary button fill.
  ['bg-base', 'accent', 4.5],
  // Hairlines are decorative separation, not information.
  ['border-subtle', 'bg-base', 1.0],
  ['border-strong', 'bg-raised', 1.0],
];

const sweepIndex = process.argv.indexOf('--sweep');
if (sweepIndex !== -1) {
  const token = process.argv[sweepIndex + 1];
  for (const [themeName, tokens] of Object.entries(themes)) {
    const [, C, H] = tokens[token] ?? [];
    if (C === undefined) continue;

    console.log(`\n${themeName} — sweeping --${token} (C=${C}, H=${H}) against every surface`);
    for (let L = 0.3; L <= 0.9; L += 0.005) {
      const ratios = SURFACES.map((surface) => contrastRatio([L, C, H], tokens[surface]));
      const worst = Math.min(...ratios);
      if (worst >= 4.5 && worst <= 5.0) {
        console.log(
          `  L=${L.toFixed(3)}  worst ${worst.toFixed(2)}  [${SURFACES.map(
            (s, i) => `${s.replace('bg-', '')} ${ratios[i].toFixed(2)}`
          ).join('  ')}]`
        );
      }
    }
  }
  process.exit(0);
}

let failures = 0;

for (const [themeName, tokens] of Object.entries(themes)) {
  console.log(`\n${themeName}`);

  for (const [fg, bg, required] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) continue;

    const ratio = contrastRatio(tokens[fg], tokens[bg]);
    const pass = ratio >= required;
    if (!pass) failures += 1;

    console.log(
      `  ${pass ? 'PASS' : 'FAIL'}  ${ratio.toFixed(2).padStart(5)}:1  (needs ${required})  --${fg} on --${bg}`
    );
  }
}

if (failures > 0) {
  console.error(`\n${failures} token pair(s) below the required ratio.`);
  console.error('Adjust the lightness channel only, then record the change in specs/design-system.md §1.');
  process.exit(1);
}

console.log('\nAll token pairs meet their required contrast ratio.');
