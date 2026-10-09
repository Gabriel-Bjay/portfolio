"use client";

import { useEffect } from "react";

/** Inside the widget's iframe, Escape never reaches the host page, so ask it to close. */
export function EmbedBridge() {
  useEffect(() => {
    if (window.parent === window) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.parent.postMessage({ type: "jibu:close" }, "*");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}
