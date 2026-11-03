import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {joinEditingPageHTML,mergeEditingPages} from '../dist/page-editor.mjs';
import {caretUnits,caretPoint,unitsLength} from '../dist/page-caret.mjs';
before(()=>{const dom=new JSDOM();globalThis.DOMParser=dom.window.DOMParser;});
const parse=html=>new DOMParser().parseFromString(html,'text/html').body;
test('reúne parágrafo dividido após exclusão sem perder estilos ou repetir texto',()=>{
 const parts=[{chapter:0,html:'<p data-page-node="p"><strong data-page-node="b">Começo </strong><em data-page-node="i">da frase </em></p>'},{chapter:0,html:'<p data-page-node="p"><em data-page-node="i">que continua.</em></p><p data-page-node="q">Outro parágrafo.</p>'}];
 const book={title:'Teste',chapters:[{name:'Capítulo',html:''},{name:'Preservado',html:'<p>Intacto</p>'}]};
 const joined=parse(joinEditingPageHTML(parts));
 assert.equal(joined.children.length,2);
 assert.equal(joined.querySelectorAll('em').length,1);
 assert.equal(joined.firstChild.textContent,'Começo da frase que continua.');
 assert.equal(joined.firstChild.getAttribute('data-page-node'),'p');
 const result=mergeEditingPages(book,parts,new Set([0])).book;
 assert.equal(result.chapters[1].html,book.chapters[1].html);
 assert.doesNotMatch(result.chapters[0].html,/data-page-node/);
});
test('reconstrói tabelas com cabeçalho repetido e preserva linhas vazias',()=>{
 const parts=['<table data-page-node="t"><thead data-page-node="h"><tr><th>Nome</th></tr></thead><tbody data-page-node="b"><tr data-page-node="r1"><td>A</td></tr></tbody></table>','<table data-page-node="t"><thead data-page-node="h"><tr><th>Nome</th></tr></thead><tbody data-page-node="b"><tr data-page-node="r2"><td></td></tr><tr data-page-node="r3"><td>B</td></tr></tbody></table>'].map(html=>({html}));
 const body=parse(joinEditingPageHTML(parts));
 assert.equal(body.querySelectorAll('thead').length,1);
 assert.equal(body.querySelectorAll('tbody tr').length,3);
});
test('posição do cursor atravessa estilos, quebras e limites de parágrafos',()=>{
 const body=parse('<p><b>abc</b><i>def</i><br>ghi</p><p>jkl</p>');
 assert.equal(unitsLength(caretUnits(body)),13);
 let point=caretPoint(body,3);assert.equal(point.node.textContent,'abc');assert.equal(point.offset,3);
 point=caretPoint(body,3,'forward');assert.equal(point.node.textContent,'def');assert.equal(point.offset,0);
 point=caretPoint(body,7);assert.equal(point.node.localName,'p');assert.equal(point.offset,3);
 point=caretPoint(body,10,'forward');assert.equal(point.node.textContent,'jkl');assert.equal(point.offset,0);
});
test('cabeçalhos repetidos de tabela não deslocam o cursor',()=>{
 const seen=new Set();
 const first=parse('<table><thead data-page-node="h"><tr><th>Título</th></tr></thead><tbody><tr><td>abc</td></tr></tbody></table>');
 const second=parse('<table><thead data-page-node="h"><tr><th>Título</th></tr></thead><tbody><tr><td>def</td></tr></tbody></table>');
 assert.equal(unitsLength(caretUnits(first,seen)),9);
 const point=caretPoint(second,2,'backward',seen);
 assert.equal(point.node.textContent,'def');assert.equal(point.offset,2);
});
