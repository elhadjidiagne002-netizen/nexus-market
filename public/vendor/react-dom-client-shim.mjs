// "react-dom/client" (API React 18) — le build UMD expose déjà createRoot sur
// window.ReactDOM depuis react-dom 18 ; ce shim ne fait que le réexposer en ESM.
const R = window.ReactDOM;
export const createRoot = R.createRoot;
export const hydrateRoot = R.hydrateRoot;
