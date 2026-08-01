// Shim de "react/jsx-runtime" — requis par les libs compilées avec le JSX
// automatique (esbuild/Rollup), construit à partir du React global (même logique
// que react-shim.mjs : createElement gère key/children comme jsx/jsxs).
const R = window.React;
export const Fragment = R.Fragment;
export function jsx(type, props, key) {
  const { children, ...rest } = props || {};
  if (key !== undefined) rest.key = key;
  return R.createElement(type, rest, children);
}
export const jsxs = jsx;
