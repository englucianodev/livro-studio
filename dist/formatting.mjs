import {parseHTML,sanitize} from './book-tools.mjs';
export const isTOCTitle=text=>/^(sum[áa]rio|[íi]ndice(?: geral)?|conte[úu]do|contents|table of contents)(?:\s*·.*)?$/i.test(text.trim());
export function cleanTOCLabel(text){return text.replace(/\u00a0/g,' ').replace(/\s*(?:(?:\.[\s.]*){3,}|…{2,}|(?:[-–—_·•]\s*){3,}|\t+| {3,})\s*(?:\d+(?:\s*[-–]\s*\d+)?|[ivxlcdm]+)\s*$/i,'').replace(/[.·_…\-–—]{3,}\s*$/,'').replace(/\s+/g,' ').trim();}
const key=s=>cleanTOCLabel(s).normalize('NFKC').toLocaleLowerCase();
export function formatChapterHTML(html,{name='',chapters=[],cleanTOC=true}={}){
    const doc=parseHTML(sanitize(html)),links=new Map(chapters.map((c,i)=>[key(c.name),'ch'+i+'.xhtml']));
    // A single font and flow rules supersede the fixed-page typography.
    doc.querySelectorAll('[style]').forEach(e=>e.removeAttribute('style'));
    for(const p of [...doc.body.querySelectorAll('p')])if(p.querySelector('img')&&!p.textContent.trim()){
        const figure=doc.createElement('figure');if(p.id)figure.id=p.id;figure.append(...p.childNodes);p.replaceWith(figure);
    }
    let toc=isTOCTitle(name)||[...doc.body.querySelectorAll('h1,h2,h3')].some(h=>isTOCTitle(h.textContent));
    if(cleanTOC&&toc){
        const heading=[...doc.body.querySelectorAll('h1,h2,h3')].find(h=>isTOCTitle(h.textContent)),end=heading?[...doc.body.querySelectorAll('h1,h2')].find(h=>h!==heading&&(heading.compareDocumentPosition(h)&4)&&!/[.·_…\-–—]{3,}/.test(h.textContent)):null;
        const eligible=e=>(!heading||(heading.compareDocumentPosition(e)&4))&&(!end||(e.compareDocumentPosition(end)&4));

        for(const table of [...doc.body.querySelectorAll('table')].filter(eligible)){const list=doc.createElement('ul');for(const row of table.querySelectorAll('tr')){const cells=[...row.querySelectorAll('td,th')];if(!cells.length)continue;const label=cleanTOCLabel(cells.filter((c,i)=>i===0||!/^\s*(?:\d+|[ivxlcdm]+)\s*$/i.test(c.textContent)).map(c=>c.textContent).join(' '));if(!label)continue;const li=doc.createElement('li'),link=row.querySelector('a[href]');if(link){const a=link.cloneNode(true);a.textContent=label;li.append(a);}else li.textContent=label;list.append(li);}if(list.children.length)table.replaceWith(list);}
        for(const entry of [...doc.body.querySelectorAll('p')])if(eligible(entry)&&entry.querySelector('br')){const list=doc.createElement('ul');for(const line of entry.innerHTML.split(/<br\s*\/?>(?:\s*)/i)){const li=doc.createElement('li');li.innerHTML=line;if(li.textContent.trim())list.append(li);}entry.replaceWith(list);}

        // Only leaf entries are rewritten: nested TOC lists retain their hierarchy.
        for(const entry of [...doc.body.querySelectorAll('p,li,td,a')].reverse()){
            if(!eligible(entry)||entry.querySelector('p,li,table')||entry.querySelector('img'))continue;
            const original=entry.textContent,label=cleanTOCLabel(original);if(!label||isTOCTitle(label))continue;
            const anchors=entry.querySelectorAll('a');
            if(entry.localName==='a'){entry.textContent=label;continue;}
            if(anchors.length>1)continue;
            const existing=anchors[0],target=links.get(key(label));
            if(existing){existing.textContent=label;if(target)existing.setAttribute('href',target);entry.replaceChildren(existing);}
            else if(target){const a=doc.createElement('a');a.setAttribute('href',target);a.textContent=label;entry.replaceChildren(a);}
            else if(label!==original)entry.textContent=label;
        }
        doc.body.querySelectorAll('p,ol,ul').forEach(e=>{if(eligible(e))e.setAttribute('data-toc','true');});
    }
    return sanitize(doc.body.innerHTML);
}
