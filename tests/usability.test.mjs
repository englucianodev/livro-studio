import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {validateBook} from '../dist/book-tools.mjs';
import {splitHTMLChapters} from '../dist/structure.mjs';
import {cleanPDFMargins} from '../dist/pdf-layout.mjs';
import {validISBN} from '../dist/book-details.mjs';
before(()=>{const dom=new JSDOM();globalThis.DOMParser=dom.window.DOMParser;globalThis.document??=dom.window.document;});

test('validateBook mantém ID fixo e metadados do livro',()=>{
 const book=validateBook({title:'T',id:'3f2504e0-4f89-11d3-9a0c-0305e82c3301',description:'Sinopse',publisher:'Ed',pubDate:'2026-11-11',isbn:'978-85-333-0227-3',series:'Saga',seriesIndex:'2',subject:'A; B',chapters:[{name:'C',html:'<p>x</p>'}]});
 assert.equal(book.id,'3f2504e0-4f89-11d3-9a0c-0305e82c3301');
 assert.equal(book.publisher,'Ed');assert.equal(book.seriesIndex,'2');assert.equal(book.pubDate,'2026-11-11');
 const fresh=validateBook({title:'T',pubDate:'ontem',chapters:[{name:'C',html:'<p>x</p>'}]});
 assert.match(fresh.id,/^[0-9a-f-]{36}$/);assert.equal(fresh.pubDate,'');
});

test('valida ISBN-10 e ISBN-13',()=>{
 assert.ok(validISBN('978-85-333-0227-3'));assert.ok(validISBN('0-306-40615-2'));
 assert.ok(!validISBN('978-85-333-0227-4'));assert.ok(!validISBN('abc'));
});

test('abertura que contém só número de página é descartada',()=>{
 const chapters=splitHTMLChapters('<p>1</p><h1>Capítulo 1</h1><p>Texto.</p><h1>Capítulo 2</h1><p>Mais.</p>',{name:'livro'});
 assert.deepEqual(chapters.map(c=>c.name),['Capítulo 1','Capítulo 2']);
});

test('abertura com título recebe o nome do título',()=>{
 const chapters=splitHTMLChapters('<h1>O Livro</h1><h1>Capítulo 1</h1><p>Texto.</p>',{name:'arquivo'});
 assert.equal(chapters[0].name,'O Livro');
});

test('links externos são preservados e javascript: é removido',()=>{
 const book=validateBook({title:'T',chapters:[{name:'C',html:'<p><a href="https://exemplo.com">ok</a> <a href="javascript:alert(1)">x</a></p>'}]});
 assert.match(book.chapters[0].html,/href="https:\/\/exemplo.com"/);
 assert.doesNotMatch(book.chapters[0].html,/javascript/);
});

test('número de página no rodapé é removido mesmo fora de ordem no PDF',()=>{
 const page=n=>({height:600,lines:[{top:50,size:8,text:'TÍTULO CORRENTE'},{top:580,size:8,text:String(n)},...Array.from({length:8},(_,i)=>({top:100+i*40,size:10,text:'Linha de texto '+i}))]});
 const {pages,removed}=cleanPDFMargins([page(1),page(2),page(3),page(4)]);
 assert.ok(removed.some(r=>r.kind==='número de página'));
 assert.ok(pages.every(p=>!p.lines.some(l=>/^\d+$/.test(l.text))));
});
