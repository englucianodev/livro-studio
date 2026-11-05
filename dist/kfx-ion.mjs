// Bounds-checked Amazon Ion binary reader. Symbol IDs are retained when a shared
// table is unknown; KFX's YJ table uses these IDs for its format vocabulary.
const SYSTEM=['','$ion','$ion_1_0','$ion_symbol_table','name','version','imports','symbols','max_id','$ion_shared_symbol_table'];
export class IonSymbol{constructor(name){this.name=name;}}
export class IonAnnotated{constructor(annotations,value){this.annotations=annotations;this.value=value;}}
export const symbolName=value=>value instanceof IonSymbol?value.name:value;
const BAD=()=>Error('Estrutura Ion inválida ou incompleta no arquivo KFX.');
export function symbolTable(table,kfx=false,catalog={}){
 const symbols=new Map(SYSTEM.map((name,id)=>[id,name]));let offset=9;
 for(const entry of table.imports||[]){
  if(entry.name!=='YJ_symbols'&&!catalog[entry.name])throw Error('O KFX usa uma tabela de símbolos não suportada.');
  const count=entry.max_id-(kfx?9:0);if(!Number.isSafeInteger(count)||count<0||count>100000)throw BAD();
  for(let i=1;i<=count;i++)symbols.set(offset+i,entry.name==='YJ_symbols'?'$'+(i+9):catalog[entry.name][i-1]||'$'+(offset+i));offset+=count;
 }
 for(const value of table.symbols||[]){if(value!==null&&typeof value!=='string')throw BAD();symbols.set(++offset,value||'$'+offset);}
 return symbols;
}
export function readIon(bytes,symbols=new Map(),{keepTables=false,budget={nodes:0},catalog={},retainAnnotations=false}={}){
 let at=0;const decoder=new TextDecoder('utf-8',{fatal:true});
 const name=id=>symbols.get(id)||SYSTEM[id]||'$'+id;
 function take(count,end=bytes.length){if(!Number.isSafeInteger(count)||count<0||at+count>end)throw BAD();const value=bytes.subarray(at,at+count);at+=count;return value;}
 function variable(end){let n=0;for(let i=0;i<8;i++){const b=take(1,end)[0];n=n*128+(b&127);if(!Number.isSafeInteger(n))throw BAD();if(b&128)return n;}throw BAD();}
 function integer(data){let n=0;for(const b of data){n=n*256+b;if(!Number.isSafeInteger(n))throw BAD();}return n;}
 function value(end,depth){
  if(depth>128||++budget.nodes>1000000)throw Error('O KFX excede o limite de complexidade do leitor.');
  const descriptor=take(1,end)[0],type=descriptor>>4,flag=descriptor&15;
  if(flag===15)return null;
  if(type===1){if(flag>1)throw BAD();return !!flag;}
  let length=flag===14?variable(end):flag;
  if(type===13&&flag===1)length=variable(end);
  const stop=at+length;if(stop>end)throw BAD();
  if(type===0){take(length,end);return undefined;}
  if(type===2||type===3){const n=integer(take(length,end));return type===3?-n:n;}
  if(type===4){const data=take(length,end);if(!length)return 0;const view=new DataView(data.buffer,data.byteOffset,data.length);if(length===4)return view.getFloat32(0);if(length===8)return view.getFloat64(0);throw BAD();}
  if(type===5||type===6){take(length,end);return null;} // Dates and decimal layout metrics do not carry book text.
  if(type===7)return new IonSymbol(name(integer(take(length,end))));
  if(type===8)return decoder.decode(take(length,end));
  if(type===9||type===10)return take(length,end);
  if(type===11||type===12){const items=[];while(at<stop){const item=value(stop,depth+1);if(item!==undefined)items.push(item);}return items;}
  if(type===13){const object=Object.create(null);while(at<stop){const key=name(variable(stop)),item=value(stop,depth+1);if(item!==undefined){if(Object.hasOwn(object,key))throw Error('O KFX contém campos Ion repetidos não suportados.');object[key]=item;}}return object;}
  if(type===14){const annotationLength=variable(stop),annotationEnd=at+annotationLength;if(annotationEnd>stop)throw BAD();const annotations=[];while(at<annotationEnd)annotations.push(variable(annotationEnd));const data=value(stop,depth+1);if(at!==stop)throw BAD();if(annotations.includes(3)&&!keepTables){symbols=symbolTable(data,false,catalog);return undefined;}return retainAnnotations?new IonAnnotated(annotations.map(name),data):data;}
  throw BAD();
 }
 const values=[];
 while(at<bytes.length){
  if(bytes[at]===0xe0){const marker=take(4);if(marker[1]!==1||marker[2]!==0||marker[3]!==0xea)throw BAD();continue;}
  if(at===0)throw BAD();
  const item=value(bytes.length,0);if(item!==undefined)values.push(item);
 }
 return values;
}
