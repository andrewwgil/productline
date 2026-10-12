if (!window.__arcadeRegion) {
  window.__arcadeRegion = true;
  const root = document.createElement("div");
  root.setAttribute("data-arcade-region", "");
  const shade = "rgba(20,23,22,.45)";
  root.style.cssText = "position:fixed;inset:0;z-index:2147483646;cursor:crosshair;";
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;border:1.5px solid #fdfcfb;background:rgba(253,252,251,.08);display:none;";
  const label = document.createElement("div");
  label.textContent = "Drag a region. Esc to cancel.";
  label.style.cssText = "position:fixed;left:16px;top:16px;padding:8px 12px;border-radius:999px;background:#141716;color:#fdfcfb;font:500 13px/1.2 Georgia,serif;";
  root.append(box, label);
  document.documentElement.append(root);

  let start = null;
  const point = (event) => ({ x: event.clientX, y: event.clientY });
  const onDown = (event) => {
    if (event.button !== 0) return;
    start = point(event);
    box.style.display = "block";
    move(event);
    event.preventDefault();
  };
  const move = (event) => {
    if (!start) return;
    const now = point(event);
    const left = Math.min(start.x, now.x);
    const top = Math.min(start.y, now.y);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${Math.abs(now.x - start.x)}px`;
    box.style.height = `${Math.abs(now.y - start.y)}px`;
  };
  const finish = (event) => {
    if (!start) return;
    const now = point(event);
    const left = Math.min(start.x, now.x);
    const top = Math.min(start.y, now.y);
    const width = Math.abs(now.x - start.x);
    const height = Math.abs(now.y - start.y);
    cleanup();
    if (width < 24 || height < 24) return;
    const dpr = window.devicePixelRatio || 1;
    chrome.runtime.sendMessage({
      type: "region-selected",
      rect: { x: left * dpr, y: top * dpr, w: width * dpr, h: height * dpr },
    });
  };
  const onKey = (event) => { if (event.key === "Escape") cleanup(); };
  function cleanup() {
    root.remove();
    window.removeEventListener("mousemove", move, true);
    window.removeEventListener("mouseup", finish, true);
    window.removeEventListener("keydown", onKey, true);
    delete window.__arcadeRegion;
  }
  root.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", move, true);
  window.addEventListener("mouseup", finish, true);
  window.addEventListener("keydown", onKey, true);
}
