# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A small VS Code extension for Thinkube IDE (code-server): a read-only custom editor for `.pdf`, `.epub` and `.docx`.

- `src/extension.ts` — `DocumentProvider`, a `CustomReadonlyEditorProvider` for `thinkubeDocumentView.viewer` (priority default for the three patterns, so the Explorer opens them in it):
  - The page asks for the file with `{type: 'ready'}`; the provider reads it with `vscode.workspace.fs` and posts `{type: 'load', kind, name, bytes}`. The file is never served as a webview resource.
  - A `FileSystemWatcher` on the file posts it again 500 ms after the last change, so a typesetting run that rewrites it redraws the tab once.
  - `html()` builds the page: the CSP (scripts from the extension with a nonce, `wasm-unsafe-eval` for pdf.js's decoders, blob workers, blob and data images, fonts and styles for epub.js and docx-preview), and the asset addresses, with the face files of the Word view, as JSON in `#assets`.
  - `thinkube-document-view.reload` posts the active tab's file again.
- `media/viewer.js` — the page, an ES module. One renderer per kind draws into `#viewer`, fills `#toolbar`, and returns `place()` and `dispose()`; a reload of the same kind passes the previous `place()` to the new renderer.
  - PDF: pdf.js imported from `node_modules/pdfjs-dist/build`; its worker is fetched and started from a blob (a worker script from another origin does not start in a webview), so `wasmUrl`, `standardFontDataUrl`, `cMapUrl` and `iccUrl` are passed as full addresses. One slot per page sized from page 1; an `IntersectionObserver` draws pages near the screen.
  - EPUB: epub.js and JSZip as classic scripts (globals `ePub`, `JSZip`), paginated rendition, chapter list from the navigation.
  - Word: `media/docx-view.js`, the bundle of `web/docx-view.ts`, imported once with its stylesheet; `renderDocx` creates docx-editor's `createDocxEditor({mode: 'view', zoomMode: 'auto'})` with `customFonts` from the face files in `media/fonts`, points `setHarfBuzzWasmUrl` at `harfbuzz.wasm` in `node_modules`, and attaches it to `.docx-area`.
- `media/viewer.css` — the toolbar in the IDE's theme colours; documents keep a white page.

## Rules

- No frontend framework. The extension is `tsc` to `dist/`; the page loads pdf.js, epub.js and JSZip straight from `node_modules`, which the vsix carries (`.vscodeignore` drops what the page does not use). The Word view is the one bundle: `scripts/build-web.mjs` (esbuild, run by `npm run compile`) builds `web/docx-view.ts` into `media/docx-view.js` and `.css`, because docx-editor ships as many ES modules with a stylesheet.
- `scripts/deploy-hook.sh dependencies` fetches the twelve face files into `media/fonts`, pinned and checked by digest; HarfBuzz reads OpenType and TrueType, not woff2.
- Comments say what the code does and the constraints it serves, nothing about how it came to be.

## Deploy

```bash
npm run deploy                 # bump the patch version, build, package, install into code-server, commit and push
npm run deploy -- --no-bump    # install the version in package.json
```

`npm run deploy` runs `scripts/deploy.sh`, which is identical in every Thinkube extension repository; the master copy is `ansible/40_thinkube/core/code-server/files/extension-deploy.sh` in the `thinkube` repository. Versions stay on 0.1.x and move only by the script's patch bump; `package.json`'s version is never edited by hand.

The platform's install (`code-server/15_configure_environment.yaml` in the `thinkube` repository) clones this repository, refuses a `scripts/deploy.sh` that differs from the master copy, and runs `scripts/deploy.sh --no-bump`.
