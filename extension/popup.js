const CHIPS = [
  { label: "Pillow", prompt: "What would this look like as a pillow?", match: /pillow/i },
  { label: "Scarf", prompt: "What would this look like as a silk scarf?", match: /scarf/i },
  { label: "Napkins", prompt: "What would this look like as dinner napkins?", match: /napkin/i },
  { label: "Placemat", prompt: "What would this look like as a placemat?", match: /placemat|place mat|table linen/i },
];

const BEATS = [
  { step: "uploading", label: "Reference" },
  { step: "designing", label: "Design" },
  { step: "building", label: "Product" },
];

const COPY = {
  uploading: "Saving your photo as a style reference.",
  designing: "Designing an original, inspired by your share.",
  building: "Building a real product and reading its price.",
  ready: "It’s in your Arcade account.",
  failed: "Something stopped the make.",
};

const DEFAULT_BACKEND = "https://productline.vercel.app";
const hasChrome = typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
const $ = (id) => document.getElementById(id);

let file = null;
let categories = [];
let share = null;
let startedAt = 0;
let timer = 0;

const chips = $("chips");
CHIPS.forEach((chip) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = chip.label;
  button.addEventListener("click", () => {
    $("prompt").value = chip.prompt;
    const match = categories.find((item) => chip.match.test(item.name));
    if (match) $("category").value = match.categoryId;
    paintChips();
  });
  chips.append(button);
});
$("prompt").addEventListener("input", paintChips);
paintChips();

function paintChips() {
  const value = $("prompt").value;
  [...chips.children].forEach((button, index) => {
    button.setAttribute("aria-pressed", value === CHIPS[index].prompt ? "true" : "false");
  });
}

function backend() {
  return ($("backend").value || DEFAULT_BACKEND).replace(/\/$/, "");
}

function headers() {
  const token = $("token").value.trim();
  return token ? { "X-Share-Token": token } : {};
}

function saveSettings() {
  const settings = { backend: backend(), token: $("token").value.trim() };
  if (hasChrome) chrome.storage.local.set(settings);
}

$("backend").addEventListener("change", () => { saveSettings(); loadCategories(); });
$("token").addEventListener("change", () => { saveSettings(); loadCategories(); });

async function loadSettings() {
  if (!hasChrome) {
    $("backend").value = location.origin.includes("localhost") ? location.origin : DEFAULT_BACKEND;
    return;
  }
  const saved = await chrome.storage.local.get({ backend: DEFAULT_BACKEND, token: "" });
  $("backend").value = saved.backend || DEFAULT_BACKEND;
  $("token").value = saved.token || "";
}

async function loadCategories() {
  try {
    const res = await fetch(`${backend()}/api/categories`, { headers: headers() });
    const data = await res.json();
    categories = (data.categories || []).filter((item) => item.world === "print");
  } catch {
    categories = [];
  }
  const select = $("category");
  const current = select.value;
  select.replaceChildren(new Option("Match my prompt", ""));
  categories.forEach((item) => select.append(new Option(item.name, item.categoryId)));
  select.value = [...select.options].some((option) => option.value === current) ? current : "";
}

function showImage(blob) {
  file = blob instanceof File ? blob : new File([blob], "share.jpg", { type: blob.type || "image/jpeg" });
  $("preview").src = URL.createObjectURL(file);
  $("preview").hidden = false;
  $("empty").hidden = true;
  $("drop").classList.add("has-image");
  $("result").hidden = true;
  $("progress").hidden = true;
  $("make").hidden = false;
  share = null;
}

async function shrink(blob) {
  const bitmap = await createImageBitmap(blob);
  const edge = 1600;
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height, 1));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let quality = 0.86;
  let next = await toBlob(canvas, quality);
  while (next.size > 3_200_000 && quality > 0.45) {
    quality -= 0.08;
    next = await toBlob(canvas, quality);
  }
  return next;
}

function toBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode that image"))), "image/jpeg", quality);
  });
}

async function useBlob(blob) {
  try { showImage(await shrink(blob)); }
  catch { showImage(blob); }
}

const drop = $("drop");
drop.addEventListener("dragover", (event) => { event.preventDefault(); });
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  const image = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
  if (image) void useBlob(image);
});
drop.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = () => { if (input.files?.[0]) void useBlob(input.files[0]); };
  input.click();
});
window.addEventListener("paste", (event) => {
  const item = [...(event.clipboardData?.items || [])].find((entry) => entry.type.startsWith("image/"));
  const pasted = item?.getAsFile();
  if (pasted) { event.preventDefault(); void useBlob(pasted); }
});

$("capture").addEventListener("click", async () => {
  if (!hasChrome) return fail("Open this from the extension to capture a tab.");
  const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
  if (!dataUrl) return fail("Could not capture this tab.");
  await useBlob(await (await fetch(dataUrl)).blob());
});

$("region").addEventListener("click", async () => {
  if (!hasChrome) return fail("Open this from the extension to drag a region.");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return fail("No tab to draw on.");
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-select.js"] });
  window.close();
});

$("make").addEventListener("click", async () => {
  if (!file) return fail("Add a photo first.");
  $("error").hidden = true;
  $("make").disabled = true;
  try {
    const body = new FormData();
    body.set("image", file, file.name || "share.jpg");
    body.set("prompt", $("prompt").value.trim() || "What would this look like as a pillow?");
    if ($("category").value) body.set("categoryId", $("category").value);
    const res = await fetch(`${backend()}/api/share`, { method: "POST", headers: headers(), body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not start that share.");
    startedAt = Date.parse(data.createdAt) || Date.now();
    showShare(data);
    poll(data.shareId);
  } catch (err) {
    fail(err instanceof Error ? err.message : "Could not start that share.");
  } finally {
    $("make").disabled = false;
  }
});

function poll(id) {
  window.clearTimeout(timer);
  timer = window.setTimeout(async () => {
    try {
      const res = await fetch(`${backend()}/api/share/${id}`, { headers: headers(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That share is gone.");
      showShare(data);
      if (data.step === "uploading" || data.step === "designing" || data.step === "building") poll(id);
    } catch (err) {
      fail(err instanceof Error ? err.message : "Lost the share.");
    }
  }, 2000);
}

function showShare(data) {
  share = data;
  const working = data.step === "uploading" || data.step === "designing" || data.step === "building";
  $("progress").hidden = !working && data.step !== "failed";
  $("make").hidden = working || data.step === "ready";
  if (working || data.step === "failed") {
    const index = BEATS.findIndex((beat) => beat.step === data.step);
    $("beats").replaceChildren(...BEATS.map((beat, i) => {
      const item = document.createElement("li");
      item.className = i < index ? "done" : beat.step === data.step ? "on" : "";
      item.innerHTML = "<i></i>" + beat.label;
      return item;
    }));
    $("status").textContent = data.step === "failed" ? (data.error || COPY.failed) : COPY[data.step];
    const seconds = Math.max(0, Math.floor((Date.now() - (Date.parse(data.createdAt) || startedAt)) / 1000));
    $("clock").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    $("warning").hidden = !data.warning;
    $("warning").textContent = data.warning || "";
  }
  if (data.step === "ready") {
    $("progress").hidden = true;
    $("result").hidden = false;
    $("kicker").textContent = data.categoryName || "Product";
    $("title").textContent = data.title || data.categoryName || "Your product";
    $("price").textContent = price(data.price);
    $("product").src = data.imageUrl || "";
    $("product").alt = data.title || "The Arcade product";
    $("open").href = data.arcadeUrl || "https://studio.arcade.ai";
  }
}

function price(value) {
  if (!value) return "";
  const amount = Number(value.amount);
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: value.currency || "USD",
    maximumFractionDigits: amount % 1 ? 2 : 0,
  }).format(amount);
}

function fail(message) {
  $("error").hidden = false;
  $("error").textContent = message;
}

async function takePending() {
  if (!hasChrome) return;
  const { pending } = await chrome.storage.session.get("pending");
  if (!pending || Date.now() - pending.at > 2 * 60_000) return;
  await chrome.storage.session.remove("pending");
  if (pending.kind === "error") return fail(pending.message);
  if (pending.kind === "url") {
    const res = await fetch(pending.url);
    if (!res.ok) return fail("Could not read that image. Capture the tab instead.");
    await useBlob(await res.blob());
    return;
  }
  if (pending.kind === "crop") {
    const blob = await crop(pending.dataUrl, pending.rect);
    await useBlob(blob);
  }
}

function crop(dataUrl, rect) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(rect.w));
      canvas.height = Math.max(1, Math.round(rect.h));
      canvas.getContext("2d").drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not crop that region"))), "image/png");
    };
    image.onerror = () => reject(new Error("Could not read the capture."));
    image.src = dataUrl;
  });
}

function demoFabric() {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1100;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e7d7c4";
  ctx.fillRect(0, 0, 900, 1100);
  for (let y = 0; y < 1100; y += 18) {
    ctx.fillStyle = y % 36 ? "#c46a4a" : "#1f3d36";
    for (let x = 0; x < 900; x += 18) {
      if ((x + y) % 36 === 0) ctx.fillRect(x, y, 10, 10);
    }
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85));
}

loadSettings().then(async () => {
  await loadCategories();
  await takePending();
  if (!hasChrome && location.hash !== "#blank") {
    const blob = await demoFabric();
    if (blob) showImage(blob);
  }
});
