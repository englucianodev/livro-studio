import {makeCanvas,encodeCanvas} from './media.mjs';
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export function visualRegions(list,OPS,viewport){
 const names=Object.fromEntries(Object.entries(OPS).map(([k,v])=>[v,k])),boxes=[];let matrix=[1,0,0,1,0,0],stack=[],path=null;
 const box=(coords)=>{const points=[];for(let i=0;i<coords.length;i+=2){const x=matrix[0]*coords[i]+matrix[2]*coords[i+1]+matrix[4],y=matrix[1]*coords[i]+matrix[3]*coords[i+1]+matrix[5];points.push(viewport.convertToViewportPoint(x,y));}return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];};
 for(let i=0;i<list.fnArray.length;i++){const op=names[list.fnArray[i]],a=list.argsArray[i]||[];
  if(op==='save')stack.push([...matrix]);else if(op==='restore')matrix=stack.pop()||matrix;else if(op==='transform')matrix=multiply(matrix,a);
  else if(op==='beginGroup'){stack.push([...matrix]);if(a[0]?.matrix)matrix=multiply(matrix,a[0].matrix);}else if(op==='endGroup')matrix=stack.pop()||matrix;
  else if(op==='paintFormXObjectBegin'){stack.push([...matrix]);if(a[0])matrix=multiply(matrix,a[0]);}else if(op==='paintFormXObjectEnd')matrix=stack.pop()||matrix;
  else if(/^paint(?:Inline)?ImageXObject$|^paintImageMaskXObject$/.test(op))boxes.push(Object.assign(box([0,0,1,0,1,1,0,1]),{image:true}));
  else if(op==='paintImageXObjectRepeat'||op==='paintImageMaskXObjectRepeat'){const saved=[...matrix],positions=a.at(-1)||[];for(let n=0;n<positions.length;n+=2){matrix=multiply(saved,[a[1],0,0,a[2],positions[n],positions[n+1]]);boxes.push(Object.assign(box([0,0,1,0,1,1,0,1]),{image:true}));}matrix=saved;}
  else if(op==='paintInlineImageXObjectGroup'||op==='paintImageMaskXObjectGroup'){const saved=[...matrix];for(const item of (op==='paintInlineImageXObjectGroup'?a[1]:a[0])||[]){if(!item.transform)continue;matrix=multiply(saved,item.transform);boxes.push(Object.assign(box([0,0,1,0,1,1,0,1]),{image:true}));}matrix=saved;}
  else if(op==='constructPath'){const bounds=a[2];if(bounds?.length===4)path=box([bounds[0],bounds[2],bounds[1],bounds[2],bounds[1],bounds[3],bounds[0],bounds[3]]);else{const coords=[],ops=a[0]||[],args=a[1]||[];let offset=0;for(const id of ops){const name=names[id],count=name==='rectangle'?4:/^curveTo$/.test(name)?6:/^curveTo[23]$/.test(name)?4:/^(moveTo|lineTo)$/.test(name)?2:0;const part=args.slice(offset,offset+count);offset+=count;if(name==='rectangle')coords.push(part[0],part[1],part[0]+part[2],part[1]+part[3]);else coords.push(...part);}if(coords.length)path=box(coords);}}
  else if(/^(stroke|closeStroke|fill|eoFill|fillStroke|eoFillStroke|closeFillStroke|closeEOFillStroke)$/.test(op)){if(path)boxes.push(path);path=null;}else if(op==='endPath')path=null;
 }
 let regions=boxes.filter(b=>b.every(Number.isFinite)&&(b[2]-b[0]>1||b[3]-b[1]>1)&&(b.image||(b[2]-b[0])*(b[3]-b[1])<viewport.width*viewport.height*.92));
 // Connected strokes form one chart/table; isolated rules are discarded below.
 let changed=true;while(changed){changed=false;outer:for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++){const a=regions[i],b=regions[j];if(a[0]<=b[2]+5&&a[2]+5>=b[0]&&a[1]<=b[3]+5&&a[3]+5>=b[1]){regions[i]=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];regions.splice(j,1);changed=true;break outer;}}}
 return regions.filter(b=>b[2]-b[0]>24&&b[3]-b[1]>18).map(b=>({x:Math.max(0,b[0]-4),top:Math.max(0,b[1]-4),right:Math.min(viewport.width,b[2]+4),bottom:Math.min(viewport.height,b[3]+4)}));
}
export async function capturePDFVisuals(page,viewport,{canvasFactory=makeCanvas,OPS=globalThis.pdfjsLib?.OPS,lines=[]}={}){
 const regions=visualRegions(await page.getOperatorList(),OPS||{},viewport);
 const rows=(lines.some(l=>/^(sum[áa]rio|[íi]ndice|contents)$/i.test(l.text.trim()))?[]:lines).map(l=>({...l,cells:(l.cells||[]).filter(c=>c.text.trim())})).filter(l=>l.cells.some((c,i)=>i&&c.x-l.cells[i-1].endX>l.size*2));let group=[];const flush=()=>{if(group.length>=3){const cells=group.flatMap(l=>l.cells);const r={x:Math.max(0,Math.min(...cells.map(c=>c.x))-4),top:Math.max(0,group[0].top-group[0].size-4),right:Math.min(viewport.width,Math.max(...cells.map(c=>c.endX))+4),bottom:group.at(-1).top+6};if(!regions.some(v=>v.x<=r.right&&v.right>=r.x&&v.top<=r.bottom&&v.bottom>=r.top))regions.push(r);}group=[];};for(const row of rows){const prev=group.at(-1);if(prev&&(row.top-prev.top>row.size*3||Math.abs(row.cells[0].x-prev.cells[0].x)>8||Math.abs(row.cells.at(-1).x-prev.cells.at(-1).x)>12))flush();group.push(row);}flush();if(!regions.length)return [];
 const scale=Math.min(2.5,1800/viewport.width,2600/viewport.height),view=page.getViewport({scale}),canvas=canvasFactory(Math.ceil(view.width),Math.ceil(view.height));
 try{await page.render({canvasContext:canvas.getContext('2d'),viewport:view,background:'white'}).promise;const visuals=[];
 for(const r of regions){const c=canvasFactory(Math.max(1,Math.ceil((r.right-r.x)*scale)),Math.max(1,Math.ceil((r.bottom-r.top)*scale))),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(canvas,r.x*scale,r.top*scale,c.width,c.height,0,0,c.width,c.height);visuals.push({...r,...encodeCanvas(c,{lineArt:true}),alt:'Figura, gráfico ou tabela da página original'});}return visuals;
 }finally{canvas.width=1;canvas.height=1;}
}
export function composePDFVisualLines(page){
 if(!page.visuals?.length)return page;const lines=page.lines.filter(l=>!page.visuals.some(v=>l.top>=v.top&&l.top<=v.bottom&&l.x>=v.x-3&&(l.endX||l.x)<=v.right+3));
 for(const v of page.visuals)lines.push({x:v.x,top:v.top,endX:v.right,size:0,text:'',visual:v});return {...page,lines:lines.sort((a,b)=>a.top-b.top||a.x-b.x)};
}
