// Copyright Alejandro Martínez Corriá and the Thinkube contributors
// SPDX-License-Identifier: Apache-2.0

// Bundles the Word view (web/docx-view.ts) and docx-editor's stylesheet for the
// webview: media/docx-view.js, an ES module, and media/docx-view.css. The rest
// of the extension is compiled by tsc and needs no bundle.
import { build } from 'esbuild';

await build({
  entryPoints: ['web/docx-view.ts'],
  outfile: 'media/docx-view.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'linked',
  loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.otf': 'file', '.svg': 'file', '.png': 'file' },
  assetNames: 'docx-assets/[name]-[hash]',
  logLevel: 'warning',
});
