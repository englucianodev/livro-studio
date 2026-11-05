# KFX test fixtures

These are small, synthetic, DRM-free books authored for Livro Studio. They contain
Portuguese text, Unicode, two sections deliberately stored in reverse order, an
explicit reading order, a referenced text store, a named bold style, a list, a
table and a one-pixel PNG. They contain no purchased book content or credentials.

`sample.kfx` contains all entities. `metadata.kfx`, `content.kfx` and
`resources.kfx` split the same book into containers for the ZIP and missing-parts
tests. These are regression fixtures, not representative of every Kindle layout.

They were serialized with John Howell's KFX Input implementation, independently
of the JavaScript reader, and decoded again with that implementation to check the
container structure. Reference: [KFX Input mirror](https://github.com/kluyg/calibre-kfx-input),
revision `a0285556253889fce506ff44520537e5045f0237` (GPL-3.0).
No reference-library source is included in the shipped browser code.

To regenerate for development, obtain that reference in `.kfx-reference` (or set
`KFX_INPUT_REFERENCE` to its directory), install Calibre, and run:

```powershell
& 'C:/Program Files/Calibre2/calibre-debug.exe' -e scripts/generate-kfx-fixtures.py
```

Calibre and the reference source are only needed to regenerate fixtures;
`npm test` and the browser importer do not depend on them.
