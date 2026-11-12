/* SPDX-License-Identifier: GPL-3.0-or-later
 * Adapted for JavaScript from Kindle_download_helper/DeDRM_tools:
 * Copyright 2008 The Dark Reverser; 2008–2020 Apprentice Harper et al.
 * Browser integration and bounds checks: Livro Studio contributors.
 * See vendor/DRM-LICENSE.txt and vendor/DRM-SOURCES.md.
 */
const encoder=new TextEncoder(),CHAR='ABCDEFGHIJKLMNPQRSTUVWXYZ123456789',BASE64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const KEY=Uint8Array.from([0x72,0x38,0x33,0xb0,0xb4,0xf2,0xe3,0xca,0xdf,9,1,0xd6,0xe2,0xe0,0x3f,0x96]);
const bad=()=>Error('Estrutura MOBI/AZW inválida ou incompleta.');
const join=arrays=>{const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let at=0;for(const a of arrays){out.set(a,at);at+=a.length;}return out;};
export function pc1(key,source,decrypt=true){
 if(key.length!==16)throw bad();let sum1=0,sum2=0,keyXor=0;const words=Array.from({length:8},(_,i)=>(key[i*2]<<8)|key[i*2+1]),out=new Uint8Array(source.length);
 for(let i=0;i<source.length;i++){let temp=0,xor=0;for(let j=0;j<8;j++){temp^=words[j];sum2=(sum2+j)*20021+sum1;sum1=temp*346&65535;sum2=(sum2+sum1)&65535;temp=(temp*20021+1)&65535;xor^=temp^sum2;}let byte=source[i];if(!decrypt)keyXor=byte*257;byte=((byte^(xor>>8))^xor)&255;if(decrypt)keyXor=byte*257;for(let j=0;j<8;j++)words[j]^=keyXor;out[i]=byte;}
 return out;
}
function crc(data){let n=0;for(const byte of data){n^=byte;for(let i=0;i<8;i++)n=n&1?(n>>>1)^0xedb88320:n>>>1;}return n>>>0;}
export async function mobiPids(serial,rec209=new Uint8Array(),token=new Uint8Array(),pid=''){
 const pids=[];if(pid){if(!/^[a-zA-Z0-9+/*]{8}(?:[a-zA-Z0-9]{2})?$/.test(pid))throw Error('O PID deve ter 8 ou 10 caracteres.');pids.push(pid.slice(0,8));}
 if(serial){const bytes=encoder.encode(serial),hash=new Uint8Array(await crypto.subtle.digest('SHA-1',join([bytes,rec209,token])));let book='';for(let i=0;i<8;i++){const bit=i*6,at=bit>>3,shift=bit&7;const value=((hash[at]<<8)|(hash[at+1]||0))>>(10-shift);book+=BASE64[value&63];}pids.push(book);
  const code=crc(bytes),mixed=new Uint8Array(7),crcBytes=[code>>>24,code>>>16&255,code>>>8&255,code&255];for(let i=0;i<bytes.length;i++)mixed[i%7]^=bytes[i];let fixed='';for(let i=0;i<7;i++){const b=mixed[i]^crcBytes[i&3];fixed+=CHAR[(b>>7)+((b>>5&3)^(b&31))];}pids.push(fixed+'*');
 }
 return pids;
}
function trailing(bytes,flags){let total=0;for(let mask=flags>>>1;mask;mask>>>=1)if(mask&1){let amount=0,shift=0,at=bytes.length-total;for(let i=0;i<4;i++){if(at<=0)throw bad();const b=bytes[--at];amount|=(b&127)<<shift;shift+=7;if(b&128)break;}if(amount<=0||amount>bytes.length-total)throw bad();total+=amount;}if(flags&1){if(total>=bytes.length)throw bad();total+=(bytes[bytes.length-total-1]&3)+1;}if(total>bytes.length)throw bad();return total;}
export async function unlockMobi(input,{serial='',pid=''}={},progress=()=>{}){
 const bytes=input.slice(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);if(bytes.length<86)throw bad();const magic=String.fromCharCode(...bytes.subarray(60,68));if(!['BOOKMOBI','TEXtREAd'].includes(magic))throw bad();
 const count=view.getUint16(76),offsets=[];if(!count||78+count*8>bytes.length)throw bad();for(let i=0;i<count;i++){const offset=view.getUint32(78+i*8);if(offset<78+count*8||offset>bytes.length||i&&offset<offsets[i-1])throw bad();offsets.push(offset);}offsets.push(bytes.length);
 const record=n=>{if(n<0||n>=count)throw bad();return bytes.subarray(offsets[n],offsets[n+1]);},header=record(0),hv=new DataView(header.buffer,header.byteOffset,header.length);if(header.length<16)throw bad();const encryption=hv.getUint16(12);if(!encryption)return bytes;if(![1,2].includes(encryption))throw Error('Este esquema de DRM MOBI/AZW não é suportado.');
 const records=hv.getUint16(8),compression=hv.getUint16(0),metadata=new Map();if(records>=count)throw bad();let length=0,version=-1,flags=0;
 if(magic==='BOOKMOBI'){
  if(header.length<132)throw bad();length=hv.getUint32(20);version=hv.getUint32(104);if(length<116||length+16>header.length)throw bad();if(length>=228&&version>=5){if(header.length<244)throw bad();flags=hv.getUint16(242);}if(compression!==17480)flags&=65534;
  if(hv.getUint32(128)&64){let at=length+16;if(at+12>header.length||String.fromCharCode(...header.subarray(at,at+4))!=='EXTH')throw bad();const size=hv.getUint32(at+4),items=hv.getUint32(at+8),end=at+size;if(size<12||end>header.length||items>100000)throw bad();at+=12;for(let i=0;i<items;i++){if(at+8>end)throw bad();const key=hv.getUint32(at),size=hv.getUint32(at+4);if(size<8||at+size>end)throw bad();metadata.set(key,header.slice(at+8,at+size));at+=size;}}
 }
 if(metadata.get(406)?.some(byte=>byte!==0))throw Error('O mecanismo do repositório não processa livros alugados ou de biblioteca.');
 let bookKey;
 if(encryption===1){const at=magic==='TEXtREAd'?14:version<0?144:length+16;if(at+16>header.length)throw bad();bookKey=pc1(encoder.encode('QDCVEPMU675RUBSZ'),header.subarray(at,at+16));}
 else{
  if(header.length<184)throw bad();const start=hv.getUint32(168),entries=hv.getUint32(172),size=hv.getUint32(176);if(!entries||entries>10000||size<entries*48||start+size>header.length)throw bad();
  const rec209=metadata.get(209)||new Uint8Array(),tokens=[];if(rec209.length%5)throw bad();for(let at=0;at<rec209.length;at+=5){const key=new DataView(rec209.buffer,rec209.byteOffset+at+1,4).getUint32(0);tokens.push(metadata.get(key)||new Uint8Array());}
  const pids=await mobiPids(serial,rec209,join(tokens),pid);
  const candidates=pids.map(pid=>{const padded=new Uint8Array(16);padded.set(encoder.encode(pid));return {key:pc1(KEY,padded,false),specific:true};});candidates.push({key:KEY,specific:false});
  for(const candidate of candidates){const sum=candidate.key.reduce((a,b)=>a+b,0)&255;for(let i=0;i<entries;i++){const at=start+i*48;if(header[at+12]!==sum)continue;const decoded=pc1(candidate.key,header.subarray(at+16,at+48)),dv=new DataView(decoded.buffer);if(hv.getUint32(at)===dv.getUint32(0)&&(!candidate.specific||(dv.getUint32(4)&31)===1)){bookKey=decoded.slice(8,24);break;}}if(bookKey)break;}
  if(!bookKey)throw Error('Serial ou PID não corresponde a este livro, ou o esquema de DRM não é suportado.');
  header.fill(0,start,start+size);header.fill(0,168,184);hv.setUint32(168,0xffffffff);
 }
 hv.setUint16(12,0);
 for(let i=1;i<=records;i++){const data=record(i),extra=trailing(data,flags);data.set(pc1(bookKey,data.subarray(0,data.length-extra)));if(i%40===0){progress('Processando MOBI/AZW · registro '+i+'/'+records);await new Promise(resolve=>setTimeout(resolve,0));}}
 bookKey.fill(0);return bytes;
}
