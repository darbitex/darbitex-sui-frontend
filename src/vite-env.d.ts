/// <reference types="vite/client" />

// Vite ?url suffix resolves at bundle time to a string URL pointing at
// the asset. Used in chain/factory.ts to load the bytecode-template WASM.
declare module "*?url" {
  const url: string;
  export default url;
}
