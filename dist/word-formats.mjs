import {sanitize,parseHTML,escapeXML as esc} from './book-tools.mjs';
import {splitHTMLChapters} from './structure.mjs';

// Loaded only when a Word file is imported/exported; all conversion stays local.
const codecs=()=>import('./vendor/word-codecs.mjs');
const DOCX_MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC_MIME='application/msword';
const alignments=['left','center','right','justify'];
function dataURL(bytes,mime){
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return `data:${mime};base64,${btoa(binary)}`;
}
function colorHex(value){
 const d=parseHTML('<span></span>'),s=d.body.firstChild.style;s.color=value||'';
 const parts=s.color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
 if(parts)return parts.slice(1).map(n=>Number(n).toString(16).padStart(2,'0')).join('');
 const h=s.color.match(/^#([0-9a-f]{6})$/i);if(h)return h[1];
 return null;
}
const toColorRef=hex=>parseInt(hex.slice(0,2),16)|(parseInt(hex.slice(2,4),16)<<8)|(parseInt(hex.slice(4,6),16)<<16);
const fromColorRef=n=>[n&255,(n>>8)&255,(n>>16)&255].map(v=>v.toString(16).padStart(2,'0')).join('');

function modelHTML(model){
 let html='',row='',table='',listKind='';
 const closeList=()=>{if(listKind){html+=`</${listKind}>`;listKind='';}};
 const closeTable=()=>{if(table||row){html+='<table>'+table+(row?'<tr>'+row+'</tr>':'')+'</table>';row='';table='';}};
 for(const p of model.body||[]){
  let text=(p.runs||[]).map(r=>{
   if(r.image?.bytes)return '<img alt="Imagem do documento" src="'+dataURL(r.image.bytes,r.image.mime||'image/png')+'">';
   let s=esc(r.text||'').replace(/\n/g,'<br>');
   for(const [on,tag]of [[r.b,'strong'],[r.i,'em'],[r.u,'u'],[r.strike,'s'],[r.va==='super','sup'],[r.va==='sub','sub']])if(on)s=`<${tag}>${s}</${tag}>`;
   if(r.color!=null)s=`<span data-editor-format="true" style="color:#${fromColorRef(r.color)}">${s}</span>`;
   if(r.url)s=`<a href="${esc(r.url)}">${s}</a>`;
   return s;
  }).join('');
  if(p.kind==='cell'||p.kind==='rowEnd'){
   closeList();row+='<td>'+text+'</td>';if(p.kind==='rowEnd'){table+='<tr>'+row+'</tr>';row='';}continue;
  }
  closeTable();
  if(p.list){const kind=p.list.kind==='number'?'ol':'ul';if(listKind!==kind){closeList();html+=`<${kind}>`;listKind=kind;}html+='<li>'+text+'</li>';continue;}
  closeList();const heading=/^(cap[íi]tulo|chapter|parte|part)\s+\S/i.test((p.runs||[]).map(r=>r.text||'').join(''));
  const tag=heading?'h1':'p';html+=`<${tag} style="text-align:${alignments[p.align]||'left'}">${text||'<br>'}</${tag}>`;
 }
 closeList();closeTable();return sanitize(html);
}

export async function readWord(file,progress=()=>{}){
 progress('Lendo documento Word…');const bytes=new Uint8Array(await file.arrayBuffer());
 const {mammoth,docToText}=await codecs();let html,title=file.name.replace(/\.[^.]+$/,''),author='',notes=[];
 if(bytes[0]===0x50&&bytes[1]===0x4b){
  const result=await mammoth.convertToHtml({arrayBuffer:bytes.buffer},{includeDefaultStyleMap:true,styleMap:['u => u'],externalFileAccess:false});
  html=sanitize(result.value);notes=result.messages.map(m=>m.message);
  if(globalThis.JSZip){
   const zip=await JSZip.loadAsync(bytes),entry=zip.file('docProps/core.xml');
   if(entry){const xml=new DOMParser().parseFromString(await entry.async('string'),'application/xml');title=xml.getElementsByTagNameNS('*','title')[0]?.textContent?.trim()||title;author=xml.getElementsByTagNameNS('*','creator')[0]?.textContent?.trim()||'';}
  }
 }else if(bytes[0]===0xd0&&bytes[1]===0xcf){
  const model=docToText.model(bytes);
  if(!model)throw Error('Não foi possível ler este DOC. Use Word 97–2003 sem senha ou salve uma cópia em DOCX.');
  html=modelHTML(model);title=model.props?.title||title;author=model.props?.author||'';
  notes.push('DOC Word 97–2003: importado o corpo do documento. Cabeçalhos, rodapés, comentários e objetos especiais precisam de revisão.');
 }else throw Error('O arquivo não contém um documento Word DOC/DOCX válido. Salve-o como DOCX no Word e tente novamente.');
 if(!parseHTML(html).body.textContent.trim()&&!parseHTML(html).querySelector('img'))throw Error('O documento Word está vazio ou não contém conteúdo compatível.');
 return {title,author,language:'pt-BR',chapters:splitHTMLChapters(html,{name:title}),notes:['Documento Word convertido para edição: revise a paginação e os elementos complexos.',...notes]};
}

async function imageRun(node){
 const src=node.getAttribute('src')||'';
 if(!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(src))throw Error('Uma imagem não está incorporada em um formato compatível. Substitua-a antes de exportar para Word.');
 let mime=src.slice(5,src.indexOf(';')),bytes=Uint8Array.from(atob(src.slice(src.indexOf(',')+1)),c=>c.charCodeAt(0));
 let width=480,height=320;
 if(typeof Image!=='undefined'){
  const image=new Image();image.src=src;await image.decode();width=image.naturalWidth;height=image.naturalHeight;
  if(!['image/png','image/jpeg'].includes(mime)){
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,0,0);
   const data=canvas.toDataURL('image/png');bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));mime='image/png';
  }
 }
 const percent=parseInt(node.getAttribute('data-media-width')||'100',10)/100;
 const scale=Math.min(1,600*percent/width,800/height);
 return {image:{mime,bytes,dxa:Math.round(width*scale*15),dya:Math.round(height*scale*15)}};
}

async function inlineRuns(node,format={}){
 if(node.nodeType===3)return [{...format,text:node.textContent}];
 if(node.nodeType!==1)return [];
 const tag=node.localName,style=node.style,fmt={...format};
 if(['b','strong'].includes(tag))fmt.b=true;if(['i','em'].includes(tag))fmt.i=true;
 if(tag==='u')fmt.u=true;if(tag==='s')fmt.strike=true;
 if(['sub','sup'].includes(tag))fmt.va=tag==='sub'?'sub':'super';
 if(tag==='a')fmt.url=node.getAttribute('href');
 const color=colorHex(style.color);if(color)fmt.color=toColorRef(color);
 if(style.fontSize?.endsWith('em'))fmt.size=12*parseFloat(style.fontSize);
 if(style.fontSize?.endsWith('pt'))fmt.size=parseFloat(style.fontSize);
 if(tag==='br')return [{...fmt,text:'\n'}];
 if(tag==='img')return [await imageRun(node)];
 const runs=[];for(const child of node.childNodes)runs.push(...await inlineRuns(child,fmt));return runs;
}

export async function bookWordModel(book){
 const body=[{kind:'p',align:1,runs:[{text:book.title,b:true,size:26}]}];
 if(book.author)body.push({kind:'p',align:1,runs:[{text:book.author,size:14}]});
 if(book.cover?.data){const doc=parseHTML('<img>');doc.body.firstChild.setAttribute('src',book.cover.data);body.push({kind:'p',align:1,runs:[await imageRun(doc.body.firstChild)]});}
 async function blocks(parent,list=null){
  const out=[];
  for(const node of parent.childNodes){
   if(node.nodeType===3){if(node.textContent.trim())out.push({kind:'p',runs:[{text:node.textContent}]});continue;}
   if(node.nodeType!==1)continue;
   const tag=node.localName;
   if(tag==='table'){
    for(const row of node.rows){const cells=[...row.cells];for(let i=0;i<cells.length;i++){
     if(cells[i].colSpan>1||cells[i].rowSpan>1)throw Error('A exportação Word ainda não aceita células mescladas. Desfaça a mesclagem antes de exportar.');
     out.push({kind:i===cells.length-1?'rowEnd':'cell',runs:await inlineRuns(cells[i])});
    }}continue;
   }
   if(tag==='ul'||tag==='ol'){out.push(...await blocks(node,{kind:tag==='ol'?'number':'bullet',ilvl:Math.min(8,list?list.ilvl+1:0)}));continue;}
   if(['div','figure'].includes(tag)&&node.querySelector('p,h1,h2,table,ul,ol,div')){out.push(...await blocks(node,list));continue;}
   const heading=/^h[1-6]$/.test(tag)?Number(tag[1]):0;
   const format=heading?{b:true,size:[0,24,20,17,15,14,13][heading]}:tag==='blockquote'?{i:true}:{};
   const p={kind:'p',align:Math.max(0,alignments.indexOf(node.style.textAlign)),heading,runs:[]};
   if(tag==='li')p.list=list||{kind:'bullet',ilvl:0};
   for(const child of node.childNodes)if(!['ul','ol'].includes(child.localName))p.runs.push(...await inlineRuns(child,format));
   out.push(p);
   for(const child of node.children)if(['ul','ol'].includes(child.localName))out.push(...await blocks({childNodes:[child]},list));
  }
  return out;
 }
 for(const chapter of book.chapters.filter(c=>!(book.cover&&c.isCover))){
  const paragraphs=await blocks(parseHTML(sanitize(chapter.html)).body);
  if(paragraphs[0])paragraphs[0].pp={pageBreak:true};body.push(...paragraphs);
 }
 return {body,props:{title:book.title,author:book.author||''}};
}

export async function createWord(book,format){
 if(!['doc','docx'].includes(format))throw Error('Formato Word inválido.');
 const [{docx,textToDoc},model]=await Promise.all([codecs(),bookWordModel(book)]);
 if(format==='doc'){
  const bytes=textToDoc(model);
  // This legacy writer stores FAT sector addresses in the header's 109 slots.
  if(new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(44,true)>109)throw Error('O livro excede o limite do exportador DOC (cerca de 7 MB). Exporte em DOCX para manter todo o conteúdo.');
  return new Blob([bytes],{type:DOC_MIME});
 }
 const {Document,Packer,Paragraph,TextRun,ImageRun,ExternalHyperlink,Table,TableRow,TableCell,WidthType,LevelFormat}=docx;
 const makeRun=r=>{
  if(r.image)return new ImageRun({type:r.image.mime==='image/jpeg'?'jpg':'png',data:r.image.bytes,transformation:{width:r.image.dxa/15,height:r.image.dya/15}});
  const run=new TextRun({text:r.text||'',bold:r.b,italics:r.i,underline:r.u?{}:undefined,strike:r.strike,size:r.size?r.size*2:24,color:r.color!=null?fromColorRef(r.color):undefined,superScript:r.va==='super',subScript:r.va==='sub'});
  return r.url&&/^https?:\/\//i.test(r.url)?new ExternalHyperlink({link:r.url,children:[run]}):run;
 };
 const makePara=p=>new Paragraph({children:(p.runs||[]).flatMap(r=>r.text?.includes('\n')?r.text.split('\n').flatMap((t,i)=>[...(i?[new TextRun({break:1})]:[]),makeRun({...r,text:t})]):[makeRun(r)]),alignment:alignments[p.align]||'left',heading:p.heading?'Heading'+p.heading:undefined,pageBreakBefore:p.pp?.pageBreak,numbering:p.list?{reference:p.list.kind,level:p.list.ilvl||0}:undefined,spacing:{after:160}});
 const children=[];let cells=[],rows=[];
 const finishTable=()=>{if(rows.length||cells.length){if(cells.length)rows.push(new TableRow({children:cells}));children.push(new Table({rows,width:{size:100,type:WidthType.PERCENTAGE}}));cells=[];rows=[];}};
 for(const p of model.body){
  if(['cell','rowEnd'].includes(p.kind)){cells.push(new TableCell({children:[makePara(p)]}));if(p.kind==='rowEnd'){rows.push(new TableRow({children:cells}));cells=[];}}
  else{finishTable();children.push(makePara(p));}
 }
 finishTable();
 const document=new Document({title:book.title,creator:book.author||'',styles:{default:{document:{run:{font:'Georgia',size:24}}}},numbering:{config:['number','bullet'].map(kind=>({reference:kind,levels:Array.from({length:9},(_,level)=>({level,format:kind==='number'?LevelFormat.DECIMAL:LevelFormat.BULLET,text:kind==='number'?`%${level+1}.`:'•',alignment:'left',style:{paragraph:{indent:{left:720*(level+1),hanging:360}}}}))}))},sections:[{children}]});
 return Packer.toBlob(document);
}
