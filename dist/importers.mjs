import {splitHTMLChapters,buildPDFChapters} from './structure.mjs';
import {extractPDFLines,linesToText,cleanPDFMargins,pagesToHTML} from './pdf-layout.mjs';
import {sanitize,parseHTML,escapeXML,textToHTML} from './book-tools.mjs';
const MAX_FILE = 80 * 1024 * 1024;
const xml = text => {const d=new DOMParser().parseFromString(text,'application/xml');if(d.querySelector('parsererror'))throw Error('Estrutura XML inválida no ebook.');return d;};
const elements = (d,name) => [...d.getElementsByTagNameNS('*',name)];
const metadata = (d,name) => elements(d,name)[0]?.textContent?.trim() || '';
const plainName = file => file.name.replace(/\.[^.]+$/,'');
const filePath = (base,href) => {
    if (/^(?:[a-z]+:|\/\/)/i.test(href)) throw Error('O livro referencia um arquivo externo.');
    const p=new URL(href,'https://epub.local/'+base);return decodeURIComponent(p.pathname.slice(1));
};
export function blobAsDataURL(blob) {return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Falha ao ler uma imagem.'));r.readAsDataURL(blob);});}
function imageType(bytes) {
    if(bytes[0]===0xff&&bytes[1]===0xd8)return 'image/jpeg';
    if(bytes[0]===0x89&&bytes[1]===0x50)return 'image/png';
    if(bytes[0]===0x47&&bytes[1]===0x49)return 'image/gif';
    if(String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
    return null;
}
export async function readEPUB(file,progress=()=>{}) {
    if(!globalThis.JSZip)throw Error('O leitor EPUB não carregou. Recarregue a página.');
    const zip=await JSZip.loadAsync(await file.arrayBuffer());
    const read=async p=>{const f=zip.file(p);if(!f)throw Error(`Arquivo ausente no EPUB: ${p}`);return f.async('string');};
    const container=xml(await read('META-INF/container.xml'));
    const opfPath=elements(container,'rootfile')[0]?.getAttribute('full-path');if(!opfPath)throw Error('O EPUB não contém um pacote de leitura.');
    const opf=xml(await read(opfPath)),manifest=new Map(elements(opf,'item').map(e=>[e.id,{href:e.getAttribute('href'),type:e.getAttribute('media-type'),properties:e.getAttribute('properties')||''}]));
    const spine=elements(opf,'itemref').filter(e=>e.getAttribute('linear')!=='no').map(e=>manifest.get(e.getAttribute('idref')));
    if(!spine.length||spine.some(e=>!e))throw Error('A ordem de leitura do EPUB é inválida.');
    if(spine.length>5000)throw Error('O EPUB possui capítulos demais para este editor.');
    const encryption=zip.file('META-INF/encryption.xml');
    if(encryption){const enc=xml(await encryption.async('string'));const methods=elements(enc,'EncryptionMethod');if(methods.some(e=>!['http://www.idpf.org/2008/embedding','http://ns.adobe.com/pdf/enc#RC'].includes(e.getAttribute('Algorithm'))))throw Error('Este EPUB contém conteúdo protegido por DRM. Importe uma cópia sem proteção.');}
    const paths=spine.map(e=>filePath(opfPath,e.href)),pathMap=new Map(paths.map((p,i)=>[p,`ch${i}.xhtml`]));
    const titles=new Map(), navigation=new Map();
    for(const item of manifest.values())if(item.properties.split(/\s+/).includes('nav')||item.type==='application/x-dtbncx+xml'){
        const path=filePath(opfPath,item.href);try{const d=xml(await read(path));
            for(const a of elements(d,'a')){const href=a.getAttribute('href');if(href){const key=filePath(path,href);if(!titles.has(key))titles.set(key,a.textContent.trim());const fragment=new URL(href,'https://epub.local/'+path).hash.slice(1);if(fragment){if(!navigation.has(key))navigation.set(key,[]);navigation.get(key).push({id:decodeURIComponent(fragment),title:a.textContent.trim()});}}}
            for(const n of elements(d,'navPoint')){const src=elements(n,'content')[0]?.getAttribute('src');if(src){const key=filePath(path,src);if(!titles.has(key))titles.set(key,metadata(n,'text'));const fragment=new URL(src,'https://epub.local/'+path).hash.slice(1);if(fragment){if(!navigation.has(key))navigation.set(key,[]);navigation.get(key).push({id:decodeURIComponent(fragment),title:metadata(n,'text')});}}}
        }catch{ /* The spine remains authoritative if optional navigation is malformed. */ }
    }
    const images=new Map();let imagesSkipped=0,cover=null;
    const coverID=elements(opf,'meta').find(e=>e.getAttribute('name')==='cover')?.getAttribute('content');
    const coverItem=[...manifest.values()].find(item=>item.properties.split(/\s+/).includes('cover-image'))||manifest.get(coverID);
    if(coverItem)try{const entry=zip.file(filePath(opfPath,coverItem.href));const bytes=await entry.async('uint8array'),type=imageType(bytes);if(type)cover={data:await blobAsDataURL(new Blob([bytes],{type})),name:'Capa original',kind:'original'};}catch{}

    const chapters=[];
    for(let i=0;i<paths.length;i++){
        progress(`Lendo capítulo ${i+1}/${paths.length}…`);
        const doc=parseHTML(await read(paths[i]));
        // Raster images are embedded locally; external URLs never reach the editor.
        for(const image of doc.querySelectorAll('img')){
            try{const src=image.getAttribute('src');if(!src)throw Error();if(src.startsWith('data:image/'))continue;
                const path=filePath(paths[i],src);let data=images.get(path);
                if(!data){const entry=zip.file(path);if(!entry)throw Error();const bytes=await entry.async('uint8array');const type=imageType(bytes);if(!type)throw Error();data=await blobAsDataURL(new Blob([bytes],{type}));images.set(path,data);}
                image.setAttribute('src',data);
            }catch{image.removeAttribute('src');imagesSkipped++;}
        }
        imagesSkipped+=doc.querySelectorAll('svg image').length;
        // Preserve the raster image inside common SVG cover wrappers, not SVG scripts.
        for(const image of [...doc.querySelectorAll('svg image')]){
            const href=image.getAttribute('href')||image.getAttribute('xlink:href');
            try{const entry=zip.file(filePath(paths[i],href||''));const bytes=await entry.async('uint8array');const type=imageType(bytes);if(!type)throw Error();const img=doc.createElement('img');img.src=await blobAsDataURL(new Blob([bytes],{type}));img.alt='Ilustração';image.closest('svg').replaceWith(img);imagesSkipped--;}catch{}
        }
        for(const a of doc.querySelectorAll('a[href]')){
            try{const href=a.getAttribute('href'),target=new URL(href,'https://epub.local/'+paths[i]);const mapped=pathMap.get(decodeURIComponent(target.pathname.slice(1)));if(target.origin==='https://epub.local'&&mapped)a.setAttribute('href',mapped+target.hash);else a.removeAttribute('href');}catch{a.removeAttribute('href');}
        }
        const name=titles.get(paths[i])||doc.querySelector('h1,h2,h3')?.textContent?.trim()||`Capítulo ${i+1}`;
        const pieces=splitHTMLChapters(doc.body.innerHTML,{name,anchors:navigation.get(paths[i])||[]});
        for(const piece of pieces){const parsed=parseHTML(piece.html);piece.isCover=Boolean(cover&&!parsed.body.textContent.trim()&&[...parsed.querySelectorAll('img')].some(img=>img.src===cover.data));chapters.push(piece);}
    }
    const fixed=elements(opf,'meta').some(e=>e.getAttribute('property')==='rendition:layout'&&e.textContent==='pre-paginated');
    return {cover,title:metadata(opf,'title')||plainName(file),author:elements(opf,'creator').map(e=>e.textContent.trim()).join(', '),language:metadata(opf,'language')||'pt-BR',chapters,notes:[fixed?'O EPUB usa páginas fixas. A conversão para texto adaptável precisa de revisão.':'Parágrafos, títulos e ordem de leitura do EPUB foram preservados.',imagesSkipped?`${imagesSkipped} imagem(ns) em formato não suportado ou ausente(s).`:'Imagens rasterizadas incorporadas quando disponíveis.']};
}
export async function readMOBI(file,progress=()=>{}) {
    const {MOBI,isMOBI}=await import('./vendor/mobi.js');
    if(!await isMOBI(file))throw Error('O arquivo não é um MOBI/AZW compatível. Formatos KFX, Topaz e arquivos renomeados não são suportados.');
    // Reject encrypted records before asking the format reader to decompress content.
    const header=new DataView(await file.slice(0,86).arrayBuffer());const first=header.getUint32(78);
    const palm=new DataView(await file.slice(first,first+16).arrayBuffer());
    if(palm.getUint16(12)!==0)throw Error('Este ebook está protegido por DRM. Importe uma cópia sem proteção.');
    const reader=new MOBI({unzlib:async bytes=>new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())});
    let source;
    try{
        source=await reader.open(file);const chapters=[];let missingImages=0,cover=null;
        try{const blob=await source.getCover?.();if(blob){const bytes=new Uint8Array(await blob.arrayBuffer()),type=imageType(bytes);if(type)cover={data:await blobAsDataURL(new Blob([bytes],{type})),name:'Capa original',kind:'original'};}}catch{}
        const toc=[];const flatten=items=>{for(const item of items||[]){if(item.href)toc.push(item);flatten(item.subitems);}};flatten(source.toc);
        const originalIndices=source.sections.map((s,i)=>typeof s.createDocument==='function'?i:null).filter(i=>i!==null);

        const sections=source.sections.filter(s=>typeof s.createDocument==='function');
        if(!sections.length)throw Error('O ebook não contém capítulos editáveis.');
        for(let i=0;i<sections.length;i++){
            progress(`Lendo capítulo ${i+1}/${sections.length}…`);const doc=await sections[i].createDocument();
            for(const img of doc.querySelectorAll('img'))try{
                let raw;
                if(img.hasAttribute('recindex'))raw=await reader.loadResource(Number(img.getAttribute('recindex'))-1);
                else if(/^kindle:embed:/i.test(img.getAttribute('src')||'')){
                    const id=img.getAttribute('src').match(/^kindle:embed:([0-9a-v]+)/i)?.[1];raw=await reader.loadResource(parseInt(id,32)-1);
                }else {missingImages++;continue;}
                const bytes=new Uint8Array(raw),type=imageType(bytes);if(!type)throw Error();img.setAttribute('src',await blobAsDataURL(new Blob([bytes],{type})));
            }catch{missingImages++;img.removeAttribute('src');}
            const name=doc.querySelector('h1,h2,h3')?.textContent?.trim()||`Capítulo ${i+1}`;
            const anchors=[];
            for(const item of toc)try{const resolved=await source.resolveHref(item.href);if(resolved?.index!==originalIndices[i])continue;const target=resolved.anchor?.(doc);if(target){target.id ||= 'toc-'+crypto.randomUUID();anchors.push({id:target.id,title:item.label});}}catch{}
            chapters.push(...splitHTMLChapters(doc.body?.innerHTML||doc.documentElement.innerHTML,{name,anchors}));
        }
        return {cover,title:source.metadata?.title||plainName(file),author:Array.isArray(source.metadata?.author)?source.metadata.author.join(', '):String(source.metadata?.author||''),language:[source.metadata?.language].flat()[0]||'pt-BR',chapters,notes:['Conteúdo convertido para capítulos editáveis. Estilos de página fixa e fontes do original são substituídos por um layout adaptável.',missingImages?`${missingImages} imagem(ns) não puderam ser importadas.`:'Imagens rasterizadas incorporadas quando disponíveis.']};
    }catch(e){if(/DRM/.test(e.message))throw e;console.warn('Falha no leitor MOBI/KF8:',e);throw Error('Não foi possível ler este MOBI/AZW. O arquivo pode estar danificado, protegido ou usar uma variante não suportada.');}
    finally{source?.destroy?.();}
}
// Keep vertical gaps, indents and larger headings before removing PDF page widths.
export function pdfLinesToText(items,styles={}) { return linesToText(extractPDFLines(items)); }
export async function readPDF(file,progress=()=>{}) {
    if(!globalThis.pdfjsLib)throw Error('O leitor PDF não carregou. Recarregue a página.');
    pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.min.js';
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    try{
        const pages=[],sourceID=crypto.randomUUID();let cover=null;
        for(let n=1;n<=pdf.numPages;n++){
            progress(`Lendo página ${n}/${pdf.numPages}…`);
            const page=await pdf.getPage(n),content=await page.getTextContent(),viewport=page.getViewport({scale:1});
            pages.push({id:crypto.randomUUID(),number:n,origin:file.name,height:viewport.height,width:viewport.width,lines:extractPDFLines(content.items,viewport),excluded:false});
            if(n===1&&typeof document!=='undefined'&&!/jsdom/i.test(globalThis.navigator?.userAgent||''))try{
                const canvas=document.createElement('canvas'),view=page.getViewport({scale:Math.min(1,800/viewport.height)});canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
                await page.render({canvasContext:canvas.getContext('2d'),viewport:view,background:'white'}).promise;
                cover={data:canvas.toDataURL('image/jpeg',.88),name:'Primeira página do PDF',kind:'pdf-page'};
            }catch{}
        }
        if(pages.reduce((n,p)=>n+p.lines.reduce((m,l)=>m+l.text.trim().length,0),0)<15)throw Error('Este PDF não tem texto selecionável. Execute OCR antes de importar.');
        const outline=[];
        const walk=async items=>{for(const item of items||[]){try{const dest=typeof item.dest==='string'?await pdf.getDestination(item.dest):item.dest;if(dest){const index=typeof dest[0]==='number'?dest[0]:await pdf.getPageIndex(dest[0]);if(pages[index])outline.push({title:item.title,pageId:pages[index].id,top:Number.isFinite(dest[3])?pages[index].height-dest[3]:null});}}catch{}await walk(item.items);}};
        await walk(await pdf.getOutline?.());
        const name=plainName(file),source={id:sourceID,name,pages,outline,removeMargins:true};
        const cleaned=buildPDFChapters(source),original=buildPDFChapters(source,{removeMargins:false});
        return {title:name,fileName:name,cover,author:'',language:'pt-BR',chapters:cleaned.chapters,sources:[source],pdfAlternatives:{cleaned:cleaned.chapters,original:original.chapters,removed:cleaned.removed},notes:[`${pages.length} páginas de origem · ${outline.length} entradas no sumário · ${cleaned.chapters.length} seções detectadas. Confira a divisão antes de importar.`,`${cleaned.removed.length} elementos de margem detectados. As páginas de origem ficam disponíveis em Gerenciar páginas.`,'Imagens internas e a diagramação fixa do PDF não são importadas. A primeira página pode ser usada como capa.']};
    }finally{await pdf.destroy();}
}
export async function importFile(file,progress) {
    if(file.size>MAX_FILE)throw Error('Importe um arquivo de até 80 MB.');
    const ext=file.name.split('.').pop().toLowerCase();
    if(ext==='epub')return readEPUB(file,progress);
    if(['mobi','azw','azw3','prc'].includes(ext))return readMOBI(file,progress);
    if(ext==='pdf')return readPDF(file,progress);
    if(ext==='txt')return {title:plainName(file),author:'',language:'pt-BR',chapters:splitHTMLChapters(textToHTML(await file.text()),{name:plainName(file)}),notes:['Quebras de linha foram tratadas como texto contínuo; linhas vazias delimitam parágrafos.']};
    throw Error('Selecione PDF, TXT, EPUB, MOBI, AZW ou AZW3.');
}
export async function createEPUB(book) {
    if(!globalThis.JSZip)throw Error('O exportador não carregou. Recarregue a página.');
    const {toXHTML,readingCSS}=await import('./book-tools.mjs');
    const zip=new JSZip(),images=new Map(),chapters=[];let imageIndex=0;
    const exportChapters=book.chapters.filter(c=>!(book.cover&&c.isCover));
    const exportBook={...book,chapters:exportChapters};book=exportBook;
    const destinations=new Map();book.chapters.forEach((c,i)=>{for(const e of parseHTML(c.html).querySelectorAll('[id]'))if(!destinations.has(e.id))destinations.set(e.id,i);});

    zip.file('mimetype','application/epub+zip',{compression:'STORE'});
    for(const chapter of book.chapters){const doc=parseHTML(sanitize(chapter.html));
        for(const a of doc.querySelectorAll('a[href]')){const href=a.getAttribute('href'),fragment=href.includes('#')?href.slice(href.indexOf('#')+1):'';if(fragment&&destinations.has(fragment))a.setAttribute('href',`ch${destinations.get(fragment)}.xhtml#${fragment}`);}
for(const img of doc.querySelectorAll('img')){const data=img.getAttribute('src');let asset=images.get(data);if(!asset){const m=data.match(/^data:image\/(png|jpeg|gif|webp);base64,([\s\S]+)$/i);if(!m)continue;asset={path:`images/image${++imageIndex}.${m[1]==='jpeg'?'jpg':m[1]}`,type:`image/${m[1]}`,id:`img${imageIndex}`};zip.file('OEBPS/'+asset.path,m[2],{base64:true});images.set(data,asset);}img.setAttribute('src',data);img.setAttribute('data-export-src',asset.path);}
        // toXHTML only allows embedded images; replace their serialized source afterwards.
        let content=toXHTML(doc.body.innerHTML);for(const [data,asset]of images)content=content.split(escapeXML(data)).join(asset.path);chapters.push(content);
    }
    let coverAsset=null;
    if(book.cover?.data){const m=book.cover.data.match(/^data:image\/(png|jpeg|gif|webp);base64,([\s\S]+)$/i);if(m){coverAsset={path:'images/cover.'+(m[1]==='jpeg'?'jpg':m[1]),type:'image/'+m[1]};zip.file('OEBPS/'+coverAsset.path,m[2],{base64:true});zip.file('OEBPS/cover.xhtml',`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capa</title><style>body{margin:0;text-align:center}img{max-width:100%;max-height:95vh;height:auto}</style></head><body><div><img src="${coverAsset.path}" alt="Capa de ${escapeXML(book.title)}"/></div></body></html>`);}}
    const lang=/^[a-z]{2,3}(?:-[a-zA-Z0-9]+)*$/.test(book.language||'')?book.language:'pt-BR';
    zip.file('mimetype','application/epub+zip',{compression:'STORE'});
    zip.file('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    zip.file('OEBPS/style.css',readingCSS);
    chapters.forEach((html,i)=>zip.file(`OEBPS/ch${i}.xhtml`,`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="${lang}" xml:lang="${lang}"><head><title>${escapeXML(book.chapters[i].name)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${html}</body></html>`));
    zip.file('OEBPS/nav.xhtml','<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="'+lang+'"><head><title>Sumário</title></head><body><nav epub:type="toc" id="toc"><h1>Sumário</h1><ol>'+book.chapters.map((c,i)=>`<li><a href="ch${i}.xhtml">${escapeXML(c.name)}</a></li>`).join('')+'</ol></nav></body></html>');
    zip.file('OEBPS/content.opf',`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:${crypto.randomUUID()}</dc:identifier><dc:title>${escapeXML(book.title||'Meu livro')}</dc:title><dc:creator>${escapeXML(book.author||'Autor desconhecido')}</dc:creator><dc:language>${lang}</dc:language>${coverAsset?'<meta name="cover" content="cover-image"/>':''}<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/,'Z')}</meta></metadata><manifest>${coverAsset?`<item id="cover-image" href="${coverAsset.path}" media-type="${coverAsset.type}" properties="cover-image"/><item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>`:``}<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${book.chapters.map((c,i)=>`<item id="ch${i}" href="ch${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}${[...images.values()].map(a=>`<item id="${a.id}" href="${a.path}" media-type="${a.type}"/>`).join('')}</manifest><spine>${coverAsset?'<itemref idref="cover-page"/>':''}${book.chapters.map((c,i)=>`<itemref idref="ch${i}"/>`).join('')}</spine></package>`);
    return zip.generateAsync({type:'uint8array',mimeType:'application/epub+zip',compression:'DEFLATE'});
}
