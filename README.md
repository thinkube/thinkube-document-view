# Thinkube Document View

Opens PDF, EPUB and Word (`.docx`) files in an editor tab of Thinkube IDE (code-server).

- **PDF**: every page as [pdf.js](https://mozilla.github.io/pdf.js/) draws it, drawn as it nears the screen. Zoom in and out, fit to the width of the tab, and the page you are on.
- **EPUB**: paginated like an e-reader with [epub.js](https://github.com/futurepress/epub.js), with the book's own embedded faces. Previous and next page from the toolbar or the arrow keys, and a chapter list from the book's table of contents.
- **Word**: the document laid out as pages by [docx-editor](https://github.com/eigenpal/docx-editor)'s layout engine, read-only, with page numbers and other live fields worked out. Text is measured and drawn with the serif faces of Thinkube's book typesetting (EB Garamond, Crimson Pro, Libertinus Serif), which the extension carries, so a document set in them breaks lines and pages as Word does. A table of contents shows what the file saved: Word fills it in when it opens the file.

Clicking such a file in the Explorer opens it in the viewer. The tab follows the file: when it changes on disk, for example when a book is typeset again, the tab redraws it and keeps your place. *Reload document* in the tab's title bar reads it again by hand.

## Deploy

```bash
npm run deploy                 # bump the patch version, build, package, install into code-server, commit and push
npm run deploy -- --no-bump    # install the version in package.json
```

## License

Apache-2.0. See [LICENSE](LICENSE). pdf.js and docx-editor's core are Apache-2.0 (HarfBuzz, in docx-editor, is MIT), epub.js is BSD-2-Clause, JSZip is MIT or GPL-3.0 (used under MIT); they are installed from npm and packaged with the extension. EB Garamond, Crimson Pro and Libertinus are under the SIL Open Font License 1.1, which each font file carries; the deploy fetches them from their projects.

Copyright Alejandro Martínez Corriá and the Thinkube contributors
