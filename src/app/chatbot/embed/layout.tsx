import type { ReactNode } from "react";

// The embed lives inside the widget's iframe, so it must not show the site header that the
// root layout adds. The root layout is shared, so hide the header from here instead: the rule
// applies only while an element marked data-jibu-embed is on the page.
export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{"body:has([data-jibu-embed]) > header { display: none; }"}</style>
      {children}
    </>
  );
}
