// Shim : réexporte le React GLOBAL (chargé en UMD dans index.html) comme module
// ESM, pour que les libs npm (Framer Motion...) utilisent LA MÊME instance —
// jamais une copie séparée (sinon : "Invalid hook call" / contextes cassés).
const R = window.React;
export default R;
export const {
  useState, useEffect, useRef, useCallback, useMemo, useContext, useReducer,
  useLayoutEffect, useImperativeHandle, useDebugValue, useId, useSyncExternalStore,
  useInsertionEffect, useTransition, useDeferredValue,
  createElement, cloneElement, isValidElement, createContext, createRef,
  forwardRef, memo, Fragment, Component, PureComponent, Children, StrictMode, version,
} = R;
