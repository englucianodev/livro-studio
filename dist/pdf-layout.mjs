import {textToHTML,looksLikeHeading} from './book-tools.mjs';
const median = a => [...a].sort((x,y)=>x-y)[Math.floor(a.length/2)] || 12;
export function extractPDFLines(items,viewport) {
    const lines=[];let current;
    for(const item of items){
        if(!item.str?.trim())continue;
        const [x,top]=viewport?.convertToViewportPoint ? viewport.convertToViewportPoint(item.transform[4],item.transform[5]) : [item.transform[4],-item.transform[5]];
        const size=Math.max(Math.hypot(item.transform[2],item.transform[3]),item.height||0,1);
        if(!current||Math.abs(top-current.top)>Math.max(2,size*.3)){
            current={x,top,size,text:item.str};lines.push(current);
        }else{const gap=x-current.endX;current.text+=(gap>size*.15?' ':'')+item.str;current.size=Math.max(current.size,size);}
        current.endX=x+(item.width||0);
    }
    return lines;
}
const pageNumber=s=>/^(?:[-–—·|]\s*)?(?:(?:p[áa]g(?:ina)?\.?|page)\s*)?(?:\d{1,5}|[ivxlcdm]{1,8})(?:\s*(?:de|of|\/)\s*\d{1,5})?\s*[-–—·|]?$/i.test(s.trim());
const key=s=>s.normalize('NFKC').toLocaleLowerCase().replace(/\d+/g,'#').replace(/\s+/g,' ').trim();
export function cleanPDFMargins(pages) {
    const candidates=new Map();
    pages.forEach((p,index)=>{
        const font=median(p.lines.filter(l=>l.top/p.height>.12&&l.top/p.height<.88).map(l=>l.size));
        p.lines.forEach((l,line)=>{
            const pos=l.top/p.height,band=pos<.12?'cabeçalho':pos>.88?'rodapé':null;
            if(!band||l.text.trim().length>180||l.size>font*1.15)return;
            if(band==='cabeçalho'&&line>1||band==='rodapé'&&line<p.lines.length-2)return;
            const number=pageNumber(l.text),k=band+'|'+(number?'número':key(l.text));
            if(!candidates.has(k))candidates.set(k,[]);
            candidates.get(k).push({page:index,line,text:l.text.trim(),pos,kind:number?'número de página':band});
        });
    });
    const removed=[],excluded=new Map();
    for(const entries of candidates.values()){
        const pageCount=new Set(entries.map(e=>e.page)).size;
        // Repetition must occur across pages, at a stable margin position.
        // This also detects different running headers on odd/even pages.
        if(pageCount<(entries[0].kind==='número de página'||pages.length<=4?2:3))continue;
        if(Math.max(...entries.map(e=>e.pos))-Math.min(...entries.map(e=>e.pos))>.035)continue;
        if(entries[0].kind==='número de página'&&new Set(entries.map(e=>e.text)).size<2)continue;
        for(const e of entries){if(!excluded.has(e.page))excluded.set(e.page,new Set());excluded.get(e.page).add(e.line);removed.push({...e,page:e.page+1});}
    }
    return {pages:pages.map((p,i)=>({...p,lines:p.lines.filter((_,j)=>!excluded.get(i)?.has(j))})),removed};
}
export function linesToText(lines) {
    if(!lines.length)return '';
    const font=median(lines.map(l=>l.size)),gaps=lines.slice(1).map((l,i)=>Math.abs(l.top-lines[i].top)).filter(g=>g>font*.6&&g<font*3);
    const lineGap=median(gaps),minX=Math.min(...lines.map(l=>l.x));
    let out='';
    lines.forEach((l,i)=>{const prev=lines[i-1];const boundary=prev&&(Math.abs(l.top-prev.top)>lineGap*1.4||l.x-minX>font*1.2&&prev.x-minX<font*.7||l.size>font*1.2||prev.size>font*1.2);out+=(i?(boundary?'\n\n':'\n'):'')+l.text;});return out;
}
export function pagesToHTML(pages) {
    let text='';let previous;
    for(const page of pages){if(!page.lines.length)continue;
        const first=page.lines[0],last=page.lines.at(-1),font=median(page.lines.map(l=>l.size)),minX=Math.min(...page.lines.map(l=>l.x));
        // Page edges are not paragraph edges. Continue unfinished sentences and
        // hyphenated words unless the next page provides a new paragraph/title cue.
        const heading=first.size>font*1.2||looksLikeHeading(first.text);
        const indent=first.x-minX>font*1.2;
        const continuation=previous&&!/[.!?…:;][”’"')\]]?\s*$/.test(previous.text)&&!heading&&!indent&&!/^\s*[—–-]\s*\S/.test(first.text);
        text+=(text?(continuation?'\n':'\n\n'):'')+linesToText(page.lines);previous=last;
    }
    return textToHTML(text,{reconstruct:true});
}
