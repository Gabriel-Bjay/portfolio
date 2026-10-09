"use client";

import { useEffect } from "react";

/**
 * Loads the real embeddable widget on the demo page, exactly as a customer's site would, and
 * removes it again when leaving the page so it does not follow visitors to other routes.
 */
export function WidgetLoader() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "/chat-widget.js";
    script.async = true;
    script.setAttribute("data-title", "Twiga Brew");
    script.setAttribute("data-color", "#0f766e");
    document.body.appendChild(script);
    return () => {
      script.remove();
      document.querySelector("[data-jibu-widget]")?.remove();
    };
  }, []);
  return null;
}
