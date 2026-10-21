import {installPageEditor} from './page-editor.mjs';
import {installResizableLayout} from './resizable-layout.mjs';
import {installReader} from './reader.mjs';
import {installEditorTools} from './editor-tools.mjs';
import {formatChapterHTML} from './formatting.mjs';
import {mergeBooks,countHeadings,buildPDFChapters} from './structure.mjs';
import {installEditionUI} from './edition-ui.mjs';
import {sanitize,escapeXML as esc,organizeHTML,textToHTML,validateBook,readingCSS,findPageArtifacts,cleanPageArtifactsHTML} from './book-tools.mjs';
import {importFile,createEPUB} from './importers.mjs';
const $=id=>document.getElementById(id);
const mediaOptions=document.createElement('label');mediaOptions.style.cssText='display:block;margin:12px 0;font-size:12px';mediaOptions.innerHTML='Imagens no EPUB<select id="imagepreset" aria-label="Qualidade das imagens" style="display:block;width:100%;margin-top:6px;padding:8px"><option value="light">Leve · arquivos menores</option><option value="balanced" selected>Equilibrado · recomendado</option><option value="detailed">Mais detalhes · arquivo maior</option></select><small>Texto justificado e fonte uniforme. Figuras centralizadas; tabelas de PDF preservadas como imagens. Reimporte PDFs antigos para recuperar figuras.</small>';$('covermanager').closest('.covercard').before(mediaOptions);
const initial=()=>({title:'Meu primeiro livro',author:'',language:'pt-BR',chapters:[{name:'Primeiras páginas',html:'<h1>Um novo capítulo começa aqui.</h1><p>Todo livro começa com uma ideia. Uma frase que ficou na memória, um texto que merece ser relido ou uma história esperando para ganhar forma.</p><p>Este é o seu espaço para reunir essas palavras. Você pode escrever aqui, colar trechos ou importar um PDF, EPUB, MOBI ou AZW sem DRM para começar.</p><blockquote>Há sempre um livro esperando para nascer das palavras que guardamos.</blockquote><h2>Uma leitura que acompanha você</h2><p>Organize suas ideias em capítulos e use Organizar texto para revisar quebras de linha e parágrafos. Quando estiver pronto, exporte em EPUB para enviar ao Kindle.</p>'}]});
let pendingImports=[],importBusy=false;
let book=initial(),active=0,db=null,persistTimer,revision=0,pendingImport=null,organization=null,undoOrganization=null,undoFingerprint='';
function toast(t){$('toast').textContent=t;$('toast').style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('toast').style.display='none',6500);}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('livrostudio-books',1);r.onupgradeneeded=()=>r.result.createObjectStore('books');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function databaseRead(){return new Promise((resolve,reject)=>{const r=db.transaction('books').objectStore('books').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function databaseWrite(value){return new Promise((resolve,reject)=>{const tx=db.transaction('books','readwrite');tx.objectStore('books').put(value,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function persist(snapshot,version){try{if(db)await databaseWrite(snapshot);else localStorage.setItem('livrostudio-v1',JSON.stringify(snapshot));if(version===revision)$('saved').textContent='✓ Salvo neste navegador';}catch{$('saved').textContent='Não salvo — baixe um backup';toast('Não foi possível salvar no navegador. Baixe um backup para preservar suas alterações.');}}
function capture(){pageEditing?.flush();book.imagePreset=$('imagepreset').value;book.fileName=$('exportfilename').value;book.title=$('title').value;book.author=$('author').value;book.language=book.language||'pt-BR';book.chapters[active].html=$('editor').innerHTML;}
function save(){capture();editorTools?.record();revision++;$('saved').textContent='Salvando…';clearTimeout(persistTimer);const snapshot=structuredClone(book),version=revision;persistTimer=setTimeout(()=>persist(snapshot,version),250);update();}
function wordCount(html){const d=new DOMParser().parseFromString(html,'text/html');d.querySelectorAll('br').forEach(e=>e.replaceWith(' '));d.querySelectorAll('p,div,h1,h2,h3,li,blockquote').forEach(e=>e.append(' '));return d.body.textContent.trim().split(/\s+/).filter(Boolean).length;}
function update(){const t=$('editor').innerText.trim();$('counts').textContent=`${t?t.split(/\s+/).length:0} palavras · ${book.chapters.length} capítulo${book.chapters.length>1?'s':''}`;$('statuslanguage').textContent='EPUB 3';}
function render(){ pageEditing?.invalidate();reader?.invalidate();$('imagepreset').value=book.imagePreset||'balanced';$('title').value=book.title;$('exportfilename').value=book.fileName||book.title;$('author').value=book.author;$('editor').innerHTML=sanitize(book.chapters[active].html);editorTools?.reset();$('current').textContent=book.chapters[active].name;$('chapterlabel').textContent='CAPÍTULO '+String(active+1).padStart(2,'0');renderChapterList();update();editionUI?.render();pageEditing?.open(active);}
function renderChapterList(){$('chapters').replaceChildren();book.chapters.forEach((c,i)=>{const row=document.createElement('div');row.className='chapter'+(i===active?' active':'');const n=document.createElement('span');n.textContent=String(i+1).padStart(2,'0');const b=document.createElement('button');b.className='chapterselect';b.textContent=c.name;b.title='Abrir '+c.name;b.onclick=()=>{save();active=i;render();};const rename=document.createElement('button');rename.textContent='✎';rename.title='Renomear capítulo';rename.onclick=()=>{capture();const name=prompt('Nome do capítulo',c.name);if(name?.trim()){c.name=name.trim();render();save();}};row.append(n,b,rename);if(book.chapters.length>1){const del=document.createElement('button');del.textContent='×';del.title='Excluir capítulo';del.onclick=()=>{if(confirm('Excluir este capítulo?')){capture();book.chapters.splice(i,1);active=Math.min(active,book.chapters.length-1);render();save();}};row.append(del);}$('chapters').append(row);});}
$('editor').oninput=save;for(const id of ['title','author','exportfilename','imagepreset'])$(id).oninput=save;
$('add').onclick=()=>{capture();book.chapters.push({name:'Novo capítulo',html:'<h1>Novo capítulo</h1><p><br></p>'});active=book.chapters.length-1;render();save();$('editor').focus();};
document.querySelectorAll('[data-cmd]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{$('editor').focus();document.execCommand(b.dataset.cmd);save();};});
$('format').onchange=()=>{$('editor').focus();document.execCommand('formatBlock',false,$('format').value);save();};$('clean').onmousedown=e=>e.preventDefault();$('clean').onclick=()=>{document.execCommand('removeFormat');save();};
$('editor').addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));save();});
$('paste').onclick=()=>$('pastedialog').showModal();$('insertpaste').onclick=()=>{const text=$('pastetext').value;if(!text.trim())return;$('pastedialog').close();editorTools.insertHTML(textToHTML(text,{reconstruct:false,headings:false}));$('pastetext').value='';$('pastedialog').close();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const filename=()=>(book.fileName||book.title).replace(/\.(epub|pdf|azw3?|mobi|txt|json)$/i,'').replace(/[^\p{L}\p{N} _-]/gu,'').trim()||'meu-livro';
$('backup').onclick=()=>{capture();download(new Blob([JSON.stringify(book,null,2)],{type:'application/json'}),filename()+'.json');};
$('backupbeforeimport').onclick=()=>$('backup').click();
function invalidateUndo(){undoOrganization=null;$('undoorganize').disabled=true;}
$('restore').onclick=()=>$('backupfile').click();$('backupfile').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;const data=validateBook(JSON.parse(await f.text()));if(!confirm('Substituir o livro atual pelo backup? Salve um backup do livro atual antes, se necessário.'))return;book=data;active=0;invalidateUndo();render();save();toast('Backup restaurado.');}catch(err){toast(err.message);}finally{e.target.value='';}};
$('new').onclick=()=>{if(confirm('Criar outro livro? Exporte um backup antes de substituir o atual.')){book={title:'Livro sem título',author:'',language:'pt-BR',chapters:[{name:'Capítulo 1',html:'<h1>Capítulo 1</h1><p><br></p>'}]};active=0;invalidateUndo();render();save();}};
function renderImportQueue(){
    $('importqueue').replaceChildren();
    pendingImports.forEach((item,i)=>{const row=document.createElement('div');row.className='queuerow';const select=document.createElement('button');select.textContent=(i+1)+'. '+item.inputName+' · '+item.chapters.length+' seções';select.className=item===pendingImport?'selected':'';select.onclick=()=>{pendingImport=item;renderImportSummary();};row.append(select);
        for(const [delta,label]of [[-1,'↑'],[1,'↓']]){const btn=document.createElement('button');btn.textContent=label;btn.title='Mover arquivo '+(delta<0?'para cima':'para baixo');btn.disabled=i+delta<0||i+delta>=pendingImports.length;btn.onclick=()=>{[pendingImports[i],pendingImports[i+delta]]=[pendingImports[i+delta],pendingImports[i]];renderImportSummary();};row.append(btn);}
        const remove=document.createElement('button');remove.textContent='×';remove.title='Remover arquivo da importação';remove.onclick=()=>{pendingImports.splice(i,1);pendingImport=pendingImports[0];if(!pendingImport)$('importdialog').close();else renderImportSummary();};row.append(remove);$('importqueue').append(row);
    });
    $('importtotals').textContent=`${pendingImports.length} arquivo(s) · ${pendingImports.reduce((n,b)=>n+b.chapters.length,0)} seções · ${pendingImports.reduce((n,b)=>n+countHeadings(b.chapters),0)} títulos · ${pendingImports.reduce((n,b)=>n+(b.sources||[]).reduce((m,s)=>m+s.pages.filter(p=>!p.excluded).length,0),0)} páginas de PDF`;
}
function renderImportSummary(){
    if(!pendingImport)return;const alternative=pendingImport.pdfAlternatives;
    $('pdfcleanupsettings').hidden=!alternative;
    if(alternative){
        $('pdfremovemargins').checked=pendingImport.removeMargins!==false;
        const sources=pendingImport.sources||[];sources.forEach(s=>s.removeMargins=pendingImport.removeMargins!==false);
        pendingImport.chapters=sources.length?sources.flatMap(s=>buildPDFChapters(s).chapters):pendingImport.removeMargins===false?alternative.original:alternative.cleaned;
        $('pdfremoved').replaceChildren();for(const entry of alternative.removed){const li=document.createElement('li');li.textContent=`Página ${entry.page} · ${entry.kind}: ${entry.text}`;$('pdfremoved').append(li);}
        $('pdfbefore').innerHTML=alternative.original.map(c=>sanitize(c.html)).join('<hr>');$('pdfafter').innerHTML=pendingImport.chapters.map(c=>sanitize(c.html)).join('<hr>');
        $('pdfremovalstatus').textContent=pendingImport.removeMargins!==false?`${alternative.removed.length} trechos serão excluídos.`:'As margens originais serão mantidas.';
    }
    $('importcoverpanel').hidden=!pendingImport.cover;$('useimportcover').checked=pendingImport.useCover!==false;if(pendingImport.cover)$('importcoverimage').src=pendingImport.cover.data;
    const panel=$('importsummary');panel.replaceChildren();const title=document.createElement('h3');title.textContent=pendingImport.title;panel.append(title);const summary=document.createElement('p');summary.textContent=`${pendingImport.chapters.length} seções · ${countHeadings(pendingImport.chapters)} títulos · ${pendingImport.chapters.reduce((n,c)=>n+wordCount(c.html),0).toLocaleString('pt-BR')} palavras`;panel.append(summary);
    for(const note of pendingImport.notes||[]){const p=document.createElement('p');p.textContent=note;panel.append(p);}
    $('importchapterlist').replaceChildren();for(const c of pendingImport.chapters){const li=document.createElement('li');li.textContent=c.name;$('importchapterlist').append(li);}
    renderImportQueue();
}
$('pdfremovemargins').onchange=()=>{pendingImport.removeMargins=$('pdfremovemargins').checked;renderImportSummary();};$('useimportcover').onchange=()=>{pendingImport.useCover=$('useimportcover').checked;};
async function processFiles(files){
    if(importBusy){toast('Aguarde a importação atual terminar.');return;}if(!files.length)return;importBusy=true;const btn=$('import');btn.disabled=true;$('importprogress').hidden=false;
    if(!$('importdialog').open){pendingImports=[];pendingImport=null;}
    const failures=[];
    try{for(const [index,file]of [...files].entries())try{
        const item=await importFile(file,msg=>{btn.textContent=msg;$('importprogress').textContent=`Arquivo ${index+1}/${files.length}: ${msg}`;});item.inputName=file.name;item.fileName=file.name.replace(/\.[^.]+$/,'');pendingImports.push(item);pendingImport=item;
    }catch(e){failures.push(file.name+': '+e.message);}
    if(pendingImports.length){renderImportSummary();if(!$('importdialog').open)$('importdialog').showModal();}
    $('importfailures').textContent=failures.join('\n');if(failures.length)toast(pendingImports.length?'Alguns arquivos não foram importados. Confira a lista de erros no resumo.':failures.join(' · '));
    }finally{importBusy=false;btn.disabled=false;btn.textContent='+ Importar arquivos';$('importprogress').hidden=true;}
}
$('import').onclick=()=>$('file').click();$('addimportfiles').onclick=()=>$('file').click();$('file').onchange=async e=>{await processFiles([...e.target.files]);e.target.value='';};
const dropzone=$('dropzone');for(const type of ['dragenter','dragover'])dropzone.addEventListener(type,e=>{e.preventDefault();dropzone.classList.add('dragactive');});dropzone.addEventListener('dragleave',()=>dropzone.classList.remove('dragactive'));dropzone.addEventListener('drop',e=>{e.preventDefault();dropzone.classList.remove('dragactive');processFiles([...e.dataTransfer.files]);});
window.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('Files'))e.preventDefault();});window.addEventListener('drop',e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();if(!dropzone.contains(e.target))processFiles([...e.dataTransfer.files]);}});
function commitImport(replace){if(!pendingImports.length)return;capture();const batch=mergeBooks(pendingImports.map(b=>({...b,coverOptions:[...b.coverOptions||[],b.cover].filter(Boolean),cover:b.useCover===false?null:b.cover})));const previous=structuredClone(book);const base=replace?0:book.chapters.length;book=validateBook(replace?batch:mergeBooks([book,batch]));active=base;undoOrganization=previous;render();save();undoFingerprint=JSON.stringify(book);$('undoorganize').disabled=false;pendingImports=[];pendingImport=null;$('importdialog').close();toast('Projeto atualizado com '+book.chapters.length+' seções. Confira capítulos e capa antes de exportar.');}
$('replaceimport').onclick=()=>{if(!confirm('Substituir o livro atual pelos arquivos selecionados? Você pode salvar um backup antes e desfazer a última operação.'))return;commitImport(true);};$('appendimport').onclick=()=>commitImport(false);
function organizationOptions(){return {reconstruct:$('reconstruct').checked,hyphens:$('repairhyphens').checked,headings:$('detectheadings').checked,preservePoetry:$('preservelines').checked};}
function selectedArtifactPhrases(){return [...$('artifactcandidates').querySelectorAll('input:checked')].map(e=>e.value).concat($('artifactphrases').value.split('\n').map(s=>s.trim()).filter(Boolean));}
function previewOrganization(){
    capture();const indices=$('organizescope').value==='all'?book.chapters.map((_,i)=>i):[active],opts=organizationOptions();
    const result=indices.map(i=>{
        const cleanup=$('removeartifacts').checked?cleanPageArtifactsHTML(book.chapters[i].html,{pageNumbers:$('removepagenumbers').checked,phrases:selectedArtifactPhrases(),inline:$('removeinlineartifacts').checked,preservePoetry:opts.preservePoetry,hyphens:opts.hyphens}):{html:book.chapters[i].html,removed:[],stats:{joins:0,hyphens:0}};
        const organized=organizeHTML(cleanup.html,opts);organized.stats.joins+=cleanup.stats.joins;organized.stats.hyphens+=cleanup.stats.hyphens;
        return {i,...organized,removed:cleanup.removed};
    });
    organization=result;
    const sum=result.reduce((s,r)=>{for(const k in s)s[k]+=r.stats[k];return s;},{breaks:0,joins:0,hyphens:0,headings:0,spaces:0});
    $('organizesummary').textContent=`${result.length} capítulo(s) · ${result.reduce((n,r)=>n+r.removed.length,0)} elementos de página removidos · ${sum.breaks} quebras de linha · ${sum.joins} junções de parágrafos · ${sum.hyphens} hifens · ${sum.headings} títulos`;
    $('artifactremovals').replaceChildren();for(const r of result)for(const text of r.removed){const li=document.createElement('li');li.textContent=book.chapters[r.i].name+': '+text;$('artifactremovals').append(li);}
    $('beforeorganize').innerHTML=sanitize(book.chapters[active].html);$('afterorganize').innerHTML=result.find(r=>r.i===active)?.html||sanitize(book.chapters[active].html);$('organizechapter').textContent='Prévia do capítulo: '+book.chapters[active].name;$('applyorganize').disabled=!result.some(r=>r.html!==book.chapters[r.i].html);
}
$('organize').onclick=()=>{
    capture();$('artifactcandidates').replaceChildren();
    for(const candidate of findPageArtifacts(book.chapters)){const label=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=candidate.text;checkbox.onchange=previewOrganization;label.append(checkbox,document.createTextNode(' '+candidate.text+' ('+candidate.count+' ocorrências)'));$('artifactcandidates').append(label);}
    if(!$('artifactcandidates').children.length)$('artifactcandidates').textContent='Nenhum trecho curto repetido 3 ou mais vezes foi encontrado. Informe abaixo o texto exato a remover.';
    previewOrganization();$('organizedialog').showModal();
};
for(const id of ['organizescope','reconstruct','repairhyphens','detectheadings','preservelines','removeartifacts','removepagenumbers','removeinlineartifacts'])$(id).onchange=previewOrganization;
$('artifactphrases').oninput=previewOrganization;
$('applyorganize').onclick=()=>{if(!organization)return;capture();undoOrganization=structuredClone(book);for(const r of organization)book.chapters[r.i].html=r.html;render();save();undoFingerprint=JSON.stringify(book);$('undoorganize').disabled=false;$('organizedialog').close();toast('Organização aplicada. Confira a prévia de leitura; você pode desfazer a última organização.');};
$('undoorganize').onclick=()=>{if(!undoOrganization)return;capture();if(JSON.stringify(book)!==undoFingerprint&&!confirm('Desfazer a última operação também reverte as edições feitas depois dela. Continuar?'))return;book=undoOrganization;active=Math.min(active,book.chapters.length-1);invalidateUndo();render();save();toast('Estado anterior restaurado.');};
$('export').onclick=async()=>{const btn=$('export');btn.disabled=true;btn.textContent='Preparando EPUB…';try{capture();let stats;const bytes=await createEPUB(book,{progress:message=>btn.textContent=message,onStats:value=>stats=value});download(new Blob([bytes],{type:'application/epub+zip'}),filename()+'.epub');toast('EPUB exportado: '+(bytes.length/1048576).toFixed(2)+' MB · '+(stats?.images||0)+' imagens. '+(stats?.warnings.length?'Algumas imagens mantiveram a qualidade original; não foi possível otimizá-las.':'Imagens otimizadas e texto adaptável.'));}catch(err){toast('Exportação: '+err.message);}finally{btn.disabled=false;btn.textContent='↓ Exportar EPUB';}};
// The same flowing paragraph stylesheet drives the previews and the EPUB.
const previewStyle=document.createElement('style');previewStyle.textContent=readingCSS.replace(/(^|\})\s*([^{}]+)\{/g,(_,boundary,selectors)=>boundary+selectors.split(',').map(s=>'.reading '+(s.trim()==='body'?'':s.trim().replace(/^body\s+/, ''))).join(',')+'{');document.head.append(previewStyle);
function applyBook(next,index=active){capture();undoOrganization=structuredClone(book);book=validateBook(next);active=Math.min(index,book.chapters.length-1);render();save();undoFingerprint=JSON.stringify(book);$('undoorganize').disabled=false;}
const editionUI=installEditionUI({getBook:()=>{capture();return book;},applyBook,toast});
const editorTools=installEditorTools({save,toast});
const reader=installReader({getBook:()=>{capture();return book;},onEdit:index=>{save();active=index;render();},toast});
const pageEditing=installPageEditor({getBook:()=>book,onCommit:next=>{book=next;active=Math.min(active,book.chapters.length-1);$('editor').innerHTML=sanitize(book.chapters[active].html);renderChapterList();editionUI?.render();},onActive:index=>{active=index;$('editor').innerHTML=sanitize(book.chapters[active].html);$('current').textContent=book.chapters[active].name;document.querySelectorAll('#chapters .chapter').forEach((row,i)=>row.classList.toggle('active',i===active));},tools:editorTools,save,toast});
installResizableLayout();
async function boot(){try{db=await openDB();const data=await databaseRead();if(data)book=validateBook(data);else{try{const old=JSON.parse(localStorage.getItem('livrostudio-v1'));if(old)book=validateBook(old);}catch{}await databaseWrite(book);}}catch{db=null;try{const old=JSON.parse(localStorage.getItem('livrostudio-v1'));if(old)book=validateBook(old);}catch{}$('saved').textContent='Armazenamento limitado — use backups';}render();$('loading').remove();}
boot();
window.addEventListener('pagehide',()=>{capture();clearTimeout(persistTimer);persist(structuredClone(book),revision);});


