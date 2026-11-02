import {sanitize,escapeXML,readingCSS} from './book-tools.mjs';

export function bookHTML(book){
 const esc=escapeXML;
 const cover=book.cover?.data;
 return `<!doctype html><html lang="${esc(book.language||'pt-BR')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(book.title)}</title><style>${readingCSS}
body{max-width:760px;margin:40px auto;padding:24px;color:#20202b} .book-title{text-align:center;margin-bottom:60px}.book-cover{display:block;max-width:100%;max-height:85vh;margin:0 auto 40px}section{break-before:page;margin-top:48px}img{max-width:100%}table{max-width:100%} @page{size:A4;margin:20mm} @media print{body{max-width:none;margin:0;padding:0}.book-title{break-after:page}section{margin-top:0}a{color:inherit}}
</style></head><body>${cover?sanitize('<img class="book-cover" src="'+esc(cover)+'" alt="Capa">'):''}<header class="book-title"><h1>${esc(book.title)}</h1><p>${esc(book.author||'')}</p></header>${book.chapters.map(c=>'<section aria-label="'+esc(c.name)+'">'+sanitize(c.html)+'</section>').join('')}</body></html>`;
}

export function bookText(book){
 const chapters=book.chapters.map(c=>{
  const doc=new DOMParser().parseFromString(sanitize(c.html),'text/html');
  doc.querySelectorAll('br').forEach(e=>e.replaceWith('\n'));
  doc.querySelectorAll('td,th').forEach(e=>e.append('\t'));
  doc.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre,tr,figure').forEach(e=>e.append('\n\n'));
  return c.name+'\n'+ '='.repeat(32)+'\n\n'+doc.body.textContent.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
 });
 return [book.title,book.author,...chapters].filter(Boolean).join('\n\n')+'\n';
}

export function printBook(book){
 const frame=document.createElement('iframe');
 frame.title='Impressão do livro';frame.style.cssText='position:fixed;width:1px;height:1px;bottom:0;left:0;border:0';
 frame.onload=async()=>{
  try{
   const win=frame.contentWindow;
   await Promise.all([...win.document.images].map(img=>img.decode?.().catch(()=>{})));
   await win.document.fonts.ready;
   win.addEventListener('afterprint',()=>frame.remove(),{once:true});
   win.focus();win.print();
  }catch{frame.remove();}
 };
 frame.srcdoc=bookHTML(book);document.body.append(frame);
}

export function installExportFormats({getBook,download,filename,exportEPUB,toast}){
 const dialog=document.createElement('dialog');dialog.id='exportdialog';
 dialog.innerHTML=`<div class="export-heading"><span class="eyebrow">PRONTO PARA COMPARTILHAR</span><h2>Seu livro, em mais lugares.</h2><p>Escolha o formato que combina com seu próximo passo.</p></div><div class="export-options"><button data-export="docx"><strong>DOCX <span>Word</span></strong><small>Documento editável com texto, imagens, listas e tabelas.</small></button><button data-export="doc"><strong>DOC <span>Word 97–2003</span></strong><small>Documento binário para versões antigas do Word.</small></button><button data-export="epub"><strong>EPUB <span>E-readers</span></strong><small>Livro adaptável, com imagens e capítulos.</small></button><button data-export="pdf"><strong>PDF <span>Impressão</span></strong><small>Abre a impressão: escolha “Salvar como PDF”.</small></button><button data-export="html"><strong>HTML <span>Web</span></strong><small>Documento com formatação e imagens para o navegador.</small></button><button data-export="txt"><strong>TXT <span>Texto</span></strong><small>Conteúdo em texto simples, sem imagens ou estilos.</small></button></div><div class="actions"><button id="closeexport">Voltar ao livro</button></div>`;
 document.body.append(dialog);
 document.getElementById('export').onclick=()=>dialog.showModal();
 document.getElementById('closeexport').onclick=()=>dialog.close();
 dialog.querySelectorAll('[data-export]').forEach(button=>button.onclick=async()=>{
  const format=button.dataset.export;
  if(format==='epub'){dialog.close();await exportEPUB();return;}
  try{
   const book=getBook();
   if(format==='doc'||format==='docx'){
    button.disabled=true;
    const {createWord}=await import('./word-formats.mjs');
    download(await createWord(book,format),filename()+'.'+format);
    toast(format.toUpperCase()+' exportado.');
   }
   else if(format==='pdf'){printBook(book);toast('Na impressão, escolha Salvar como PDF para gerar o arquivo.');}
   else download(new Blob([format==='html'?bookHTML(book):'\uFEFF'+bookText(book)],{type:format==='html'?'text/html;charset=utf-8':'text/plain;charset=utf-8'}),filename()+'.'+format);
   dialog.close();
  }catch(error){toast('Exportação: '+error.message);}finally{button.disabled=false;}
 });
}
