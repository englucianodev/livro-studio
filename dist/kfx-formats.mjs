import {readIon,symbolTable,IonSymbol,symbolName as sym} from './kfx-ion.mjs';
import {sanitize,parseHTML,escapeXML as esc} from './book-tools.mjs';
import {splitHTMLChapters} from './structure.mjs';
const LIMIT=200*1024*1024;
const ascii=bytes=>String.fromCharCode(...bytes.subarray(0,8));
const drm=()=>Error('Este KFX está protegido por DRM e não pode ser importado. Use um arquivo sem DRM.');
const incomplete=()=>Error('O KFX está incompleto: faltam partes do livro. Importe o pacote completo em KFX-ZIP.');
function slice(bytes,offset,length){if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>bytes.length)throw Error('O contêiner KFX está truncado ou possui índices inválidos.');return bytes.subarray(offset,offset+length);}
function single(bytes,symbols,options){const values=readIon(bytes,symbols,options);if(values.length!==1)throw Error('Estrutura inesperada no contêiner KFX.');return values[0];}
function imageMime(data){const magic=ascii(data);return data[0]===255&&data[1]===216?'image/jpeg':magic.startsWith('\x89PNG')?'image/png':magic.startsWith('GIF8')?'image/gif':magic.startsWith('RIFF')&&String.fromCharCode(...data.subarray(8,12))==='WEBP'?'image/webp':null;}
function dataURL(bytes,mime){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return `data:${mime};base64,${btoa(binary)}`;}
export function decodeKFXContainers(containers){
 let symbols=new Map(),symbolSignature=null;const fragments=[],descriptors=[],budget={nodes:0};let totalEntities=0;
 for(const {bytes} of containers){
  if(ascii(bytes).startsWith('\xeaDRMION\xee'))throw drm();
  if(bytes.length<18||ascii(bytes).slice(0,4)!=='CONT')throw Error('O arquivo não contém um contêiner KFX válido.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length),version=view.getUint16(4,true),header=view.getUint32(6,true);
  if(![1,2].includes(version))throw Error('Esta versão do contêiner KFX ainda não é suportada.');
  if(header<18||header>bytes.length)throw Error('Cabeçalho KFX inválido.');
  const info=single(slice(bytes,view.getUint32(10,true),view.getUint32(14,true)),symbols,{budget});
  if(info.$411)throw drm();if(info.$410)throw Error('A compressão deste contêiner KFX ainda não é suportada.');
  if(info.$416){
   const table=single(slice(bytes,info.$415,info.$416),new Map(),{keepTables:true,budget}),signature=JSON.stringify(table);
   if(symbolSignature&&symbolSignature!==signature)throw Error('O pacote contém tabelas de símbolos de livros KFX diferentes.');
   symbols=symbolTable(table,true);symbolSignature=signature;
  }
  if(!Number.isInteger(info.$413)||!Number.isInteger(info.$414)||info.$414%24)throw Error('Índice de entidades KFX inválido.');
  const index=slice(bytes,info.$413,info.$414),iv=new DataView(index.buffer,index.byteOffset,index.length);
  for(let at=0;at<index.length;at+=24){
   if(++totalEntities>150000)throw Error('O KFX excede o limite de entidades do leitor.');
   const offset=Number(iv.getBigUint64(at+8,true)),length=Number(iv.getBigUint64(at+16,true));
   descriptors.push({id:iv.getUint32(at,true),type:iv.getUint32(at+4,true),bytes:slice(bytes,header+offset,length)});
  }
 }
 const name=id=>symbols.get(id)||'$'+id;
 for(const entity of descriptors){
  const {bytes}=entity;if(bytes.length<10||ascii(bytes).slice(0,4)!=='ENTY')throw Error('Entidade KFX inválida.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length),header=view.getUint32(6,true);
  if(view.getUint16(4,true)!==1||header<10||header>bytes.length)throw Error('Cabeçalho de entidade KFX inválido.');
  const info=single(slice(bytes,10,header-10),symbols,{budget});if(info.$411)throw drm();if(info.$410)throw Error('A compressão desta entidade KFX ainda não é suportada.');
  const type=name(entity.type),payload=bytes.subarray(header);
  fragments.push({id:name(entity.id),type,value:['$417','$418'].includes(type)?payload:single(payload,symbols,{budget})});
 }
 return fragments;
}
export async function readKFX(file,progress=()=>{}){
 progress('Lendo contêineres KFX…');const bytes=new Uint8Array(await file.arrayBuffer()),containers=[],assets=new Map();let expanded=0;
 if(bytes[0]===0x50&&bytes[1]===0x4b){
  if(!globalThis.JSZip)throw Error('O leitor de pacotes não carregou. Recarregue a página.');
  const zip=await JSZip.loadAsync(bytes),entries=Object.values(zip.files).filter(e=>!e.dir);
  if(entries.length>2000)throw Error('O pacote KFX contém arquivos demais.');
  for(const entry of entries){
   const size=entry._data?.uncompressedSize;if(!Number.isSafeInteger(size)||size<0||(expanded+=size)>LIMIT)throw Error('O pacote KFX excede 200 MB após descompactar.');
   const data=await entry.async('uint8array'),magic=ascii(data);if(data.length!==size)throw Error('Tamanho inconsistente no pacote KFX.');
   if(magic.startsWith('\xeaDRMION\xee'))throw drm();
   if(magic.startsWith('CONT'))containers.push({bytes:data});
   else if(imageMime(data))assets.set(entry.name,data);
  }
 }else containers.push({bytes});
 if(!containers.length)throw Error('Não foram encontrados contêineres KFX no pacote.');
 const fragments=decodeKFXContainers(containers),byType=new Map(),notes=new Set();
 for(const fragment of fragments){if(fragment.type==='$419')continue;if(!byType.has(fragment.type))byType.set(fragment.type,new Map());const map=byType.get(fragment.type);if(map.has(fragment.id))throw Error('O pacote contém entidades KFX duplicadas.');map.set(fragment.id,fragment.value);}
 const get=(type,id)=>{const result=byType.get(type)?.get(sym(id));if(result===undefined)throw incomplete();return result;};
 const first=type=>byType.get(type)?.values().next().value;
 const metadata=Object.create(null),legacy=first('$258')||{};
 for(const [key,value] of Object.entries(legacy))metadata[({'$153':'title','$222':'author','$10':'language','$424':'cover_image','$169':'reading_orders'})[key]||key]=value;
 for(const category of first('$490')?.$491||[])for(const entry of category.$258||[]){const key=entry.$492;if(typeof key==='string'&&['title','author','language','cover_image','reading_orders'].includes(key))metadata[key]=entry.$307;}
 const documentData=first('$538')||{},orders=documentData.$169||metadata.reading_orders||[];
 const sectionIds=orders.flatMap(order=>order.$170||[]);
 if(!sectionIds.length){for(const id of byType.get('$260')?.keys()||[])sectionIds.push(id);notes.add('Sem ordem de leitura explícita: confira a sequência das seções.');}
 if(!sectionIds.length)throw incomplete();
 if(Object.keys(documentData).some(k=>k.startsWith('nmdl.')))throw Error('Este KFX usa diagramação fixa ou anotações que ainda não são suportadas.');
 let operations=0;
 function style(node,chain=new Set()){
  const key=sym(node.$157);if(!key)return node;if(chain.has(key))throw Error('Referência circular em um estilo KFX.');
  const base=byType.get('$157')?.get(key);if(!base){notes.add('Alguns estilos do KFX não estavam disponíveis.');return node;}
  return {...style(base,new Set([...chain,key])),...node};
 }
 function text(value){
  if(typeof value==='string')return value;
  if(value&&typeof value==='object'&&value.name!=null&&Number.isInteger(value.$403)){const block=get('$145',value.name);const result=block.$146?.[value.$403];if(typeof result!=='string')throw incomplete();return result;}
  throw Error('O KFX contém uma referência de texto não suportada.');
 }
 function emphasis(html,node){const s=style(node);if(['$361','$360','$362','$363'].includes(sym(s.$13)))html='<strong>'+html+'</strong>';if(['$382','$381'].includes(sym(s.$12)))html='<em>'+html+'</em>';return html;}
 function styledText(value,node){
  const chars=Array.from(text(value)),events=node.$142||[],cuts=new Set([0,chars.length]);
  if(events.length>1000)throw Error('O KFX contém estilos de texto demais.');
  for(const event of events){const start=event.$143,end=start+event.$144;if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>chars.length)throw Error('Intervalo de estilo inválido no KFX.');cuts.add(start);cuts.add(end);}
  const positions=[...cuts].sort((a,b)=>a-b);let html='';
  for(let i=1;i<positions.length;i++){const from=positions[i-1],to=positions[i];let piece=esc(chars.slice(from,to).join('')).replace(/\n/g,'<br>');for(const event of events)if(event.$143<=from&&event.$143+event.$144>=to)piece=emphasis(piece,event);html+=piece;}
  return html;
 }
 function image(resourceId,alt='Imagem do livro'){
  const resource=get('$164',resourceId);if(resource.$636){notes.add('Imagens divididas em blocos precisam de revisão.');return '<p>[Imagem dividida em blocos: '+esc(alt)+']</p>';}
  const location=sym(resource.$165),data=byType.get('$417')?.get(location)||assets.get(location);if(!data)throw incomplete();
  const mime=imageMime(data);if(!mime){notes.add('Imagens em JPEG XR, vetoriais ou outros formatos especiais não puderam ser incorporadas.');return '<p>[Imagem não compatível: '+esc(alt)+']</p>';}
  return '<img alt="'+esc(alt)+'" src="'+dataURL(data,mime)+'">';
 }
 function content(value,stack=new Set(),depth=0,parent=''){
  if(depth>100||++operations>200000)throw Error('O KFX excede o limite de conteúdo do leitor.');
  if(typeof value==='string')return esc(value).replace(/\n/g,'<br>');
  if(value instanceof IonSymbol)return reference('$608',value,stack,depth,parent);
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Elemento de conteúdo KFX inválido.');
  const node=style(value),type=sym(node.$159);
  if(type==='$271')return image(node.$164,node.$584);
  let inner='';
  if(node.$145!==undefined)inner=styledText(node.$145,node);
  else if(node.$146)inner=node.$146.map(child=>content(child,stack,depth+1,type)).join('');
  else if(node.$176)inner=reference('$259',node.$176,stack,depth,parent);
  if(type&& !['$269','$270','$276','$277','$278','$279','$454','$151','$455'].includes(type))throw Error('Este KFX contém um tipo de conteúdo ainda não suportado ('+type+').');
  inner=emphasis(inner,node);
  let tag=({'$269':'p','$270':'div','$276':['$346','$347','$343','$344','$345'].includes(sym(node.$100))?'ol':'ul','$277':'li','$278':'table','$279':'tr','$454':'tbody','$151':'thead','$455':'tfoot'})[type]||'div';
  if(parent==='$279')tag='td';
  if(type==='$269'&&Number.isInteger(node.$790)&&node.$790>=1&&node.$790<=6)tag='h'+node.$790;
  if(type==='$269'&&/<(?:p|div|table|ul|ol|h[1-6])\b/.test(inner))tag='div';
  const spans=tag==='td'?['$148','$149'].map((key,i)=>Number.isInteger(node[key])&&node[key]>1&&node[key]<1000?' '+(i?'rowspan':'colspan')+'="'+node[key]+'"':'').join(''):'';
  return '<'+tag+spans+'>'+inner+'</'+tag+'>';
 }
 function reference(type,id,stack,depth,parent){const key=type+':'+sym(id);if(stack.has(key))throw Error('Referência circular no conteúdo KFX.');return content(get(type,id),new Set([...stack,key]),depth+1,parent);}
 const chapters=[],used=new Set();
 for(let i=0;i<sectionIds.length;i++){
  const id=sym(sectionIds[i]);if(used.has(id))continue;used.add(id);progress('Convertendo KFX · seção '+(i+1)+'/'+sectionIds.length);
  const section=get('$260',id),templates=section.$141;if(!Array.isArray(templates)||!templates.length)throw incomplete();
  if(templates.length>1)notes.add('Modelos condicionais de página foram simplificados para leitura adaptável.');
  const html=sanitize(content(templates.at(-1))),body=parseHTML(html).body;
  if(body.textContent.trim()||body.querySelector('img'))chapters.push(...splitHTMLChapters(html,{name:'Seção '+(i+1)}));
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 if(!chapters.length)throw Error('O KFX não contém texto ou imagens compatíveis para edição.');
 let cover=null;if(metadata.cover_image){const img=parseHTML(image(metadata.cover_image,'Capa do livro')).querySelector('img');if(img)cover={data:img.src,name:'Capa KFX',kind:'image'};}
 return {cover,title:typeof metadata.title==='string'?metadata.title:file.name.replace(/\.kfx(?:-zip)?$/i,''),author:typeof metadata.author==='string'?metadata.author:'',language:typeof metadata.language==='string'?metadata.language:'pt-BR',chapters,notes:['KFX convertido para edição: revise capítulos, estilos, links e elementos especiais.',...notes]};
}
