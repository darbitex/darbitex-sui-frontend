import { Buffer } from "buffer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// Pyth Sui SDK references the global `Buffer`; polyfill it for the browser.
if (typeof globalThis.Buffer === "undefined") {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

const root = document.getElementById("root");
if (!root) throw new Error("root not found");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
