/*
 * Stub for `katex/dist/katex.min.css`.
 *
 * math-editor-field.tsx imports ./katex-client for its CSS side effect, which
 * is correct in the app (phase-03b defect G1 was KaTeX styles reaching a route
 * only transitively). Under vitest that import is handed to Vite's CSS
 * pipeline, which loads the project's PostCSS config and fails on the Tailwind
 * v4 plugin. jsdom does not compute the styles anyway, so the component tests
 * alias the stylesheet to this empty module.
 */
const emptyStylesheet = '';
export default emptyStylesheet;
