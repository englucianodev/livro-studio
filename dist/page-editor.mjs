import {paginateBook,PAGE} from './reader.mjs';
import {caretUnits,unitsLength,caretPoint} from './page-caret.mjs';
import {sanitize,parseHTML} from './book-tools.mjs';
import {parsePageSelection} from './structure.mjs';
// Reassemble split DOM nodes by provenance, never by matching their text.
function mergeNode(a,b){
 if(a.localName==='table'){
  for(const child of [...b.childNodes]){if(child.nodeType!==1){continue;}const key=child.getAttribute('data-page-node'),same=[...a.children].find(e=>key&&e.getAttribute('data-page-node')===key);
   if(same&&['thead','caption','colgroup'].includes(child.localName))continue;
   if(same)mergeNode(same,child);else a.append(child.cloneNode(true));}return;
 }
 for(const child of [...b.childNodes]){const last=a.lastChild,key=child.nodeType===1&&child.getAttribute('data-page-node');if(key&&last?.nodeType===1&&last.getAttribute('data-page-node')===key&&last.localName===child.localName)mergeNode(last,child);else a.append(child.cloneNode(true));}
}
export function joinEditingPageHTML(parts){
 const doc=parseHTML('');
 for(const p of parts)for(const node of [...parseHTML(p.html).body.childNodes]){const last=doc.body.lastChild,key=node.nodeType===1&&node.getAttribute('data-page-node');if(key&&last?.nodeType===1&&last.getAttribute('data-page-node')===key&&last.localName===node.localName)mergeNode(last,node);else doc.body.append(node.cloneNode(true));}
 return doc.body.innerHTML;
}
export function mergeEditingPages(book,pages,affected=new Set(book.chapters.map((_,i)=>i))){
 const result=structuredClone(book),mapping=new Map(),chapters=[];
 result.chapters.forEach((c,i)=>{if(!affected.has(i)){mapping.set(i,chapters.length);chapters.push(c);return;}const parts=pages.filter(p=>p.chapter===i);if(!parts.length)return;const doc=parseHTML('');
  doc.body.innerHTML=joinEditingPageHTML(parts);
  mapping.set(i,chapters.length);chapters.push({...c,html:sanitize(doc.body.innerHTML)});
 });
 result.chapters=chapters.length?chapters:[{name:'Documento vazio',html:'<p><br></p>'}];return {book:result,mapping};
}
export function installPageEditor({getBook,onCommit,onActive,tools,save,toast}){
 const $=id=>document.getElementById(id),edit=$('editpane'),canvas=edit.querySelector('.canvas'),canonical=$('editor');let pages=[],index=0,zoom=1,mode='continuous',visible=false,building=false,version=0,selected=new Set(),deletionUndo=null,baseline=new WeakMap(),scrollFrame,initialZoom=true;
 const section=document.createElement('section');section.id='pageediting';section.hidden=true;section.innerHTML=`<div class="editpage-toolbar" role="toolbar" aria-label="Edição de páginas"><div class="reader-group"><button id="editprev" aria-label="Página anterior na edição">← Anterior</button><label>Página <input id="editpagenumber" aria-label="Página de edição" type="number" min="1" value="1"></label><span id="editpagetotal"></span><button id="editpagejump">Ir</button><button id="editnext" aria-label="Próxima página na edição">Próxima →</button></div><select id="editpagemode" aria-label="Visualização na edição"><option value="single">Uma página</option><option value="continuous" selected>Rolagem contínua</option><option value="spread">Lado a lado · contínua</option></select><div class="reader-group"><button id="editzoomout" aria-label="Diminuir zoom da edição">−</button><input id="editzoom" aria-label="Zoom da edição" type="number" min="25" max="200" value="100"><span>%</span><button id="editzoomin" aria-label="Aumentar zoom da edição">＋</button><button id="editfit">Ajustar largura</button></div><button id="reflowpages">Reorganizar páginas</button><button id="plainediting">Texto corrido</button></div>
 <div class="editpage-selection"><button id="deletecurrentpage">Excluir página atual</button><input id="selectpagerange" aria-label="Selecionar páginas da edição" placeholder="Selecionar: 1-3, 5"><button id="selecteditpages">Selecionar</button><button id="deleteeditpages">Excluir selecionadas</button><button id="undoeditdelete" disabled>Desfazer exclusão</button><span id="editpageselection" role="status"></span></div>
 <div id="editpageviewport" tabindex="0" aria-label="Páginas editáveis"><div id="editpagecanvas" class="reader-pages continuous"></div></div><div class="reader-bottom"><span id="editpagestatus" role="status"></span><small>Texto com redistribuição automática · EPUB adaptável</small></div><nav id="editpagethumbs" aria-label="Miniaturas das páginas editáveis"></nav>`;edit.querySelector('.statusbar').before(section);
 const pageControls=section.querySelector('.editpage-toolbar');const controlRow=document.createElement('div');controlRow.className='editor-control-row';const formatTools=edit.querySelector('.toolbar');formatTools.before(controlRow);controlRow.append(formatTools,pageControls);
 const start=document.createElement('button');start.id='openpageediting';start.textContent='▤ Editar por páginas';edit.querySelector('.organizebar').append(start);
 const viewport=$('editpageviewport'),list=$('editpagecanvas');
 let reflowTimer,autoGeneration=0,composing=false,documentHistory=[],historyIndex=-1,restoringHistory=false;
 const signature=()=>JSON.stringify(getBook().chapters);
 function cancelReflow(){clearTimeout(reflowTimer);autoGeneration++;}
 function bookmarkPoint(node,offset){
  const body=(node.nodeType===1?node:node.parentElement)?.closest('.editable-page-body');
  if(!body||!list.contains(body))return null;
  const n=Number(body.dataset.page),chapter=pages[n]?.chapter;if(chapter==null)return null;
  const prefix=body.ownerDocument.createRange();prefix.selectNodeContents(body);prefix.setEnd(node,offset);
  const partial=document.createElement('div');partial.append(prefix.cloneContents());
  const parts=pages.slice(0,n).filter(p=>p.chapter===chapter).map(p=>({...p,chapter:0}));
  parts.push({chapter:0,html:partial.innerHTML});
  const merged=mergeEditingPages({chapters:[getBook().chapters[chapter]]},parts).book.chapters[0].html;
  return {chapter,offset:unitsLength(caretUnits(parseHTML(merged).body)),affinity:offset===0?'forward':'backward'};
 }
 function captureBookmark(){
  const selection=window.getSelection();if(!selection?.rangeCount)return null;
  const anchor=bookmarkPoint(selection.anchorNode,selection.anchorOffset),focus=bookmarkPoint(selection.focusNode,selection.focusOffset);
  return anchor&&focus?{anchor,focus}:null;
 }
 function locate(point){
  let remaining=point.offset,last=null;const seen=new Set();
  for(let n=0;n<pages.length;n++)if(pages[n].chapter===point.chapter){
   const before=new Set(seen),length=unitsLength(caretUnits(parseHTML(pages[n].html).body,seen));last={index:n,offset:length,seen:before};
   if(remaining<length||remaining===length&&point.affinity!=='forward')return {index:n,offset:remaining,seen:before};
   remaining-=length;
  }
  return last;
 }
 function restoreBookmark(bookmark,focusEditor=true){
  if(!bookmark)return;const anchor=locate(bookmark.anchor),focus=locate(bookmark.focus);if(!anchor||!focus)return;
  const body=list.querySelector('.editable-page-body[data-page="'+focus.index+'"]');if(!body)return;
  const anchorBody=list.querySelector('.editable-page-body[data-page="'+anchor.index+'"]')||body;
  const a=caretPoint(anchorBody,anchorBody===body&&anchor.index!==focus.index?focus.offset:anchor.offset,bookmark.anchor.affinity,anchor.seen);
  const f=caretPoint(body,focus.offset,bookmark.focus.affinity,focus.seen);
  if(focusEditor)body.focus({preventScroll:true});
  const selection=window.getSelection();selection.setBaseAndExtent(a.node,a.offset,f.node,f.offset);activate(focus.index,body);
 }
 function resetDocumentHistory(){documentHistory=[{book:structuredClone(getBook()),signature:signature(),bookmark:captureBookmark()}];historyIndex=0;}
 function recordDocument(){
  if(restoringHistory||!visible||building)return;
  const current=signature();if(documentHistory[historyIndex]?.signature===current)return;
  documentHistory=documentHistory.slice(0,historyIndex+1);documentHistory.push({book:structuredClone(getBook()),signature:current,bookmark:captureBookmark()});historyIndex++;
  while(documentHistory.length>30||documentHistory.length>2&&documentHistory.reduce((n,h)=>n+h.signature.length,0)>20000000){documentHistory.shift();historyIndex--;}
 }
 tools.setPageHistory({record:recordDocument,async undo(delta){
  if(building||restoringHistory)return;const next=historyIndex+delta;if(next<0||next>=documentHistory.length)return;
  cancelReflow();restoringHistory=true;historyIndex=next;const state=documentHistory[next];onCommit(structuredClone(state.book));
  try{await open(undefined,{skipFlush:true,bookmark:state.bookmark,keepHistory:true});save();}finally{restoringHistory=false;}
 }});
 function scheduleReflow(){
  cancelReflow();if(!visible||building||composing)return;const generation=autoGeneration;
  reflowTimer=setTimeout(async()=>{
   if(generation!==autoGeneration||!visible||building||composing||edit.hidden)return;
   // Do not steal focus from metadata, dialogs or another tool.
   if(!document.activeElement?.closest('.editable-page-body'))return;
   const book=structuredClone(getBook()),before=signature();
   try{
    const next=await paginateBook(book,{editable:true});
    if(generation!==autoGeneration||!visible||building||composing||edit.hidden||before!==signature()||!document.activeElement?.closest('.editable-page-body'))return;
    const bookmark=captureBookmark(),selection=window.getSelection(),oldTop=selection?.rangeCount?selection.getRangeAt(0).getBoundingClientRect().top:null;
    pages=next;const location=bookmark&&locate(bookmark.focus);index=location?.index??Math.min(index,pages.length-1);selected.clear();
    render();restoreBookmark(bookmark);
    const newSelection=window.getSelection();if(oldTop!=null&&newSelection?.rangeCount){const newTop=newSelection.getRangeAt(0).getBoundingClientRect().top;viewport.scrollTop+=newTop-oldTop;}
   }catch(error){toast('Não foi possível redistribuir o texto: '+error.message);}
  },220);
 }
 function beforePageInput(event,body){
  if(building||event.isComposing)return;
  const bookmark=captureBookmark();if(documentHistory[historyIndex])documentHistory[historyIndex].bookmark=bookmark;
  if(!['deleteContentBackward','deleteContentForward'].includes(event.inputType))return;
  const selection=window.getSelection();if(!selection?.isCollapsed||!body.contains(selection.anchorNode))return;
  const prefix=document.createRange();prefix.selectNodeContents(body);prefix.setEnd(selection.anchorNode,selection.anchorOffset);
  const offset=unitsLength(caretUnits(prefix.cloneContents())),length=unitsLength(caretUnits(body)),backward=event.inputType==='deleteContentBackward',n=Number(body.dataset.page),other=backward?n-1:n+1;
  const edge=document.createRange();edge.selectNodeContents(body);if(backward)edge.setEnd(selection.anchorNode,selection.anchorOffset);else edge.setStart(selection.anchorNode,selection.anchorOffset);
  const fragment=edge.cloneContents(),visualEdge=!fragment.textContent.trim()&&!fragment.querySelector('img,table,hr,br');
  if((backward?offset!==0:offset!==length)&&!visualEdge||!pages[other]||pages[other].chapter!==pages[n].chapter)return;
  event.preventDefault();cancelReflow();flush();const first=Math.min(n,other),chapter=pages[n].chapter;
  const pair=pages.slice(first,first+2),merged=joinEditingPageHTML(pair);
  const localOffset=backward?unitsLength(caretUnits(parseHTML(pair[0].html).body)):offset;
  pages.splice(first,2,{...pair[0],html:merged});index=first;render();
  const target=list.querySelector('.editable-page-body[data-page="'+first+'"]'),point=caretPoint(target,localOffset,backward?'forward':'backward');
  target.focus({preventScroll:true});selection.setBaseAndExtent(point.node,point.offset,point.node,point.offset);
  document.execCommand(backward?'delete':'forwardDelete');save();scheduleReflow();
 }
 list.addEventListener('compositionstart',()=>{composing=true;cancelReflow();});
 list.addEventListener('compositionend',()=>{composing=false;save();scheduleReflow();});
 function flush(){if(!visible||building)return;const affected=new Set();for(const body of list.querySelectorAll('.editable-page-body')){const n=Number(body.dataset.page),html=body.innerHTML;if(pages[n]&&html!==baseline.get(body)){pages[n].html=html;baseline.set(body,html);affected.add(pages[n].chapter);}}
  if(affected.size){const next=mergeEditingPages(getBook(),pages,affected);onCommit(next.book);scheduleReflow();deletionUndo=null;$('undoeditdelete').disabled=true;} }
 function activate(n,target){index=Math.max(0,Math.min(pages.length-1,n));const body=target||list.querySelector('.editable-page-body[data-page="'+index+'"]');if(body){tools.setTarget(body);onActive(pages[index].chapter);}position();}
 function thumbs(){const nav=$('editpagethumbs');nav.replaceChildren();for(let n=Math.max(0,index-2);n<=Math.min(pages.length-1,index+2);n++){const b=document.createElement('button');b.className='reader-thumb'+(n===index?' active':'');b.setAttribute('aria-label','Editar página '+(n+1));const miniature=document.createElement('div');miniature.className='thumb-paper';miniature.innerHTML='<div class="reader-page-body reading">'+sanitize(pages[n].html)+'</div>';b.append(miniature);const label=document.createElement('span');label.textContent='Página '+(n+1);b.append(label);b.onclick=()=>go(n);nav.append(b);}}
 function position(){if(!pages.length)return;$('editpagenumber').value=index+1;$('editpagenumber').max=pages.length;$('editpagetotal').textContent='de '+pages.length;$('editprev').disabled=index===0;$('editnext').disabled=index===pages.length-1;$('editpagestatus').textContent='Editando página '+(index+1)+' de '+pages.length+' · '+pages[index].title;$('editpageselection').textContent=selected.size+' selecionada(s)';$('deleteeditpages').disabled=!selected.size;for(const wrap of list.children){const n=Number(wrap.dataset.page);wrap.classList.toggle('current',n===index);wrap.classList.toggle('page-selected',selected.has(n));const check=wrap.querySelector('.page-select');if(check)check.checked=selected.has(n);}thumbs();}
 function render(){tools.setTarget(canonical);list.replaceChildren();list.className='reader-pages '+mode;list.style.setProperty('--page-width',PAGE.width*zoom+'px');list.style.setProperty('--page-height',PAGE.height*zoom+'px');for(let n=0;n<pages.length;n++){if(mode==='single'&&n!==index)continue;const wrap=document.createElement('div');wrap.className='reader-page-wrap';wrap.dataset.page=n;const article=document.createElement('article');article.className='reader-page';article.style.transform='scale('+zoom+')';article.innerHTML='<div class="reader-page-body reading editable-page-body" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Conteúdo da página '+(n+1)+'" data-page="'+n+'">'+pages[n].html+'</div><footer class="reader-page-number">'+(n+1)+'</footer>';const body=article.firstElementChild;baseline.set(body,body.innerHTML);body.addEventListener('focus',()=>activate(n,body));body.addEventListener('pointerdown',()=>{if(index!==n)flush();activate(n,body);});body.addEventListener('beforeinput',event=>beforePageInput(event,body));body.addEventListener('input',event=>{save();if(!event.isComposing)scheduleReflow();});body.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));save();});const label=document.createElement('label');label.className='page-select-label';label.innerHTML='<input class="page-select" type="checkbox" aria-label="Selecionar página '+(n+1)+'"> '+(n+1);label.querySelector('input').onchange=e=>{e.target.checked?selected.add(n):selected.delete(n);position();};wrap.append(article,label);list.append(wrap);}activate(index);}
 function scrollCurrent(){const target=list.querySelector('[data-page="'+index+'"]');if(target)viewport.scrollTop+=target.getBoundingClientRect().top-viewport.getBoundingClientRect().top-25;}
 function go(n){if(building)return;flush();index=Math.max(0,Math.min(pages.length-1,Math.floor(Number(n)||0)));if(mode==='single')render();else activate(index);scrollCurrent();}
 function busy(state){list.inert=state;edit.querySelector('.toolbar').inert=state;edit.querySelector('.advanced-tools').inert=state;$('editpagemode').disabled=state;$('deletecurrentpage').disabled=state;$('selecteditpages').disabled=state;$('reflowpages').disabled=state;}
 function plain(){cancelReflow();version++;flush();busy(false);visible=false;section.hidden=true;pageControls.hidden=true;canvas.hidden=false;tools.setTarget(canonical);start.hidden=false;}
 async function open(chapter,{skipFlush=false,bookmark=null,keepHistory=false}={}){if(building)return;cancelReflow();if(!skipFlush)flush();const generation=++version;building=true;busy(true);tools.setTarget(canonical);canvas.hidden=true;section.hidden=false;pageControls.hidden=false;start.hidden=true;visible=true;$('editpagestatus').textContent='Organizando páginas…';try{const next=await paginateBook(getBook(),{editable:true,progress:t=>$('editpagestatus').textContent=t});if(generation!==version)return;pages=next;const first=Number.isInteger(chapter)?pages.findIndex(p=>p.chapter===chapter):-1;index=first>=0?first:Math.min(index,pages.length-1);selected.clear();if(initialZoom){zoom=Math.max(.25,Math.min(1.5,(viewport.clientWidth-48)/PAGE.width));$('editzoom').value=Math.round(zoom*100);initialZoom=false;}if(bookmark){const location=locate(bookmark.focus);if(location)index=location.index;}render();busy(false);if(bookmark)restoreBookmark(bookmark);if(!keepHistory&&documentHistory[historyIndex]?.signature!==signature())resetDocumentHistory();scrollCurrent();}catch(e){plain();toast('Não foi possível organizar as páginas: '+e.message);}finally{if(generation===version){building=false;busy(false);}}}
 function remove(numbers){if(building)return;flush();const removeSet=new Set(numbers.filter(n=>n>=0&&n<pages.length));if(!removeSet.size)return;deletionUndo={book:structuredClone(getBook()),pages:structuredClone(pages),index};const affected=new Set([...removeSet].map(n=>pages[n].chapter)),remaining=pages.filter((_,n)=>!removeSet.has(n)),result=mergeEditingPages(getBook(),remaining,affected);pages=remaining.map(p=>({...p,chapter:result.mapping.get(p.chapter)??p.chapter}));onCommit(result.book);if(!pages.length)pages=[{chapter:0,title:result.book.chapters[0].name,html:'<p><br></p>'}];index=Math.min(index,pages.length-1);selected.clear();render();save();deletionUndo.after=JSON.stringify(getBook());$('undoeditdelete').disabled=false;toast(removeSet.size+' página(s) excluída(s). Use Desfazer exclusão para restaurar.');}
 start.onclick=()=>open();$('plainediting').onclick=plain;$('reflowpages').onclick=()=>{flush();deletionUndo=null;$('undoeditdelete').disabled=true;open();};$('editprev').onclick=()=>go(index-1);$('editnext').onclick=()=>go(index+1);$('editpagejump').onclick=()=>go(Number($('editpagenumber').value)-1);$('editpagenumber').onkeydown=e=>{if(e.key==='Enter')go(Number(e.target.value)-1);};$('editpagemode').onchange=()=>{flush();mode=$('editpagemode').value;render();scrollCurrent();};
 function scale(value){flush();zoom=Math.max(.25,Math.min(2,(Number(value)||100)/100));$('editzoom').value=Math.round(zoom*100);render();scrollCurrent();} $('editzoom').onchange=()=>scale($('editzoom').value);$('editzoom').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();scale(e.target.value);}};$('editzoomout').onclick=()=>scale(zoom*100-10);$('editzoomin').onclick=()=>scale(zoom*100+10);$('editfit').onclick=()=>scale((viewport.clientWidth-70)/(mode==='spread'?PAGE.width*2+24:PAGE.width)*100);
 $('deletecurrentpage').onclick=()=>remove([index]);$('selecteditpages').onclick=()=>{try{selected=new Set(parsePageSelection($('selectpagerange').value,pages.length));position();}catch(e){toast(e.message);}};$('deleteeditpages').onclick=()=>remove([...selected]);$('undoeditdelete').onclick=()=>{flush();if(!deletionUndo)return;if(deletionUndo.after!==JSON.stringify(getBook())){deletionUndo=null;$('undoeditdelete').disabled=true;toast('O projeto foi alterado depois da exclusão. Para preservar as novas edições, o desfazer anterior foi encerrado.');return;}const state=deletionUndo;deletionUndo=null;onCommit(state.book);pages=state.pages;index=state.index;selected.clear();render();save();$('undoeditdelete').disabled=true;toast('Páginas restauradas.');};
 viewport.addEventListener('scroll',()=>{if(mode==='single'||scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;const columns=mode==='spread'?2:1,n=Math.min(pages.length-1,Math.max(0,Math.floor((viewport.scrollTop+50)/(PAGE.height*zoom+24)))*columns+(columns===2?index%2:0));if(n!==index&&n>=0){index=n;position();}});});
 return {open,flush,plain,reflow(){if(visible){flush();open();}},invalidate(){cancelReflow();version++;building=false;busy(false);visible=false;section.hidden=true;pageControls.hidden=true;canvas.hidden=false;start.hidden=false;tools.setTarget(canonical);pages=[];selected.clear();deletionUndo=null;$('undoeditdelete').disabled=true;},getState:()=>({pages,index,mode,visible})};
}
