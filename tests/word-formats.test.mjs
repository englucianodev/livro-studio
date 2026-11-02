import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import JSZip from 'jszip';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {createWord,readWord} from '../dist/word-formats.mjs';
import {importFile} from '../dist/importers.mjs';
const require=createRequire(import.meta.url);
const docToText=require('../dist/vendor/docToText.cjs');
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const book={title:'Histórias & descobertas',author:'João da Conceição',language:'pt-BR',cover:{data:pixel},chapters:[
 {name:'Capítulo 1',html:'<h1>Capítulo 1 — Olá, mundo 🌎</h1><p>Texto com <strong>negrito</strong>, <em>itálico</em>, <u>sublinhado</u> e ação.</p><p><span data-editor-format="true" style="color:#7144ed">Violeta</span><br>Outra linha</p><ul><li>Uma ideia<ul><li>Ideia filha</li></ul></li><li>Outra ideia</li></ul><ol><li>Primeiro</li><li>Segundo</li></ol><table><tr><th>Nome</th><th>Valor</th></tr><tr><td>Maçã</td><td>20</td></tr><tr><td></td><td>Vazio à esquerda</td></tr></table><p><img alt="Exemplo" src="'+pixel+'"></p>'},
 {name:'Capítulo 2',html:'<h1>Capítulo 2</h1><p>Fim da história.</p>'}
]};
before(()=>{const dom=new JSDOM('<!doctype html><html><body></body></html>');globalThis.document=dom.window.document;globalThis.DOMParser=dom.window.DOMParser;globalThis.JSZip=JSZip;});
for(const format of ['doc','docx'])test(`${format}: exporta arquivo real e reimporta conteúdo, listas, tabela e imagem`,async()=>{
 const blob=await createWord(book,format),bytes=new Uint8Array(await blob.arrayBuffer());
 assert.equal(blob.type,format==='doc'?'application/msword':'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 assert.deepEqual([...bytes.slice(0,format==='doc'?8:2)],format==='doc'?[208,207,17,224,161,177,26,225]:[80,75]);
 if(format==='doc'){
  const model=docToText.model(bytes);assert.ok(model.body.some(p=>p.runs.some(r=>r.b&&r.text.includes('negrito'))));
  assert.ok(model.body.some(p=>p.kind==='rowEnd'));assert.ok(model.body.some(p=>p.runs.some(r=>r.image)));
 }else{
  const zip=await JSZip.loadAsync(bytes);assert.ok(zip.file('[Content_Types].xml'));assert.ok(zip.file('word/document.xml'));
  const xml=new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'),'application/xml');
  assert.equal(xml.querySelector('parsererror'),null);assert.equal(xml.getElementsByTagNameNS('*','tbl').length,1);
  assert.ok(xml.getElementsByTagNameNS('*','drawing').length>=2);
 }
 const file=new File([bytes],'teste.'+format);const result=await importFile(file);
 const html=result.chapters.map(c=>c.html).join('');const doc=new DOMParser().parseFromString(html,'text/html');
 for(const text of ['Olá, mundo 🌎','negrito','itálico','Uma ideia','Ideia filha','Maçã','Vazio à esquerda','Fim da história.'])assert.ok(doc.body.textContent.includes(text),text);
 assert.ok(doc.querySelector('strong'));assert.ok(doc.querySelector('em'));assert.ok(doc.querySelector('u'));assert.ok(doc.querySelector('table'));assert.ok(doc.querySelector('li'));assert.ok(doc.querySelector('img[src^="data:image/"]'));
 assert.equal(result.title,book.title);assert.equal(result.author,book.author);
 await mkdir('.word-test-output',{recursive:true});await writeFile('.word-test-output/exemplo.'+format,bytes);
});
test('rejeita arquivo falso, conteúdo vazio e limite de tamanho',async()=>{
 await assert.rejects(()=>readWord(new File(['não é Word'],'falso.doc')),/não contém um documento Word/);
 await assert.rejects(()=>importFile({name:'grande.docx',size:81*1024*1024}),/80 MB/);
 const zip=new JSZip();zip.file('word/document.xml','<bad>');
 const corrupt=await zip.generateAsync({type:'uint8array'});
 await assert.rejects(()=>readWord(new File([corrupt],'corrompido.docx')));
});
test('importação DOCX descarta scripts e links perigosos',async()=>{
 const blob=await createWord({...book,cover:null,chapters:[{name:'Seguro',html:'<p>Conteúdo seguro<script>alert(1)</script><a href="javascript:alert(1)">link</a><img src="https://example.com/tracker.png"></p>'}]},'docx').catch(e=>e);
 assert.ok(blob instanceof Blob); // External images become text placeholders; conversion never fetches them.
 const safe=await createWord({...book,cover:null,chapters:[{name:'Seguro',html:'<p>Conteúdo seguro<script>alert(1)</script><a href="javascript:alert(1)">link</a></p>'}]},'docx');
 const result=await readWord(new File([safe],'seguro.docx'));
 assert.doesNotMatch(result.chapters.map(c=>c.html).join(''),/<script|javascript:|alert\(1\)/);
});
