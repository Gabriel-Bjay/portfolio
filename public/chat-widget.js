/* Jibu chat widget: one script tag, no dependencies, no globals.
   <script src="https://HOST/chat-widget.js" data-title="Twiga Brew" data-color="#0f766e" async></script> */
(function () {
  var d = document;
  var me = d.currentScript || d.querySelector('script[src*="chat-widget.js"]');
  if (!me || d.querySelector("[data-jibu-widget]")) return;

  var title = (me.getAttribute("data-title") || "Chat").slice(0, 40);
  var color = me.getAttribute("data-color") || "";
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) color = "#0f766e";
  var origin = new URL(me.src, location.href).origin;

  // Icon colour: white or near-black, whichever contrasts more.
  var n = parseInt(color.slice(1).replace(/^(.)(.)(.)$/, "$1$1$2$2$3$3"), 16), lum = 0;
  [16, 8, 0].forEach(function (shift, i) {
    var v = ((n >> shift) & 255) / 255;
    lum += [0.2126, 0.7152, 0.0722][i] * (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  });
  var fg = lum > 0.179 ? "#111" : "#fff";

  var host = d.createElement("div");
  host.setAttribute("data-jibu-widget", "");
  var root = host.attachShadow({ mode: "open" }); // keeps the page's CSS out of the widget
  var css = d.createElement("style");
  css.textContent =
    ":host{position:fixed;right:16px;bottom:16px;z-index:2147483000;font:16px system-ui,sans-serif}" +
    "button{width:56px;height:56px;padding:0;border:0;border-radius:50%;cursor:pointer;color:" + fg +
    ";background:" + color + ";box-shadow:0 4px 14px rgba(0,0,0,.35)}" +
    "button:focus-visible{outline:3px solid " + fg + ";outline-offset:-6px}" +
    "svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
    "[aria-expanded=true] .c,[aria-expanded=false] .x{display:none}" +
    ".p{position:absolute;right:0;bottom:72px;width:min(380px,calc(100vw - 32px));" +
    "height:min(600px,calc(100vh - 104px));height:min(600px,calc(100dvh - 104px));" +
    "border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 8px 32px rgba(0,0,0,.35)}" +
    ".p[hidden]{display:none}iframe{display:block;width:100%;height:100%;border:0}";

  var panel = d.createElement("div");
  panel.className = "p";
  panel.id = "p";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title + " chat");

  var btn = d.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Chat with " + title);
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute("aria-controls", "p");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML =
    '<svg class="c" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>' +
    '<svg class="x" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  var frame, open = false;

  function toggle(next) {
    if (next === open) return;
    open = next;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    if (!open) return btn.focus(); // hand focus back to the launcher
    if (!frame) {
      frame = d.createElement("iframe");
      frame.title = title + " chat";
      frame.src = origin + "/chatbot/embed?title=" + encodeURIComponent(title) + "&color=" + color.slice(1);
      panel.appendChild(frame);
    }
    frame.focus();
  }

  btn.addEventListener("click", function () { toggle(!open); });
  d.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) toggle(false); });
  // Escape inside the iframe never reaches this page, so the iframe asks us to close.
  addEventListener("message", function (e) {
    if (frame && e.source === frame.contentWindow && e.origin === origin && e.data && e.data.type === "jibu:close") toggle(false);
  });

  root.append(css, panel, btn);
  (d.body || d.documentElement).appendChild(host); // before <body> exists, <html> works too
})();
