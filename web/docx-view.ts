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

/** What the view reports while and after it lays the document out. */
export interface DocxStatus {
  /** `shaped` measures text with HarfBuzz and the face files; `fixed` estimates widths. */
  measurer: 'fixed' | 'shaped';
  resolving: boolean;
  pages: number;
  fontErrors: string[];
}

/**
 * Lays the document out as pages in the container. The shaper's WebAssembly is
 * given by address: a bundle has no path of its own to resolve it from.
 * Returns the teardown and a reader of the layout's state.
 */
export function renderDocx(
  container: HTMLElement,
  bytes: Uint8Array,
  wasmUrl: string,
  fonts: FontFile[],
): { destroy: () => void; status: () => DocxStatus } {
  setHarfBuzzWasmUrl(wasmUrl);
  const fontErrors: string[] = [];
  const editor = createDocxEditor({
    document: bytes,
    mode: 'view',
    zoomMode: 'auto',
    fonts: customFonts({
      sources: fonts,
      onFailure: (failure) => fontErrors.push(`${failure.request.family}: ${String(failure.reason)}`),
    }),
    onFontError: (error) => fontErrors.push(`${error.code}: ${error.message ?? ''}`),
  });
  // docx-editor's stylesheet is scoped to .docx-editor, and the surface looks up its
  // scroller as .docx-editor__scroll-container: the host element carries both.
  container.classList.add('docx-editor', 'docx-editor__scroll-container');
  editor.attach(container);
  return {
    destroy: () => editor.destroy(),
    status: () => {
      const measurement = editor.fontMeasurement();
      return {
        measurer: measurement.measurer,
        resolving: measurement.resolving,
        pages: editor.getPageGeometry().length,
        fontErrors: [...fontErrors],
      };
    },
  };
}
