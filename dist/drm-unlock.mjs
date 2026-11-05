/* SPDX-License-Identifier: GPL-3.0-or-later — see vendor/DRM-SOURCES.md. */
import {unlockMobi} from './drm-mobi.mjs';
import {isDrmIon,openVoucher,unlockDrmIon,voucherCandidate} from './drm-kfx.mjs';
const LIMIT=200*1024*1024;
export async function unlockKindleBytes(bytes,credentials={},progress=()=>{}){
 if(bytes.length>80*1024*1024)throw Error('Importe um arquivo de até 80 MB.');
 if(!globalThis.crypto?.subtle)throw Error('Abra o site por HTTPS ou pelo servidor local para processar arquivos protegidos.');
 if(bytes.length>=68&&['BOOKMOBI','TEXtREAd'].includes(String.fromCharCode(...bytes.subarray(60,68))))return unlockMobi(bytes,credentials,progress);
 const entries=[];let zip=null,total=0;
 if(bytes[0]===80&&bytes[1]===75){
  if(!globalThis.JSZip)throw Error('Recarregue a página para carregar o leitor de pacotes.');zip=await JSZip.loadAsync(bytes);const files=Object.values(zip.files).filter(entry=>!entry.dir);if(files.length>2000)throw Error('O pacote contém arquivos demais.');
  for(const entry of files){const size=entry._data?.uncompressedSize;if(!Number.isSafeInteger(size)||size<0||(total+=size)>LIMIT)throw Error('O pacote excede 200 MB após descompactar.');const data=await entry.async('uint8array');if(data.length!==size)throw Error('Pacote ZIP inconsistente.');entries.push({name:entry.name,data});}
 }else if(isDrmIon(bytes))entries.push({name:'livro.kfx',data:bytes});else throw Error('Este arquivo não usa um esquema de DRM reconhecido pelo mecanismo integrado.');
 const encrypted=entries.filter(entry=>isDrmIon(entry.data));if(!encrypted.length)throw Error('Não foram encontrados contêineres DRMION protegidos neste arquivo.');
 const vouchers=entries.filter(entry=>voucherCandidate(entry.data));
 if(credentials.voucherBytes?.length){if(!voucherCandidate(credentials.voucherBytes))throw Error('O arquivo selecionado não contém um voucher KFX reconhecido.');vouchers.push({name:'voucher selecionado',data:credentials.voucherBytes});}
 if(!vouchers.length)throw Error('Falta o voucher KFX. Importe o pacote KFX-ZIP completo ou selecione o arquivo de voucher.');
 const opened=[];
 try{
  let lastError;for(const entry of vouchers)try{opened.push({...await openVoucher(entry.data,credentials),name:entry.name});}catch(error){lastError=error;}
  if(!opened.length)throw lastError;
  const getVoucher=async id=>{const match=opened.find(v=>v.id===id||v.name===id||v.name.endsWith('/'+id));if(match)return match;if(opened.length===1)return opened[0];throw Error('O pacote contém vários vouchers; não foi possível associar a licença ao contêiner.');};
  let outputSize=entries.filter(entry=>!isDrmIon(entry.data)).reduce((n,e)=>n+e.data.length,0);
  for(let i=0;i<encrypted.length;i++){const entry=encrypted[i];progress('Processando KFX · contêiner '+(i+1)+'/'+encrypted.length);entry.output=await unlockDrmIon(entry.data,getVoucher,LIMIT-outputSize);outputSize+=entry.output.length;}
  if(!zip)return encrypted[0].output;
  const result=new JSZip();for(const entry of entries)result.file(entry.name,entry.output||entry.data);return result.generateAsync({type:'uint8array',compression:'DEFLATE'});
 }finally{for(const voucher of opened)voucher.key.fill(0);}
}
export async function unlockKindleFile(file,credentials,progress=()=>{},signal){
 const bytes=new Uint8Array(await file.arrayBuffer());let result;
 if(typeof Worker!=='undefined')result=await new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./drm-worker.mjs',import.meta.url),{type:'module'});
  const finish=(error,value)=>{worker.terminate();signal?.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
  const cancel=()=>finish(Error('Processamento cancelado.'));if(signal?.aborted){cancel();return;}signal?.addEventListener('abort',cancel,{once:true});
  worker.onmessage=({data})=>{if(data.progress)progress(data.progress);else if(data.error)finish(Error(data.error));else finish(null,new Uint8Array(data.bytes));};worker.onerror=()=>finish(Error('Não foi possível iniciar o processamento local de DRM. Recarregue a página.'));
  worker.postMessage({bytes,credentials},[bytes.buffer]);
 });else result=await unlockKindleBytes(bytes,credentials,progress);
 return new File([result],file.name,{type:file.type||'application/octet-stream'});
}
