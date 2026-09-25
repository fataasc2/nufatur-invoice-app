import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

function preventBrowserZoom(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (["+", "=", "-", "_", "0"].includes(event.key)) event.preventDefault();
}

function preventPinchZoom(event: TouchEvent): void {
  if (event.touches.length > 1) event.preventDefault();
}

function preventWheelZoom(event: WheelEvent): void {
  if (event.ctrlKey || event.metaKey) event.preventDefault();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => registration.update());
  });
}

window.addEventListener("keydown", preventBrowserZoom, { capture: true });
window.addEventListener("touchmove", preventPinchZoom, { capture: true, passive: false });
window.addEventListener("wheel", preventWheelZoom, { capture: true, passive: false });