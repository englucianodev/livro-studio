import {parseHTML,escapeXML} from './book-tools.mjs';
import {formatChapterHTML} from './formatting.mjs';
export const PAGE={width:480,height:680};
// Split at a DOM text position so emphasis, links and inline formatting survive.
export function splitTextNode(block,offset){
 const doc=block.ownerDocument,walker=doc.createTreeWalker(block,4);let node,count=0,target;
 while((node=walker.nextNode())){if(count+node.textContent.length>=offset){target=node;break;}count+=node.textContent.length;}
 if(!target)return [block.cloneNode(true),null];const range=doc.createRange();range.selectNodeContents(block);range.setEnd(target,Math.max(0,offset-count));const left=block.cloneNode(false);left.append(range.cloneContents());range.selectNodeContents(block);range.setStart(target,Math.max(0,offset-count));const right=block.cloneNode(false);right.append(range.cloneContents());right.removeAttribute('id');right.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));return [left,right];
}
export async function paginateBook(book,{host,progress=()=>{}}={}){
 const owned=!host;if(!host){host=document.createElement('div');host.className='reader-measure';host.innerHTML='<div class="reader-page-body reading"></div>';document.body.append(host);host=host.firstElementChild;}
 const container=owned?host.parentElement:null,pages=[];let current=[],chapter=0;
 const flush=()=>{if(current.length){pages.push({chapter,title:book.chapters[chapter].name,html:current.map(e=>e.outerHTML).join('')});current=[];}host.replaceChildren();};
 const fits=node=>{host.append(node);const okay=host.scrollHeight<=host.clientHeight+1;node.remove();return okay;};
 try{
  await document.fonts?.ready;
  // Decode once before measuring. Browser caching prevents repeated image work.
  const images=new Set();for(const c of book.chapters)for(const img of parseHTML(c.html).querySelectorAll('img'))images.add(img.src);
  for(const src of images){if(typeof Image==='undefined')break;const img=new Image();img.src=src;try{await img.decode();}catch{}}
  for(chapter=0;chapter<book.chapters.length;chapter++){
   progress('Preparando páginas · capítulo '+(chapter+1)+'/'+book.chapters.length);const c=book.chapters[chapter],doc=parseHTML(formatChapterHTML(c.html,{name:c.name,chapters:book.chapters}));
   const queue=[...doc.body.childNodes].map(node=>{if(node.nodeType===1)return node.cloneNode(true);if(!node.textContent.trim())return null;const p=document.createElement('p');p.textContent=node.textContent;return p;}).filter(Boolean);
   let operations=0;
   while(queue.length){const node=queue.shift();if(++operations%30===0)await new Promise(resolve=>setTimeout(resolve,0));if(fits(node)){host.append(node);current.push(node);continue;}
    // Tables paginate by rows, with their column headings repeated.
    const rows=node.localName==='table'?[...node.querySelectorAll('tbody>tr')]:[];
    if(rows.length>1&&!node.querySelector('[rowspan]')){const slice=(from,to)=>{const table=node.cloneNode(true);table.querySelectorAll('tbody>tr').forEach((r,i)=>{if(i<from||i>=to)r.remove();});if(to<rows.length)table.querySelector('tfoot')?.remove();return table;};let low=0,high=rows.length-1;while(low<high){const mid=Math.ceil((low+high)/2);if(fits(slice(0,mid)))low=mid;else high=mid-1;}if(low){const left=slice(0,low);host.append(left);current.push(left);flush();queue.unshift(slice(low,rows.length));continue;}if(current.length){flush();queue.unshift(node);continue;}}
    const length=node.textContent.length;
    if(length>24&&!node.querySelector('img,table')&&!/^(h[1-6]|table|figure)$/.test(node.localName)){
     let low=0,high=length-1;while(low<high){const mid=Math.ceil((low+high)/2),[part]=splitTextNode(node,mid);if(fits(part))low=mid;else high=mid-1;}
     let cut=low;if(cut>24){const text=node.textContent,lastSpace=text.lastIndexOf(' ',cut);if(lastSpace>cut*.65)cut=lastSpace+1;const [left,right]=splitTextNode(node,cut);host.append(left);current.push(left);flush();if(right?.textContent.length)queue.unshift(right);continue;}
    }
    if(current.length){flush();queue.unshift(node);}else{node.classList.add('reader-oversize');host.append(node);current.push(node);flush();}
    if(++operations%20===0)await new Promise(resolve=>setTimeout(resolve,0));
   }
   flush();await new Promise(resolve=>setTimeout(resolve,0));
  }
  return pages.length?pages:[{chapter:0,title:book.title,html:'<p>Documento vazio.</p>'}];
 }finally{container?.remove();}
}
export function installReader({getBook,onEdit,toast}){
 const main=document.querySelector('.workspace'),edit=document.getElementById('editpane');
 const tabs=document.createElement('div');tabs.className='viewtabs';tabs.innerHTML='<button id="editview" aria-pressed="true">✎ Editar</button><button id="readview" aria-pressed="false">▤ Leitor de páginas</button>';main.querySelector('.badge').replaceWith(tabs);
 const pane=document.createElement('section');pane.id='readerpane';pane.hidden=true;pane.innerHTML=`
 <div class="reader-toolbar" role="toolbar" aria-label="Navegação do leitor">
 <div class="reader-group"><button id="readerprev" title="Página anterior" aria-label="Página anterior">←</button><label>Página <input id="readerpage" type="number" min="1" value="1" aria-label="Ir para página"></label><span id="readertotal">de 0</span><button id="readerjump">Ir</button><button id="readernext" title="Próxima página" aria-label="Próxima página">→</button></div>
 <label class="reader-group"><span class="sr-only">Modo de visualização</span><select id="readermode" aria-label="Modo de visualização"><option value="single">Uma página</option><option value="continuous" selected>Contínua · uma coluna</option><option value="spread">Contínua · lado a lado</option></select></label>
 <div class="reader-group"><button id="zoomout" aria-label="Diminuir zoom">−</button><label><input id="readerzoom" type="number" min="25" max="300" step="10" value="100" aria-label="Zoom em porcentagem">%</label><button id="zoomin" aria-label="Aumentar zoom">+</button><button id="fitwidth">Ajustar largura</button><button id="fitpage">Ajustar página</button></div>
 <button id="readeredit">Editar este capítulo</button></div>
 <div class="reader-find"><input id="readerquery" aria-label="Buscar no livro" placeholder="Buscar no livro"><button id="readerfind">Buscar</button><span id="readermessage" role="status"></span></div>
 <div id="readerviewport" tabindex="0" aria-label="Páginas do livro; use Page Up e Page Down para navegar"><div id="readerpages" class="reader-pages continuous"></div></div>
 <div class="reader-bottom"><span id="readerposition" aria-live="polite"></span><small>Páginas simuladas · a paginação do EPUB varia no Kindle</small></div>
 <nav id="readerthumbnails" aria-label="Prévia das páginas anteriores e seguintes"></nav>`;main.append(pane);
 const $=id=>document.getElementById(id),viewport=$('readerviewport'),pageList=$('readerpages');let pages=[],index=0,zoom=1,mode='continuous',fingerprint='',building=false,visible=false,searchAt=-1,scrollFrame;
 function showEdit(){visible=false;pane.hidden=true;edit.hidden=false;$('editview').setAttribute('aria-pressed','true');$('readview').setAttribute('aria-pressed','false');}
 function thumb(){const nav=$('readerthumbnails');nav.replaceChildren();for(let n=Math.max(0,index-2);n<=Math.min(pages.length-1,index+2);n++){const b=document.createElement('button');b.className='reader-thumb'+(n===index?' active':'');b.setAttribute('aria-label','Ir para página '+(n+1));b.setAttribute('aria-current',n===index?'page':'false');const small=document.createElement('div');small.className='thumb-paper';small.innerHTML='<div class="reader-page-body reading">'+pages[n].html+'</div>';b.append(small);const label=document.createElement('span');label.textContent='Página '+(n+1);b.append(label);b.onclick=()=>go(n);nav.append(b);}}
 function position(){if(!pages.length)return;$('readerpage').value=index+1;$('readerpage').max=pages.length;$('readertotal').textContent='de '+pages.length;$('readerprev').disabled=index===0;$('readernext').disabled=index===pages.length-1;$('readerposition').textContent='Página '+(index+1)+' de '+pages.length+' · '+pages[index].title;for(const wrapper of pageList.children)wrapper.classList.toggle('current',Number(wrapper.dataset.page)===index);thumb();}
 function renderPages(){pageList.className='reader-pages '+mode;pageList.style.setProperty('--page-width',PAGE.width*zoom+'px');pageList.style.setProperty('--page-height',PAGE.height*zoom+'px');pageList.replaceChildren();for(let n=0;n<pages.length;n++){if(mode==='single'&&n!==index)continue;const wrap=document.createElement('div');wrap.className='reader-page-wrap';wrap.dataset.page=n;const article=document.createElement('article');article.className='reader-page';article.style.transform='scale('+zoom+')';article.setAttribute('aria-label','Página '+(n+1));article.innerHTML='<div class="reader-page-body reading">'+pages[n].html+'</div><footer class="reader-page-number">'+(n+1)+'</footer>';article.querySelectorAll('img').forEach(i=>i.loading='lazy');wrap.append(article);pageList.append(wrap);}position();}
 function scrollToCurrent(){const target=pageList.querySelector('[data-page="'+index+'"]');if(target)viewport.scrollTop+=target.getBoundingClientRect().top-viewport.getBoundingClientRect().top-22;}
 function go(n){if(!pages.length)return;index=Math.max(0,Math.min(pages.length-1,Math.floor(Number(n)||0)));if(mode==='single')renderPages();else position();scrollToCurrent();}
 function setZoom(value){zoom=Math.max(.25,Math.min(3,(Number(value)||100)/100));$('readerzoom').value=Math.round(zoom*100);renderPages();scrollToCurrent();}
 async function open(){if(building)return;visible=true;edit.hidden=true;pane.hidden=false;$('editview').setAttribute('aria-pressed','false');$('readview').setAttribute('aria-pressed','true');const book=getBook(),next=JSON.stringify([book.title,book.chapters]);if(next!==fingerprint){building=true;$('readermessage').textContent='Preparando páginas…';$('readview').disabled=true;try{const nextPages=await paginateBook(book,{progress:t=>$('readermessage').textContent=t});pages=nextPages;fingerprint=next;index=Math.min(index,pages.length-1);renderPages();$('readermessage').textContent='Selecione texto para copiar; use Editar este capítulo para alterar.';}catch(e){toast('Não foi possível paginar: '+e.message);showEdit();}finally{building=false;$('readview').disabled=false;}}else renderPages();scrollToCurrent();}
 $('preview').textContent='▤ Leitor de páginas';$('preview').onclick=open;$('readview').onclick=open;$('editview').onclick=showEdit;$('readeredit').onclick=()=>{const chapter=pages[index]?.chapter||0;showEdit();onEdit(chapter);};
 $('readerjump').onclick=()=>go(Number($('readerpage').value)-1);$('readerpage').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go(Number($('readerpage').value)-1);}};
 $('readerprev').onclick=()=>go(index-1);$('readernext').onclick=()=>go(index+1);$('readerpage').onchange=()=>go(Number($('readerpage').value)-1);$('readermode').onchange=()=>{mode=$('readermode').value;renderPages();scrollToCurrent();};$('readerzoom').onchange=()=>setZoom($('readerzoom').value);$('zoomout').onclick=()=>setZoom(zoom*100-10);$('zoomin').onclick=()=>setZoom(zoom*100+10);$('fitwidth').onclick=()=>setZoom((viewport.clientWidth-64)/(mode==='spread'?PAGE.width*2+24:PAGE.width)*100);$('fitpage').onclick=()=>setZoom(Math.min((viewport.clientWidth-64)/(mode==='spread'?PAGE.width*2+24:PAGE.width),(viewport.clientHeight-44)/PAGE.height)*100);
 viewport.addEventListener('keydown',e=>{const keys={PageDown:()=>go(index+1),PageUp:()=>go(index-1),ArrowRight:()=>go(index+1),ArrowLeft:()=>go(index-1),Home:()=>go(0),End:()=>go(pages.length-1)};if(keys[e.key]){e.preventDefault();keys[e.key]();}});
 viewport.addEventListener('scroll',()=>{if(mode==='single'||scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;const row=Math.max(0,Math.floor((viewport.scrollTop+60)/(PAGE.height*zoom+24))),next=Math.min(pages.length-1,row*(mode==='spread'?2:1)+(mode==='spread'?index%2:0));if(next>=0&&next!==index){index=next;position();}});});
 viewport.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a)return;const href=a.getAttribute('href'),match=href.match(/^ch(\d+)\.xhtml/),fragment=href.includes('#')?href.slice(href.indexOf('#')+1):'';if(!match&&!fragment)return;e.preventDefault();let target=fragment?pages.findIndex(p=>parseHTML(p.html).getElementById(fragment)): -1;if(target<0&&match)target=pages.findIndex(p=>p.chapter===Number(match[1]));if(target>=0)go(target);});
 function find(){const query=$('readerquery').value.trim().toLocaleLowerCase();if(!query)return;for(let n=1;n<=pages.length;n++){const i=(searchAt+n)%pages.length;if(parseHTML(pages[i].html).body.textContent.toLocaleLowerCase().includes(query)){searchAt=i;go(i);$('readermessage').textContent='Encontrado na página '+(i+1)+'. Clique em Buscar para a próxima ocorrência em outra página.';return;}}$('readermessage').textContent='Texto não encontrado.';}
 $('readerfind').onclick=find;$('readerquery').oninput=()=>searchAt=-1;$('readerquery').onkeydown=e=>{if(e.key==='Enter')find();};
 return {open,showEdit,invalidate(){fingerprint='';if(visible)showEdit();},getState:()=>({pages,index,zoom,mode})};
}
