export const MEDIA_PRESETS={
    light:{label:'Leve',width:1000,height:1600,quality:.76,target:140000},
    balanced:{label:'Equilibrado',width:1400,height:2400,quality:.86,target:280000},
    detailed:{label:'Mais detalhes',width:1800,height:3000,quality:.92,target:480000}
};
export const dataBytes=data=>{const p=data.indexOf(',');return Math.max(0,Math.floor((data.length-p-1)*3/4)-(data.endsWith('==')?2:data.endsWith('=')?1:0));};
export function imageBlob(data){const match=data.match(/^data:([^;,]+);base64,([\s\S]+)$/);if(!match)throw Error('Imagem incorporada inválida.');const str=atob(match[2]),bytes=new Uint8Array(str.length);for(let i=0;i<str.length;i++)bytes[i]=str.charCodeAt(i);return new Blob([bytes],{type:match[1]});}
export const makeCanvas=(width,height)=>{if(typeof document==='undefined'||/jsdom/i.test(globalThis.navigator?.userAgent||''))throw Error('A captura visual precisa de um navegador com Canvas.');const c=document.createElement('canvas');c.width=width;c.height=height;return c;};
export async function loadRaster(data){const blob=imageBlob(data);if(typeof createImageBitmap==='function')try{return await createImageBitmap(blob);}catch{}
    if(typeof Image==='undefined')throw Error('Decodificador de imagens indisponível.');const image=new Image();image.src=data;await image.decode();return image;
}
export function encodeCanvas(canvas,{preset='balanced',lineArt=false,maxWidth,maxHeight}={}){
    const spec=MEDIA_PRESETS[preset]||MEDIA_PRESETS.balanced;
    let quality=spec.quality,data=canvas.toDataURL('image/jpeg',quality);
    // Lossless PNG is often smaller and sharper for tables and monochrome figures.
    if(lineArt){const png=canvas.toDataURL('image/png');if(dataBytes(png)<=Math.max(spec.target,dataBytes(data)*1.15))data=png;}
    if(data.startsWith('data:image/jpeg'))while(dataBytes(data)>spec.target&&quality>.68){quality=Math.max(.68,quality-.07);data=canvas.toDataURL('image/jpeg',quality);}
    return {data,bytes:dataBytes(data),width:canvas.width,height:canvas.height};
}
export async function optimizeRaster(data,{preset='balanced',lineArt=false,canvasFactory=makeCanvas,decode=loadRaster}={}){
    const spec=MEDIA_PRESETS[preset]||MEDIA_PRESETS.balanced,originalBytes=dataBytes(data),image=await decode(data);
    try{const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;if(!width||!height)throw Error('Dimensões de imagem inválidas.');
        const scale=Math.min(1,spec.width/width,spec.height/height),canvas=canvasFactory(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)));
        const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,canvas.width,canvas.height);
        const encoded=encodeCanvas(canvas,{preset,lineArt});
        // Keep a small original PNG/JPEG if recompression would make it larger.
        if(scale===1&&/^data:image\/(png|jpeg);/i.test(data)&&originalBytes<=encoded.bytes)return {data,bytes:originalBytes,originalBytes,width,height,changed:false};
        return {...encoded,originalBytes,changed:encoded.data!==data};
    }finally{image.close?.();}
}
export async function rasterizeSVG(svg,{preset='balanced',canvasFactory=makeCanvas,decode=loadRaster}={}){
    const clone=svg.cloneNode(true),spec=MEDIA_PRESETS[preset]||MEDIA_PRESETS.balanced,vb=(clone.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number),w=Number.parseFloat(clone.getAttribute('width'))||vb[2]||800,h=Number.parseFloat(clone.getAttribute('height'))||vb[3]||600,scale=Math.min(spec.width/w,spec.height/h);clone.setAttribute('width',String(Math.max(1,Math.round(w*scale))));clone.setAttribute('height',String(Math.max(1,Math.round(h*scale))));clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.querySelectorAll('script,foreignObject,iframe').forEach(e=>e.remove());
    for(const e of [clone,...clone.querySelectorAll('*')])for(const a of [...e.attributes]){
        if(/^on/i.test(a.name)||/^(href|xlink:href)$/.test(a.name)&&!/^(#|data:image\/(png|jpeg|gif|webp);base64,)/i.test(a.value))e.removeAttribute(a.name);
    }
    clone.querySelectorAll('style').forEach(e=>e.textContent=e.textContent.replace(/@import[^;]+;/gi,'').replace(/url\(\s*['"]?(?!#)[^)]+\)/gi,'none'));
    const markup=new XMLSerializer().serializeToString(clone),bytes=new TextEncoder().encode(markup);let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const result=await optimizeRaster('data:image/svg+xml;base64,'+btoa(raw),{preset,lineArt:true,canvasFactory,decode});return result;
}
export async function optimizeBookImages(book,{preset=book.imagePreset||'balanced',progress=()=>{},canvasFactory=makeCanvas,decode=loadRaster}={}){
    const cache=new Map(),stats={images:0,originalBytes:0,bytes:0,warnings:[]};
    const process=async data=>{if(cache.has(data))return cache.get(data);progress('Otimizando imagem '+(stats.images+1)+'…');let result;
        try{result=await optimizeRaster(data,{preset,lineArt:/^data:image\/png/i.test(data),canvasFactory,decode});}catch(e){result={data,bytes:dataBytes(data),originalBytes:dataBytes(data)};stats.warnings.push(e.message);}
        stats.images++;stats.originalBytes+=result.originalBytes;stats.bytes+=result.bytes;cache.set(data,result.data);return result.data;
    };
    const chapters=[];for(const chapter of book.chapters){const doc=new DOMParser().parseFromString(chapter.html,'text/html');for(const img of doc.querySelectorAll('img[src^="data:image/"]'))img.setAttribute('src',await process(img.getAttribute('src')));chapters.push({...chapter,html:doc.body.innerHTML});}
    const cover=book.cover?{...book.cover,data:await process(book.cover.data)}:null;
    return {book:{...book,chapters,cover,imagePreset:preset},stats};
}
