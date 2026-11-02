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

/** Library files the page loads, relative to the extension root. */
const ASSETS = {
  pdfjs: 'node_modules/pdfjs-dist/build/pdf.min.mjs',
  pdfjsWorker: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  jszip: 'node_modules/jszip/dist/jszip.min.js',
  epubjs: 'node_modules/epubjs/dist/epub.min.js',
  docxView: 'media/docx-view.js',
  docxViewStyle: 'media/docx-view.css',
  harfbuzzWasm: 'node_modules/@docx-editor.dev/core/dist/harfbuzz.wasm',
  viewer: 'media/viewer.js',
  style: 'media/viewer.css',
};

/**
 * The serif faces of Thinkube's book typesetting, in media/fonts (the deploy
 * hook fetches them). The Word view measures and draws text with them, so a
 * document set in them is laid out as Word lays it out.
 */
const FACES: { family: string; files: [string, number, 'normal' | 'italic'][] }[] = [
  {
    family: 'EB Garamond',
    files: [
      ['EBGaramond-Regular.otf', 400, 'normal'],
      ['EBGaramond-Italic.otf', 400, 'italic'],
      ['EBGaramond-Bold.otf', 700, 'normal'],
      ['EBGaramond-BoldItalic.otf', 700, 'italic'],
    ],
  },
  {
    family: 'Crimson Pro',
    files: [
      ['CrimsonPro-Regular.ttf', 400, 'normal'],
      ['CrimsonPro-Italic.ttf', 400, 'italic'],
      ['CrimsonPro-Bold.ttf', 700, 'normal'],
      ['CrimsonPro-BoldItalic.ttf', 700, 'italic'],
    ],
  },
  {
    family: 'Libertinus Serif',
    files: [
      ['LibertinusSerif-Regular.otf', 400, 'normal'],
      ['LibertinusSerif-Italic.otf', 400, 'italic'],
      ['LibertinusSerif-Bold.otf', 700, 'normal'],
      ['LibertinusSerif-BoldItalic.otf', 700, 'italic'],
    ],
  },
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
        // readFile gives a Node Buffer, which postMessage serializes as a plain
        // object; a plain Uint8Array reaches the page as bytes.
        const bytes = new Uint8Array(await vscode.workspace.fs.readFile(document.uri));
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
    const assets: Record<string, unknown> = Object.fromEntries(
      Object.entries(ASSETS).map(([key, file]) => [key, uri(file)]),
    );
    assets.fonts = FACES.flatMap(({ family, files }) =>
      files.map(([file, weight, style]) => ({ url: uri(`media/fonts/${file}`), family, weight, style })),
    );
    // pdf.js runs its worker from a blob (a worker script on another origin does
    // not start in a webview); epub.js and docx-editor load the document's own
    // images, fonts and styles as blob and data URLs; inline styles are theirs.
    const csp = [
      "default-src 'none'",
      `img-src ${source} blob: data:`,
      `font-src ${source} blob: data:`,
      `style-src ${source} 'unsafe-inline' blob:`,
      // pdf.js's decoders and docx-editor's text shaper are WebAssembly.
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
