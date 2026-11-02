// Copyright Alejandro Martínez Corriá and the Thinkube contributors
// SPDX-License-Identifier: Apache-2.0

import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';

/** The formats the viewer opens, by file extension. */
const KINDS: Record<string, 'pdf' | 'epub' | 'docx'> = {
  '.pdf': 'pdf',
  '.epub': 'epub',
  '.docx': 'docx',
};

/** Library and font files the page loads, relative to the extension root. */
const ASSETS = {
  pdfjs: 'node_modules/pdfjs-dist/build/pdf.min.mjs',
  pdfjsWorker: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  jszip: 'node_modules/jszip/dist/jszip.min.js',
  epubjs: 'node_modules/epubjs/dist/epub.min.js',
  docxPreview: 'node_modules/docx-preview/dist/docx-preview.min.js',
  viewer: 'media/viewer.js',
  style: 'media/viewer.css',
};

/**
 * The serif faces a Word document from Thinkube's typesetting names; the page
 * declares them so docx-preview sets the document in its own face.
 */
const FACES: { family: string; dir: string; file: string }[] = [
  { family: 'EB Garamond', dir: '@fontsource/eb-garamond', file: 'eb-garamond' },
  { family: 'Crimson Pro', dir: '@fontsource/crimson-pro', file: 'crimson-pro' },
  { family: 'Libertinus Serif', dir: '@fontsource/libertinus-serif', file: 'libertinus-serif' },
];

const VIEW_TYPE = 'thinkubeDocumentView.viewer';

/** One open tab: its panel and how to send it the file again. */
interface OpenView {
  panel: vscode.WebviewPanel;
  send: () => Promise<void>;
}

class DocumentProvider implements vscode.CustomReadonlyEditorProvider {
  private readonly views = new Set<OpenView>();

  constructor(private readonly extensionUri: vscode.Uri) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => undefined };
  }

  async resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): Promise<void> {
    const kind = KINDS[path.extname(document.uri.path).toLowerCase()];
    const webview = panel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'media'),
        vscode.Uri.joinPath(this.extensionUri, 'node_modules'),
      ],
    };
    webview.html = this.html(webview, kind);

    // The page asks for the file once its script runs; a change on disk sends it again.
    const send = async () => {
      try {
        const bytes = await vscode.workspace.fs.readFile(document.uri);
        await webview.postMessage({ type: 'load', kind, name: path.basename(document.uri.path), bytes });
      } catch (err) {
        await webview.postMessage({ type: 'error', message: `Cannot read ${document.uri.fsPath}: ${String(err)}` });
      }
    };
    const view: OpenView = { panel, send };
    this.views.add(view);

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.joinPath(document.uri, '..'), path.basename(document.uri.path)),
    );
    // A typesetting run writes the file in several chunks; one redraw after it settles.
    let timer: NodeJS.Timeout | undefined;
    const changed = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void send(), 500);
    };
    watcher.onDidChange(changed);
    watcher.onDidCreate(changed);

    webview.onDidReceiveMessage((message: { type: string }) => {
      if (message.type === 'ready') void send();
    });
    panel.onDidDispose(() => {
      if (timer) clearTimeout(timer);
      watcher.dispose();
      this.views.delete(view);
    });
  }

  /** Sends the file again to the active tab. */
  async reloadActive(): Promise<void> {
    for (const view of this.views) {
      if (view.panel.active) await view.send();
    }
  }

  private html(webview: vscode.Webview, kind: string): string {
    const uri = (relative: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...relative.split('/'))).toString();
    const nonce = crypto.randomBytes(16).toString('base64');
    const source = webview.cspSource;
    const assets = Object.fromEntries(Object.entries(ASSETS).map(([key, file]) => [key, uri(file)]));
    const faces = FACES.flatMap(({ family, dir, file }) =>
      [
        ['400', 'normal'],
        ['400', 'italic'],
        ['700', 'normal'],
        ['700', 'italic'],
      ].map(
        ([weight, style]) =>
          `@font-face { font-family: "${family}"; font-weight: ${weight}; font-style: ${style}; ` +
          `src: url("${uri(`node_modules/${dir}/files/${file}-latin-${weight}-${style}.woff2`)}") format("woff2"); }`,
      ),
    ).join('\n');
    // pdf.js runs its worker from a blob (a worker script on another origin does
    // not start in a webview); epub.js and docx-preview load the document's own
    // images, fonts and styles as blob and data URLs; inline styles are theirs.
    const csp = [
      "default-src 'none'",
      `img-src ${source} blob: data:`,
      `font-src ${source} blob: data:`,
      `style-src ${source} 'unsafe-inline' blob:`,
      // pdf.js compiles its WebAssembly decoders (colour, JPEG 2000) in the worker.
      `script-src ${source} 'nonce-${nonce}' 'wasm-unsafe-eval'`,
      'worker-src blob:',
      `connect-src ${source}`,
      `frame-src ${source} blob:`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${assets.style}">
<style nonce="${nonce}">${faces}</style>
</head>
<body data-kind="${kind}">
<div id="toolbar"></div>
<div id="viewer"></div>
<script nonce="${nonce}" id="assets" type="application/json">${JSON.stringify(assets)}</script>
<script nonce="${nonce}" type="module" src="${assets.viewer}"></script>
</body>
</html>`;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new DocumentProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.commands.registerCommand('thinkube-document-view.reload', () => provider.reloadActive()),
  );
}

export function deactivate(): void {}
