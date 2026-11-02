// Copyright Alejandro Martínez Corriá and the Thinkube contributors
// SPDX-License-Identifier: Apache-2.0

// The page of a Thinkube Document View tab. The extension sends the file's
// bytes ({type: 'load', kind, name, bytes}) when the page says it is ready
// and again whenever the file changes; each kind has a renderer that draws it
// into #viewer and returns what it needs to restore its place on the next load.

const vscode = acquireVsCodeApi();
const assets = JSON.parse(document.getElementById('assets').textContent);
const toolbar = document.getElementById('toolbar');
const viewer = document.getElementById('viewer');

/** The active renderer: its cleanup, and how to read where the reader is. */
let active = null;

function element(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value);
  }
  for (const child of children) el.append(child);
  return el;
}

function button(label, title, onclick) {
  return element('button', { title, 'aria-label': title, onclick }, label);
}

function showError(message) {
  toolbar.replaceChildren();
  viewer.replaceChildren(element('div', { class: 'error' }, message));
}

const loaded = new Map();
/** A classic script, added once. */
function loadScript(url) {
  if (!loaded.has(url)) {
    loaded.set(
      url,
      new Promise((resolve, reject) => {
        const script = element('script', { src: url });
        script.onload = resolve;
        script.onerror = () => reject(new Error(`cannot load ${url}`));
        document.head.append(script);
      }),
    );
  }
  return loaded.get(url);
}

/** A directory of the extension's assets, as an address with a final slash. */
function folder(file, name) {
  return file.slice(0, file.lastIndexOf('/build/')) + `/${name}/`;
}

// ---------------------------------------------------------------- PDF

let pdfjs = null;

async function pdfLibrary() {
  if (!pdfjs) {
    pdfjs = await import(assets.pdfjs);
    // A worker script from another origin does not start in a webview; the
    // same code from a blob does.
    const code = await (await fetch(assets.pdfjsWorker)).text();
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(url, { type: 'module' });
  }
  return pdfjs;
}

async function renderPdf(bytes, name, previous) {
  const lib = await pdfLibrary();
  const doc = await lib.getDocument({
    data: bytes,
    isEvalSupported: false,
    // The worker runs from a blob, so its data folders are given as full addresses.
    wasmUrl: folder(assets.pdfjs, 'wasm'),
    standardFontDataUrl: folder(assets.pdfjs, 'standard_fonts'),
    cMapUrl: folder(assets.pdfjs, 'cmaps'),
    iccUrl: folder(assets.pdfjs, 'iccs'),
  }).promise;
  const first = await doc.getPage(1);
  const base = first.getViewport({ scale: 1 });

  let zoom = previous?.zoom ?? 'fit';
  const fitScale = () => Math.max(0.2, (viewer.clientWidth - 48) / base.width);
  const scale = () => (zoom === 'fit' ? fitScale() : zoom);

  const pages = element('div', { class: 'pages' });
  const label = element('span', { class: 'status' });
  const zoomLabel = element('span', { class: 'status' });
  const slots = [];
  const drawn = new Map();

  const setZoom = (next) => {
    const fraction = viewer.scrollTop / Math.max(1, viewer.scrollHeight);
    zoom = next;
    layout();
    viewer.scrollTop = fraction * viewer.scrollHeight;
  };
  toolbar.replaceChildren(
    element('span', { class: 'name' }, name),
    button('−', 'Zoom out', () => setZoom(Math.max(0.25, scale() / 1.2))),
    zoomLabel,
    button('+', 'Zoom in', () => setZoom(Math.min(5, scale() * 1.2))),
    button('↔', 'Fit width', () => setZoom('fit')),
    label,
  );

  async function draw(index) {
    const s = scale();
    if (drawn.get(index) === s) return;
    drawn.set(index, s);
    const page = await doc.getPage(index + 1);
    const viewport = page.getViewport({ scale: s });
    const ratio = window.devicePixelRatio || 1;
    const canvas = element('canvas');
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
      transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
    }).promise;
    if (drawn.get(index) === s) slots[index].replaceChildren(canvas);
  }

  // Pages are drawn as they come near the screen.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) void draw(Number(entry.target.dataset.index));
    },
    { root: viewer, rootMargin: '1200px 0px' },
  );

  function layout() {
    const s = scale();
    zoomLabel.textContent = `${Math.round(s * 100)} %`;
    drawn.clear();
    for (const slot of slots) {
      slot.style.width = `${base.width * s}px`;
      slot.style.height = `${base.height * s}px`;
      slot.replaceChildren();
      observer.unobserve(slot);
      observer.observe(slot);
    }
  }

  for (let i = 0; i < doc.numPages; i++) {
    const slot = element('div', { class: 'page', 'data-index': String(i) });
    slots.push(slot);
    pages.append(slot);
  }
  viewer.replaceChildren(pages);
  layout();

  const where = () => {
    const middle = viewer.scrollTop + viewer.clientHeight / 2;
    let current = 0;
    for (let i = 0; i < slots.length; i++) if (slots[i].offsetTop <= middle) current = i;
    label.textContent = `Page ${current + 1} of ${doc.numPages}`;
  };
  viewer.addEventListener('scroll', where);
  const resize = () => zoom === 'fit' && setZoom('fit');
  window.addEventListener('resize', resize);
  if (previous?.fraction) viewer.scrollTop = previous.fraction * viewer.scrollHeight;
  where();

  return {
    place: () => ({ zoom, fraction: viewer.scrollTop / Math.max(1, viewer.scrollHeight) }),
    dispose: async () => {
      observer.disconnect();
      viewer.removeEventListener('scroll', where);
      window.removeEventListener('resize', resize);
      await doc.destroy();
    },
  };
}

// ---------------------------------------------------------------- EPUB

async function renderEpub(bytes, name, previous) {
  await loadScript(assets.jszip);
  await loadScript(assets.epubjs);
  const book = window.ePub(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const area = element('div', { class: 'epub' });
  viewer.replaceChildren(area);
  const rendition = book.renderTo(area, {
    width: '100%',
    height: '100%',
    flow: 'paginated',
    spread: 'auto',
    allowScriptedContent: false,
  });
  rendition.themes.default({ body: { background: '#fff', color: '#111' } });

  const chapters = element('select', { title: 'Chapter', 'aria-label': 'Chapter' });
  const label = element('span', { class: 'status' });
  toolbar.replaceChildren(
    element('span', { class: 'name' }, name),
    button('‹', 'Previous page', () => rendition.prev()),
    button('›', 'Next page', () => rendition.next()),
    chapters,
    label,
  );
  chapters.addEventListener('change', () => rendition.display(chapters.value));

  const navigation = await book.loaded.navigation;
  const add = (items, depth) => {
    for (const item of items) {
      chapters.append(element('option', { value: item.href }, `${'  '.repeat(depth)}${item.label.trim()}`));
      if (item.subitems?.length) add(item.subitems, depth + 1);
    }
  };
  add(navigation.toc, 0);

  let place = previous?.cfi;
  rendition.on('relocated', (location) => {
    place = location.start.cfi;
    const href = location.start.href;
    const option = [...chapters.options].find((o) => o.value.split('#')[0] === href);
    if (option) chapters.value = option.value;
    label.textContent = location.atEnd ? 'End' : `${location.start.displayed.page} / ${location.start.displayed.total}`;
  });
  const keys = (event) => {
    if (event.key === 'ArrowLeft') rendition.prev();
    if (event.key === 'ArrowRight') rendition.next();
  };
  document.addEventListener('keyup', keys);
  rendition.on('keyup', keys);
  await rendition.display(place);

  return {
    place: () => ({ cfi: place }),
    dispose: async () => {
      document.removeEventListener('keyup', keys);
      book.destroy();
    },
  };
}

// ---------------------------------------------------------------- Word

async function renderDocx(bytes, name, previous) {
  await loadScript(assets.jszip);
  await loadScript(assets.docxPreview);
  toolbar.replaceChildren(
    element('span', { class: 'name' }, name),
    element('span', { class: 'status' }, 'Fields such as the table of contents are filled in by Word when it opens the file.'),
  );
  const area = element('div', { class: 'docx-area' });
  viewer.replaceChildren(area);
  await window.docx.renderAsync(bytes, area, undefined, {
    inWrapper: true,
    breakPages: true,
    ignoreLastRenderedPageBreak: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    useBase64URL: true,
  });
  if (previous?.fraction) viewer.scrollTop = previous.fraction * viewer.scrollHeight;
  return {
    place: () => ({ fraction: viewer.scrollTop / Math.max(1, viewer.scrollHeight) }),
    dispose: async () => undefined,
  };
}

// ---------------------------------------------------------------- loading

const RENDERERS = { pdf: renderPdf, epub: renderEpub, docx: renderDocx };

window.addEventListener('message', async (event) => {
  const message = event.data;
  if (message.type === 'error') {
    showError(message.message);
    return;
  }
  if (message.type !== 'load') return;
  // A reload keeps the reader's place in the same kind of document.
  const previous = active && active.kind === message.kind ? active.place() : undefined;
  if (active) {
    await active.dispose();
    active = null;
  }
  try {
    const renderer = await RENDERERS[message.kind](message.bytes, message.name, previous);
    active = { kind: message.kind, ...renderer };
  } catch (err) {
    showError(`Cannot open ${message.name}: ${err?.message ?? err}`);
  }
});

vscode.postMessage({ type: 'ready' });
