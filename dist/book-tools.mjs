// Shared by import, editor and export: keep semantic markup, discard fixed page layout.
export const escapeXML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const parseHTML = html => new DOMParser().parseFromString(html, 'text/html');
const blocks = 'p,div,h1,h2,h3,h4,h5,h6,blockquote,pre,li,table,figure,hr';
const allowed = new Set('p div h1 h2 h3 h4 h5 h6 strong b em i u s br blockquote ul ol li span pre code sup sub hr a img figure figcaption table thead tbody tr th td'.split(' '));
export function sanitize(html) {
    const doc = parseHTML(html);
    doc.querySelectorAll('script,style,iframe,object,embed,svg,math,form,input,button,link,meta,base').forEach(e => e.remove());
    for (const e of [...doc.body.querySelectorAll('*')].reverse()) {
        const tag = e.localName;
        if (!allowed.has(tag)) { e.replaceWith(...e.childNodes); continue; }
        const align = e.style.textAlign || e.getAttribute('align');
        const id = e.id, href = e.getAttribute('href'), src = e.getAttribute('src'), alt = e.getAttribute('alt');
        const keepLines = e.getAttribute('data-keep-lines') === 'true' || /^(pre|pre-wrap|break-spaces)$/.test(e.style.whiteSpace);
        const className = /(?:^|[\s_-])(verse|poem|poetry|verso|poesia)(?:$|[\s_-])/i.test(e.className) ? 'verse' : '';
        [...e.attributes].forEach(a => e.removeAttribute(a.name));
        if (id) e.id = id;
        if (['left','right','center','justify'].includes(align)) e.style.textAlign = align;
        if (keepLines || className) e.setAttribute('data-keep-lines', 'true');
        if (tag === 'a' && href && /^(#|ch\d+\.xhtml(?:#|$))/.test(href)) e.setAttribute('href', href);
        if (tag === 'img') {
            if (!/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src || '')) {
                e.replaceWith(doc.createTextNode(alt ? `[Imagem: ${alt}]` : '[Imagem não importada]'));
            } else { e.setAttribute('src', src); e.setAttribute('alt', alt || ''); }
        }
    }
    return doc.body.innerHTML;
}
export function toXHTML(html) {
    const doc = parseHTML(sanitize(html));
    function serialize(n) {
        if (n.nodeType === 3) return escapeXML(n.textContent);
        if (n.nodeType !== 1) return '';
        const tag = n.localName;
        const attrs = [...n.attributes].filter(a => a.name !== 'data-keep-lines').map(a => ` ${a.name}="${escapeXML(a.value)}"`).join('');
        const preserve = n.hasAttribute('data-keep-lines') && tag !== 'pre' ? ' class="verse"' : '';
        return `<${tag}${attrs}${preserve}` + (/^(br|hr|img)$/.test(tag) ? ' />' : `>${[...n.childNodes].map(serialize).join('')}</${tag}>`);
    }
    return [...doc.body.childNodes].map(serialize).join('');
}
export const readingCSS = `
body{font-family:serif;line-height:1.55;margin:0 5%;padding:0;overflow-wrap:break-word;}
p{margin:0 0 .6em;text-indent:0;white-space:normal;}p+p{text-indent:1.2em;}
h1,h2,h3,h4,h5,h6{line-height:1.25;text-indent:0;break-after:avoid;page-break-after:avoid;margin:1.3em 0 .8em;}
h1{font-size:1.65em;}h2{font-size:1.3em;}h3{font-size:1.15em;}
blockquote{margin:1em 1.2em;}blockquote p{ text-indent:0; }
img{max-width:100%;height:auto;}figure{margin:1em 0;text-align:center;}figcaption{font-size:.85em;}
pre,.verse{white-space:pre-wrap;text-indent:0;}table{max-width:100%;border-collapse:collapse;}td,th{padding:.3em;}
hr{width:30%;margin:1.8em auto;}a{color:inherit;}
`;
const terminal = s => /[.!?…:;][”’"')\]]?\s*$/.test(s);
const dialogue = s => /^\s*[—–-]\s*\S/.test(s);
export function looksLikeHeading(text) {
    const s = text.trim();
    if (!s || s.length > 100 || terminal(s) || dialogue(s)) return false;
    return /^(cap[íi]tulo|chapter|parte|part|livro|book)\s+([\divxlcdm]+|[\p{L}-]+)(\s|[.:—–-]|$)/iu.test(s)
        || (s.length < 72 && /\p{Lu}/u.test(s) && s === s.toLocaleUpperCase() && s.split(/\s+/).length <= 10);
}
function cleanText(s) { return s.replace(/[\u00ad\u200b\ufeff]/g, '').replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' '); }
function joinText(left, right, hyphens) {
    if (hyphens && /\p{L}{2}-$/u.test(left) && /^\p{Ll}/u.test(right)) return left.slice(0, -1) + right;
    return left + (left && right ? ' ' : '') + right;
}
// Plain text: empty lines are strong paragraph boundaries; sentence endings,
// dialogue and headings prevent speculative merging. PDF import also supplies
// indentation/gap boundaries before this stage.
export function textToHTML(text, { reconstruct = true, hyphens = true, headings = true } = {}) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const out = []; let paragraph = '';
    const flush = () => { if (paragraph.trim()) out.push(`<p>${escapeXML(paragraph.trim())}</p>`); paragraph = ''; };
    for (const raw of lines) {
        const line = cleanText(raw).trim();
        if (!line) { flush(); continue; }
        if (headings && looksLikeHeading(line)) { flush(); out.push(`<h2>${escapeXML(line)}</h2>`); continue; }
        if (paragraph && (!reconstruct || dialogue(line) || terminal(paragraph) && /^\p{Lu}/u.test(line))) flush();
        paragraph = joinText(paragraph, line, hyphens);
    }
    flush(); return out.join('');
}
function edgeText(element, last = false) {
    const walker = element.ownerDocument.createTreeWalker(element, 4); let node, result;
    while ((node = walker.nextNode())) if (node.textContent.trim()) { result = node; if (!last) return result; }
    return result;
}
function joinElements(a, b, hyphens, stats) {
    const left = edgeText(a, true), right = edgeText(b);
    if (left && right && hyphens && /\p{L}{2}-\s*$/u.test(left.textContent) && /^\s*\p{Ll}/u.test(right.textContent)) {
        left.textContent = left.textContent.replace(/-\s*$/, ''); right.textContent = right.textContent.trimStart(); stats.hyphens++;
    } else a.append(a.ownerDocument.createTextNode(' '));
    if (b.id) { const anchor = a.ownerDocument.createElement('a'); anchor.id = b.id; a.append(anchor); }
    a.append(...b.childNodes); b.remove(); stats.joins++;
}
export function findPageArtifacts(chapters) {
    const counts=new Map();
    for(const c of chapters){const d=parseHTML(sanitize(c.html));
        for(const p of d.body.querySelectorAll('p,div,h1,h2,h3')){
            if(p.querySelector(blocks)||p.closest('li,table,blockquote,pre,[data-keep-lines]'))continue;
            const t=p.textContent.replace(/\s+/g,' ').trim();
            if(t.length<4||t.length>100||/[.!?…][”’"')\]]?$/.test(t)||/^\s*[—–-]/.test(t))continue;
            counts.set(t,(counts.get(t)||0)+1);
        }
    }
    return [...counts].filter(([,count])=>count>=3).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([text,count])=>({text,count}));
}
export function cleanPageArtifactsHTML(html,{pageNumbers=false,phrases=[],inline=false,preservePoetry=false,hyphens=true}={}) {
    const doc=parseHTML(sanitize(html)),removed=[],bridges=new Set(),stats={joins:0,hyphens:0};
    for(const div of [...doc.body.querySelectorAll('div')].reverse()){
        if(div.querySelector(blocks)||div.closest('pre,code,li,table,blockquote,[data-keep-lines]'))continue;
        const p=doc.createElement('p');p.innerHTML=div.innerHTML;if(div.id)p.id=div.id;div.replaceWith(p);
    }
    for(const n of [...doc.body.childNodes])if(n.nodeType===3&&n.textContent.trim()){
        const lines=preservePoetry?[n.textContent]:n.textContent.split(/\r?\n/);
        const fragment=doc.createDocumentFragment();for(const t of lines){if(!t.trim())continue;const p=doc.createElement('p');p.textContent=t;if(preservePoetry)p.setAttribute('data-keep-lines','true');fragment.append(p);}n.replaceWith(fragment);
    }
    const normalized=s=>s.replace(/\s+/g,' ').trim().toLocaleLowerCase();
    const selected=new Set(phrases.map(normalized).filter(Boolean));
    const number=s=>/^(?:[-–—·|]\s*)?(?:(?:p[áa]g(?:ina)?\.?|page)\s*)?(?:\d{1,5}|[ivxlcdm]{1,8})(?:\s*(?:de|of|\/)\s*\d{1,5})?\s*[-–—·|]?$/i.test(s.trim());
    for(const el of [...doc.body.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,span')]){
        if(!el.isConnected||el.querySelector(blocks)||el.closest('pre,code,li,table,blockquote,[data-keep-lines]')||el.querySelector('img'))continue;
        const t=el.textContent.trim();
        const isNumber=pageNumbers&&['p','div'].includes(el.localName)&&number(t);
        if(selected.has(normalized(t))||isNumber){
            if(el.previousElementSibling)bridges.add(el.previousElementSibling);
            // An inline span must leave a space, not concatenate adjacent words.
            removed.push(t);if(el.localName==='span')el.replaceWith(doc.createTextNode(' '));else el.remove();
        }
    }
    if(inline)for(const p of doc.body.querySelectorAll('p')){
        if(p.closest('pre,code,li,table,blockquote,[data-keep-lines]'))continue;
        for(const phrase of phrases.filter(s=>s.trim().length>0)){
            const walker=doc.createTreeWalker(p,4),nodes=[];let n,content='';
            while((n=walker.nextNode())){nodes.push({node:n,start:content.length,end:content.length+n.textContent.length});content+=n.textContent;}
            const escaped=phrase.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
            const matches=[...content.matchAll(new RegExp('(?<![\\p{L}\\p{N}])'+escaped+'(?![\\p{L}\\p{N}])','giu'))];
            for(const m of matches.reverse()){
                let from=m.index,to=m.index+m[0].length,separator=' ';
                if(hyphens&&/\p{L}{2}-\s*$/u.test(content.slice(0,from))&&/^\s*\p{Ll}/u.test(content.slice(to))){
                    from-=content.slice(0,from).match(/-\s*$/)[0].length;to+=content.slice(to).match(/^\s*/)[0].length;separator='';stats.hyphens++;
                }
                const start=nodes.find(x=>from>=x.start&&from<x.end),end=nodes.find(x=>to>x.start&&to<=x.end);
                if(!start||!end)continue;const range=doc.createRange();range.setStart(start.node,from-start.start);range.setEnd(end.node,to-end.start);range.deleteContents();range.insertNode(doc.createTextNode(separator));removed.push(m[0]);
            }
        }
    }
    if(!preservePoetry)for(const left of bridges){
        const right=left.nextElementSibling;
        if(!left.isConnected||left.localName!=='p'||right?.localName!=='p'||left.querySelector('img')||right.querySelector('img'))continue;
        const a=left.textContent.trim(),b=right.textContent.trim();
        if(!a||!b||terminal(a)||dialogue(a)||dialogue(b)||looksLikeHeading(b))continue;
        if(/^\p{Ll}/u.test(b)||/\p{L}{2}-$/u.test(a))joinElements(left,right,hyphens,stats);
    }
    return {html:sanitize(doc.body.innerHTML),removed,stats};
}
export function organizeHTML(html, options = {}) {
    const opts = { reconstruct:false, hyphens:true, headings:true, preservePoetry:false, ...options };
    const doc = parseHTML(sanitize(html)), stats = {breaks:0, joins:0, hyphens:0, headings:0, spaces:0};
    for (const node of [...doc.body.childNodes]) if (node.nodeType === 3 && node.textContent.trim()) {
        const wrapper=doc.createElement('div');
        wrapper.innerHTML=opts.preservePoetry ? `<p data-keep-lines="true">${escapeXML(node.textContent)}</p>` : textToHTML(node.textContent,{reconstruct:true,hyphens:opts.hyphens,headings:opts.headings});
        node.replaceWith(...wrapper.childNodes);
    }
    // Normalize containers around actual blocks without flattening paragraph structure.
    for (const div of [...doc.body.querySelectorAll('div')].reverse()) {
        if (div.hasAttribute('data-keep-lines')) continue;
        if (!div.querySelector(blocks)) { const p = doc.createElement('p'); p.innerHTML = div.innerHTML; if(div.id) p.id = div.id; div.replaceWith(p); }
    }
    const walker = doc.createTreeWalker(doc.body, 4); let node;
    while ((node = walker.nextNode())) {
        if (node.parentElement.closest('pre,code,[data-keep-lines]')) continue;
        const text = cleanText(node.textContent);
        if (text !== node.textContent) {stats.spaces++; node.textContent = text;}
    }
    if (!opts.preservePoetry) {
        for (const br of [...doc.body.querySelectorAll('p br, div br')]) {
            if (!br.parentElement) continue;
            if (br.closest('pre,code,li,blockquote,[data-keep-lines]')) continue;
            const container = br.closest('p,div');
            // Double breaks encode a paragraph boundary. Split, keeping inline emphasis.
            let next = br.nextSibling; while(next?.nodeType === 3 && !next.textContent.trim()) next = next.nextSibling;
            if (next?.nodeType === 1 && next.localName === 'br') {
                const range = doc.createRange();range.setStartAfter(next);range.setEnd(container,container.childNodes.length);
                const p = doc.createElement('p');p.append(range.extractContents());container.after(p);next.remove();br.remove();stats.breaks++;continue;
            }
            const prev = br.previousSibling, after = br.nextSibling;
            const left = prev?.nodeType === 3 ? prev : prev?.nodeType === 1 ? edgeText(prev,true) : null;
            const right = after?.nodeType === 3 ? after : after?.nodeType === 1 ? edgeText(after) : null;
            if (opts.hyphens && left && right && /\p{L}{2}-\s*$/u.test(left.textContent) && /^\s*\p{Ll}/u.test(right.textContent)) {
                left.textContent = left.textContent.replace(/-\s*$/, '');right.textContent = right.textContent.trimStart();br.remove();stats.hyphens++;
            } else br.replaceWith(doc.createTextNode(' '));
            stats.breaks++;
        }
    }
    if (opts.preservePoetry) for (const p of doc.body.querySelectorAll('p,div')) {
        if (p.querySelector('br')) p.setAttribute('data-keep-lines','true');
    }
    if (opts.headings) for (const p of [...doc.body.querySelectorAll('p')]) {
        if (p.closest('li,blockquote,td,th,[data-keep-lines]') || p.querySelector('img,br')) continue;
        if (looksLikeHeading(p.textContent)) { const h=doc.createElement('h2');h.innerHTML=p.innerHTML;if(p.id)h.id=p.id;p.replaceWith(h);stats.headings++; }
    }
    if (opts.reconstruct && !opts.preservePoetry) {
        for (const p of [...doc.body.querySelectorAll('p')]) {
            if (!p.isConnected || p.closest('li,blockquote,table,figure,[data-keep-lines]')) continue;
            let next = p.nextElementSibling;
            while (next?.localName === 'p' && !p.querySelector('img') && !next.querySelector('img') && !next.hasAttribute('data-keep-lines')) {
                const left=p.textContent.trim(), right=next.textContent.trim();
                if (!left || !right || dialogue(left) || dialogue(right) || looksLikeHeading(right)) break;
                // Never merge complete sentences. A lower-case continuation or
                // a long unfinished line is evidence of a damaged paragraph.
                if (terminal(left) || !(left.length >= 48 || /^\p{Ll}/u.test(right) || /\p{L}{2}-$/u.test(left))) break;
                joinElements(p,next,opts.hyphens,stats);next=p.nextElementSibling;
            }
        }
    }
    // Trimming only at paragraph edges preserves inline word boundaries.
    for (const p of doc.body.querySelectorAll('p,h1,h2,h3,h4,h5,h6')) {
        if (p.closest('[data-keep-lines],pre')) continue;
        const first=edgeText(p),last=edgeText(p,true);if(first)first.textContent=first.textContent.trimStart();if(last)last.textContent=last.textContent.trimEnd();
    }
    return {html:sanitize(doc.body.innerHTML),stats};
}
export function validateBook(data) {
    if (!data || typeof data.title !== 'string' || !Array.isArray(data.chapters) || !data.chapters.length || data.chapters.length > 5000 || data.chapters.some(c=>typeof c.name!=='string'||typeof c.html!=='string')) throw Error('Arquivo de livro inválido.');
    const image=/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i;
    const sources=Array.isArray(data.sources)?data.sources.filter(s=>typeof s.id==='string'&&Array.isArray(s.pages)).map(s=>({...s,name:String(s.name||'PDF'),pages:s.pages.map(p=>({...p,id:String(p.id||crypto.randomUUID()),lines:Array.isArray(p.lines)?p.lines:[],...(p.manualHTML!==undefined?{manualHTML:sanitize(String(p.manualHTML))}:{})})),outline:Array.isArray(s.outline)?s.outline:[]})):[];
    return {title:data.title,author:String(data.author||''),fileName:String(data.fileName||data.title),cover:data.cover&&image.test(data.cover.data||'')?{data:data.cover.data,name:String(data.cover.name||'Capa'),kind:String(data.cover.kind||'image')}:null,coverOptions:Array.isArray(data.coverOptions)?data.coverOptions.filter(c=>image.test(c?.data||'')):[],sources,language:/^[a-z]{2,3}(?:-[a-zA-Z0-9]+)*$/.test(data.language||'')?data.language:'pt-BR',chapters:data.chapters.map(c=>({id:String(c.id||crypto.randomUUID()),...(c.sourceId?{sourceId:String(c.sourceId)}:{}),...(c.isCover?{isCover:true}:{}),name:c.name,html:sanitize(c.html)}))};
}

