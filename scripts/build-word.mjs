import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
await build({entryPoints:['scripts/word-codecs-entry.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof',outfile:'dist/vendor/word-codecs.mjs'});
await copyFile('node_modules/mammoth/LICENSE','dist/vendor/mammoth-LICENSE');
await copyFile('node_modules/docx/LICENSE','dist/vendor/docx-LICENSE');
