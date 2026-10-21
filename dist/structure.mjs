import {composePDFVisualLines} from './pdf-visuals.mjs';
import {parseHTML,sanitize,escapeXML,looksLikeHeading} from './book-tools.mjs';
import {cleanPDFMargins,pagesToHTML} from './pdf-layout.mjs';
const norm=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase();
const content=node=>Boolean(node.textContent.trim()||node.querySelector?.('img,table,hr'));
export function splitHTMLChapters(html,{name='Capítulo',anchors=[],allHeadings=false}={}){
    const doc=parseHTML(sanitize(html));let boundaries=[];
    for(const a of anchors){const el=doc.getElementById(a.id);if(el)boundaries.push({el,name:a.title||el.textContent.trim()||name});}
    if(!boundaries.length){
        const all=[...doc.body.querySelectorAll('h1,h2,h3')].filter(e=>e.textContent.trim());
        const explicit=all.filter(e=>/^(?:cap[íi]tulo|chapter|parte|part|livro|book)\s+[\p{L}\d]/iu.test(e.textContent.trim()));
        const h1=all.filter(e=>e.localName==='h1'),h2=all.filter(e=>e.localName==='h2');
        const chosen=allHeadings?all:explicit.length?explicit:h1.length>1?h1:h2.length>1&&h1.length<=1?h2:[];
        boundaries=chosen.map(el=>({el,name:el.textContent.trim()}));
    }
    boundaries=boundaries.filter((b,i,a)=>a.findIndex(x=>x.el===b.el)===i).sort((a,b)=>a.el===b.el?0:a.el.compareDocumentPosition(b.el)&4?-1:1);
    if(!boundaries.length)return [{name,html:sanitize(html)}];
    const chunks=[];
    const chunk=(start,end,title)=>{const range=doc.createRange();start?range.setStartBefore(start):range.setStart(doc.body,0);end?range.setEndBefore(end):range.setEnd(doc.body,doc.body.childNodes.length);const wrapper=doc.createElement('div');wrapper.append(range.cloneContents());if(content(wrapper))chunks.push({name:title,html:sanitize(wrapper.innerHTML)});};
    chunk(null,boundaries[0].el,name+' · Abertura');
    boundaries.forEach((b,i)=>chunk(b.el,boundaries[i+1]?.el,b.name));return chunks.length?chunks:[{name,html:sanitize(html)}];
}
export function countHeadings(chapters){return chapters.reduce((n,c)=>n+(c.isCover?0:Math.max(1,parseHTML(c.html).querySelectorAll('h1,h2,h3,h4,h5,h6').length)),0);}
export function buildPDFChapters(source,{removeMargins=source.removeMargins!==false,detectChapters=true}={}){
    const original=source.pages.filter(p=>!p.excluded),cleaned=cleanPDFMargins(source.pages.filter(p=>!p.manualHTML));
    const cleanByID=new Map(cleaned.pages.map(p=>[p.id,p]));
    const pages=original.map(p=>removeMargins&&!p.manualHTML?cleanByID.get(p.id)||p:p).map(composePDFVisualLines);
    const fontWeights=new Map();for(const l of pages.flatMap(p=>p.lines||[])){const size=Math.round(l.size);fontWeights.set(size,(fontWeights.get(size)||0)+l.text.replace(/\s/g,'').length);}
    const font=[...fontWeights].sort((a,b)=>b[1]-a[1])[0]?.[0]||12;
    const boundaries=new Map();
    if(detectChapters){
        for(const item of source.outline||[]){const p=pages.find(p=>p.id===item.pageId);if(!p||!p.lines?.length)continue;
            let index=p.lines.findIndex(l=>norm(l.text)===norm(item.title));
            if(index<0&&Number.isFinite(item.top))index=p.lines.findIndex(l=>l.top>=item.top-8);
            if(index<0)index=0;
            const key=p.id+':'+index;if(!boundaries.has(key))boundaries.set(key,{title:item.title,replace:norm(p.lines[index].text)===norm(item.title)});
        }
        for(const p of pages)for(let i=0;i<(p.lines||[]).length;i++){
            const l=p.lines[i],t=l.text.trim();if(!t||t.length>140||/[.·_…\-–—]{2,}\s*\d+\s*$/.test(t))continue;
            const explicit=/^(?:cap[íi]tulo|chapter|parte|part|livro|book)\s+[\p{L}\d]/iu.test(t);
            const styled=l.size>font*1.2&&t.length<120&&!/[.!?;]$/.test(t)&&(!i||l.top-p.lines[i-1].top>font*1.3);
            if(explicit||styled||looksLikeHeading(t)){
                const key=p.id+':'+i;if(!boundaries.has(key))boundaries.set(key,{title:t,replace:true});
            }
        }
    }
    const chapters=[];let group=[],title='',heading='',start='';
    const flush=()=>{const body=pagesToHTML(group),html=(heading?'<h1>'+escapeXML(heading)+'</h1>':'')+body;if(html.trim())chapters.push({id:source.id+'-'+(start||'opening-'+chapters.length),sourceId:source.id,name:title||source.name+(chapters.length?'':' · Abertura'),html});group=[];title='';heading='';start='';};
    for(const p of pages){
        if(p.manualHTML!==undefined){flush();chapters.push({id:source.id+'-'+p.id,sourceId:source.id,name:p.title||'Página inserida',html:sanitize(p.manualHTML)||'<p><br></p>'});continue;}
        let from=0;
        for(let i=0;i<p.lines.length;i++){
            const b=boundaries.get(p.id+':'+i);if(!b)continue;
            if(heading&&group.length===0&&i===from&&!/^(?:cap[íi]tulo|chapter|parte|part|livro|book)\s+/iu.test(b.title)){
                heading+=' '+(b.replace?p.lines[i].text:b.title);title+=' '+b.title;from=b.replace?i+1:i;continue;
            }
            if(i>from)group.push({...p,lines:p.lines.slice(from,i)});flush();title=b.title;heading=b.replace?p.lines[i].text:b.title;start=p.id+'-'+i;from=b.replace?i+1:i;
        }
        if(from<p.lines.length)group.push({...p,lines:p.lines.slice(from)});
    }
    flush();
    if(!chapters.length)return {chapters:[],removed:cleaned.removed};
    if(chapters.length===1&&!title&&chapters[0].name.endsWith(' · Abertura'))chapters[0].name=source.name;
    return {chapters,removed:cleaned.removed};
}
export function mergeBooks(books){
    const first=books[0];if(!first)throw Error('Nenhum arquivo foi importado.');
    const result={imagePreset:first.imagePreset||'balanced',title:first.title,author:first.author||'',language:first.language||'pt-BR',fileName:first.fileName||first.title,cover:first.cover||null,coverOptions:[],chapters:[],sources:[],notes:[]};
    for(const b of books){const offset=result.chapters.length;
        result.chapters.push(...b.chapters.map(c=>({...c,id:c.id||crypto.randomUUID(),html:sanitize(c.html.replace(/href="ch(\d+)\.xhtml/g,(_,n)=>`href="ch${Number(n)+offset}.xhtml`))})));
        result.sources.push(...b.sources||[]);result.notes.push(...b.notes||[]);if(!result.cover&&b.cover)result.cover=b.cover;
        for(const c of [b.cover,...b.coverOptions||[]].filter(Boolean))if(!result.coverOptions.some(x=>x.data===c.data))result.coverOptions.push(c);
    }
    return result;
}
export function parsePageSelection(input,total){
    const selected=new Set();for(const token of input.split(',').map(s=>s.trim()).filter(Boolean)){
        const match=token.match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!match)throw Error('Use páginas como 1-3, 5, 8.');
        const from=Number(match[1]),to=Number(match[2]||match[1]);if(from<1||to<from||to>total)throw Error(`Informe páginas entre 1 e ${total}.`);
        for(let n=from;n<=to;n++)selected.add(n-1);
    }return [...selected];
}
export function rebuildPDFSources(book,sources){
    const result=structuredClone(book),previous=new Map((book.sources||[]).map(s=>[s.id,s]));
    const replacements=new Map(sources.filter(s=>!previous.has(s.id)||JSON.stringify(previous.get(s.id))!==JSON.stringify(s)).map(s=>[s.id,buildPDFChapters(s).chapters]));
    const emitted=new Set(),chapters=[];
    for(const c of result.chapters){if(!replacements.has(c.sourceId)){chapters.push(c);continue;}if(!emitted.has(c.sourceId)){chapters.push(...replacements.get(c.sourceId));emitted.add(c.sourceId);}}
    for(const [id,list]of replacements)if(!emitted.has(id))chapters.push(...list);
    if(!chapters.length)throw Error('Mantenha pelo menos uma página ou um capítulo no projeto.');
    result.chapters=chapters;result.sources=sources;return result;
}
