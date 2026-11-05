import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
// Convert the dependency's static AMD declarations into CommonJS at build time.
// This avoids shipping an AMD loader or any Node filesystem dependency.
await build({stdin:{contents:"export {default as LzmaDecoder} from 'lzma-purejs/lib/LZMA/Decoder.js';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof',outfile:'dist/vendor/drm-codecs.mjs',plugins:[{name:'static-amd',setup(build){build.onLoad({filter:/lzma-purejs[\\/].*\.js$/},async({path})=>{
 let source=await readFile(path,'utf8');source=source.replace(/^if \(typeof define[^\n]*\n/,'');
 const match=source.match(/define\(\s*\[([^\]]*)\]\s*,\s*function\(([^)]*)\)\s*\{/);if(!match)throw Error('Unsupported AMD declaration: '+path);
 const dependencies=[...match[1].matchAll(/['"]([^'"]+)['"]/g)].map(m=>'require('+JSON.stringify(m[1])+')');
 source=source.replace(match[0],'module.exports=(function('+match[2]+'){').replace(/\}\);\s*$/,'})('+dependencies.join(',')+');');return {contents:source,loader:'js'};
 });}}]});
const readme=await readFile('node_modules/lzma-purejs/README.md','utf8');await writeFile('dist/vendor/LZMA-LICENSE.txt',readme.slice(readme.indexOf('## License')));
