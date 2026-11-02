# Thinkube Document View

Opens PDF, EPUB and Word (`.docx`) files in an editor tab of Thinkube IDE (code-server).

- **PDF**: every page as [pdf.js](https://mozilla.github.io/pdf.js/) draws it, drawn as it nears the screen. Zoom in and out, fit to the width of the tab, and the page you are on.
- **EPUB**: paginated like an e-reader with [epub.js](https://github.com/futurepress/epub.js), with the book's own embedded faces. Previous and next page from the toolbar or the arrow keys, and a chapter list from the book's table of contents.
- **Word**: the document's pages as [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) draws them. The serif faces of Thinkube's book typesetting (EB Garamond, Crimson Pro, Libertinus Serif) are part of the extension, so a document set in them is shown in them. docx-preview approximates Word: fields Word fills in when it opens a file, such as a table of contents, stay empty.

Clicking such a file in the Explorer opens it in the viewer. The tab follows the file: when it changes on disk, for example when a book is typeset again, the tab redraws it and keeps your place. *Reload document* in the tab's title bar reads it again by hand.

## Deploy

```bash
npm run deploy                 # bump the patch version, build, package, install into code-server, commit and push
npm run deploy -- --no-bump    # install the version in package.json
```

## License

Apache-2.0. See [LICENSE](LICENSE). pdf.js and docx-preview are Apache-2.0, epub.js is BSD-2-Clause, JSZip is MIT or GPL-3.0 (used under MIT), and EB Garamond, Crimson Pro and Libertinus are under the SIL Open Font License 1.1; all are installed from npm and packaged with the extension.

Copyright Alejandro Martínez Corriá and the Thinkube contributors
