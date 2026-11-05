import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import JSZip from 'jszip';
import {importFile,createEPUB} from '../dist/importers.mjs';
import {decodeKFXContainers} from '../dist/kfx-formats.mjs';
import {readIon} from '../dist/kfx-ion.mjs';
before(()=>{const dom=new JSDOM();globalThis.DOMParser=dom.window.DOMParser;globalThis.document=dom.window.document;globalThis.JSZip=JSZip;});
const fixture=async name=>new Uint8Array(await readFile(new URL('./fixtures/'+name+'.kfx',import.meta.url)));
function check(book){
 assert.equal(book.title,'Histórias KFX sem DRM');assert.equal(book.author,'Luciano');assert.equal(book.language,'pt-BR');
 assert.equal(book.chapters.length,2);assert.match(book.chapters[0].html,/Capítulo 1/);assert.match(book.chapters[1].html,/Fim da história/);
 const html=book.chapters.map(c=>c.html).join(''),doc=new DOMParser().parseFromString(html,'text/html');
 assert.ok(doc.body.textContent.includes('Histórias 🌎'));assert.equal(doc.querySelector('strong').textContent,'negrito');
 assert.equal(doc.querySelectorAll('li').length,2);assert.equal(doc.querySelectorAll('table td').length,4);
 assert.equal(doc.querySelector('img').alt,'Figura de exemplo');assert.match(doc.querySelector('img').src,/^data:image\/png;base64,/);
 assert.doesNotMatch(html,/<script|javascript:/);
}
test('KFX binário validado pelo leitor de referência: ordem, estilos, Unicode, listas, tabela e imagem',async()=>{
 const book=await importFile(new File([await fixture('sample')],'exemplo.kfx'));check(book);
 // Imported content remains editable and can be exported by the existing EPUB path.
 book.chapters[1].html+='<p>Conteúdo editado no Livro Studio.</p>';
 const zip=await JSZip.loadAsync(await createEPUB(book));
 assert.match(await zip.file('OEBPS/ch1.xhtml').async('string'),/Conteúdo editado no Livro Studio/);
});
async function packaged(names){const zip=new JSZip();for(const name of names)zip.file('book/'+name+'.kfx',await fixture(name));return new File([await zip.generateAsync({type:'uint8array'})],'livro.kfx-zip');}
test('KFX-ZIP reúne contêineres em qualquer ordem, incluindo recursos e símbolos compartilhados',async()=>{
 check(await importFile(await packaged(['content','resources','metadata'])));
});
test('rejeita DRM, arquivo falso, versão desconhecida, índice truncado e partes ausentes',async()=>{
 await assert.rejects(()=>importFile(new File([Uint8Array.from([234,68,82,77,73,79,78,238])],'protegido.kfx')),/DRM/);
 await assert.rejects(()=>importFile(new File(['texto renomeado'],'falso.kfx')),/contêiner KFX válido/);
 const bytes=await fixture('sample'),version=bytes.slice();version[4]=99;
 assert.throws(()=>decodeKFXContainers([{bytes:version}]),/versão/);
 assert.throws(()=>decodeKFXContainers([{bytes:bytes.slice(0,100)}]),/inválido|truncado/);
 await assert.rejects(async()=>importFile(await packaged(['metadata','content'])),/incompleto/);
 await assert.rejects(()=>importFile({name:'grande.kfx',size:81*1024*1024}),/80 MB/);
});
test('Ion rejeita comprimentos fora dos limites, inteiros inseguros e estruturas profundas',()=>{
 const bvm=[224,1,0,234];
 assert.throws(()=>readIon(Uint8Array.from([...bvm,0x8e,0xff,65])),/Ion inválida/);
 assert.throws(()=>readIon(Uint8Array.from([...bvm,0x28,255,255,255,255,255,255,255,255])),/Ion inválida/);
 let nested=[0x80];for(let i=0;i<140;i++){const length=nested.length;const variable=length<128?[length|128]:[length>>7,(length&127)|128];nested=[0xbe,...variable,...nested];}
 assert.throws(()=>readIon(Uint8Array.from([...bvm,...nested])),/complexidade/);
});
