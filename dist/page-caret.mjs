// Text and explicit line breaks give a stable position when paragraphs cross pages.
// Repeated table headings are presentation copies, so count them only once.
export function caretUnits(root,seen=new Set()){
 const units=[];
 function visit(node){
  if(node.nodeType===3){if(node.length)units.push({node,length:node.length});return;}
  if(node.nodeType!==1&&node.nodeType!==11)return;
  if(node.nodeType===1){
   const key=node.getAttribute('data-page-node');
   if(key&&['thead','caption','colgroup'].includes(node.localName)){if(seen.has(key))return;seen.add(key);}
   if(node.localName==='br'){units.push({node,length:1});return;}
  }
  for(const child of node.childNodes)visit(child);
 }
 visit(root);return units;
}
export const unitsLength=units=>units.reduce((total,unit)=>total+unit.length,0);
export function caretPoint(root,offset,affinity='backward',seen=new Set()){
 const units=caretUnits(root,seen);let remaining=Math.max(0,offset);
 for(let i=0;i<units.length;i++){
  const {node,length}=units[i];
  if(remaining<length||remaining===length&&(affinity!=='forward'||i===units.length-1)){
   if(node.nodeType===3)return {node,offset:Math.min(remaining,length)};
   return {node:node.parentNode,offset:[...node.parentNode.childNodes].indexOf(node)+(remaining?1:0)};
  }
  remaining-=length;
 }
 return {node:root,offset:root.childNodes.length};
}
