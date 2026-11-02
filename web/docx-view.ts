// Copyright Alejandro Martínez Corriá and the Thinkube contributors
// SPDX-License-Identifier: Apache-2.0

// The Word view: docx-editor's paginated surface, read-only. Bundled by
// scripts/build-web.mjs into media/docx-view.js and media/docx-view.css, which
// media/viewer.js imports.

import { createDocxEditor, customFonts } from '@docx-editor.dev/core/editor';
import { setHarfBuzzWasmUrl } from '@docx-editor.dev/core/layout';
import '@docx-editor.dev/core/styles/editor.css';

/** A face file the layout measures text with. */
export interface FontFile {
  url: string;
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

/**
 * Lays the document out as pages in the container and returns its teardown.
 * The shaper's WebAssembly is given by address: a bundle has no path of its own
 * to resolve it from.
 */
export function renderDocx(container: HTMLElement, bytes: Uint8Array, wasmUrl: string, fonts: FontFile[]): () => void {
  setHarfBuzzWasmUrl(wasmUrl);
  const editor = createDocxEditor({
    document: bytes,
    mode: 'view',
    zoomMode: 'auto',
    fonts: customFonts({ sources: fonts }),
  });
  editor.attach(container);
  return () => editor.destroy();
}
