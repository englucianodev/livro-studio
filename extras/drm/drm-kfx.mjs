/* SPDX-License-Identifier: GPL-3.0-or-later
 * JavaScript adaptation of Kindle_download_helper/dedrm/kfxdedrm.py,
 * derived from DeDRM_tools (Apprentice Harper et al.).
 * See vendor/DRM-LICENSE.txt and vendor/DRM-SOURCES.md.
 */
import {readIon,IonAnnotated,symbolName} from './kfx-ion.mjs';
const NAMES=['com.amazon.drm.Envelope@1.0','com.amazon.drm.EnvelopeMetadata@1.0','size','page_size','encryption_key','encryption_transformation','encryption_voucher','signing_key','signing_algorithm','signing_voucher','com.amazon.drm.EncryptedPage@1.0','cipher_text','cipher_iv','com.amazon.drm.Signature@1.0','data','com.amazon.drm.EnvelopeIndexTable@1.0','length','offset','algorithm','encoded','encryption_algorithm','hashing_algorithm','expires','format','id','lock_parameters','strategy','com.amazon.drm.Key@1.0','com.amazon.drm.KeySet@1.0','com.amazon.drm.PIDv3@1.0','com.amazon.drm.PlainTextPage@1.0','com.amazon.drm.PlainText@1.0','com.amazon.drm.PrivateKey@1.0','com.amazon.drm.PublicKey@1.0','com.amazon.drm.SecretKey@1.0','com.amazon.drm.Voucher@1.0','public_key','private_key','com.amazon.drm.KeyPair@1.0','com.amazon.drm.ProtectedData@1.0','doctype','com.amazon.drm.EnvelopeIndexTableOffset@1.0','enddoc','license_type','license','watermark','key','value','com.amazon.drm.License@1.0','category','metadata','categorized_metadata','com.amazon.drm.CategorizedMetadata@1.0','com.amazon.drm.VoucherEnvelope@1.0','mac','voucher','com.amazon.drm.ProtectedData@2.0','com.amazon.drm.Envelope@2.0','com.amazon.drm.EnvelopeMetadata@2.0','com.amazon.drm.EncryptedPage@2.0','com.amazon.drm.PlainText@2.0','compression_algorithm','com.amazon.drm.Compressed@1.0','page_index_table','com.amazon.drm.VoucherEnvelope@2.0','com.amazon.drm.VoucherEnvelope@3.0'];
const LIMIT=200*1024*1024;
const un=value=>value instanceof IonAnnotated?value.value:value;
const annotation=value=>value instanceof IonAnnotated?value.annotations[0]:'';
const bad=()=>Error('Estrutura de proteção KFX inválida ou não suportada.');
const values=bytes=>readIon(bytes,new Map(),{catalog:{ProtectedData:NAMES},retainAnnotations:true});
const single=bytes=>{const data=values(bytes);if(data.length!==1)throw bad();return data[0];};
const requireAnnotation=(value,name)=>{if(annotation(value)!==name)throw bad();return un(value);};
const encoder=new TextEncoder();
export function isDrmIon(bytes){return bytes.length>=8&&bytes[0]===234&&String.fromCharCode(...bytes.subarray(1,7))==='DRMION'&&bytes[7]===238;}
export async function decryptCBC(key,iv,data){
 if(!(key instanceof Uint8Array)||![16,24,32].includes(key.length)||!(iv instanceof Uint8Array)||iv.length<16||!(data instanceof Uint8Array)||!data.length||data.length%16)throw bad();
 const imported=await crypto.subtle.importKey('raw',key,'AES-CBC',false,['decrypt']);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-CBC',iv:iv.subarray(0,16)},imported,data));
}
export async function openVoucher(bytes,{serial='',secret=''}={}){
 const envelope=single(bytes);if(!['1.0','2.0','3.0'].some(version=>annotation(envelope)==='com.amazon.drm.VoucherEnvelope@'+version))throw Error('Esta versão do voucher KFX não é suportada pelo mecanismo integrado.');
 const env=un(envelope),strategy=requireAnnotation(env.strategy,'com.amazon.drm.PIDv3@1.0'),voucherNode=single(env.voucher),voucher=requireAnnotation(voucherNode,'com.amazon.drm.Voucher@1.0');
 if(strategy.encryption_algorithm!=='AES'||!['AES/CBC/PKCS7Padding','AES/CBC/PKCS5Padding'].includes(strategy.encryption_transformation)||!['SHA256','SHA-256'].includes(strategy.hashing_algorithm))throw Error('Este algoritmo de proteção KFX não é suportado.');
 if(!Array.isArray(strategy.lock_parameters))throw bad();
 const license=requireAnnotation(voucher.license,'com.amazon.drm.License@1.0');if(license.license_type!=='Purchase')throw Error('O mecanismo do repositório processa somente vouchers de livros comprados.');
 let shared='PIDv3'+strategy.encryption_algorithm+strategy.encryption_transformation+strategy.hashing_algorithm;
 for(const parameter of [...strategy.lock_parameters].sort()){if(parameter==='CLIENT_ID'){if(!serial)throw Error('Informe o serial ou ID do dispositivo correspondente ao voucher KFX.');shared+=parameter+serial;}else if(parameter==='ACCOUNT_SECRET'){if(!secret)throw Error('Este voucher KFX também exige o segredo da conta correspondente.');shared+=parameter+secret;}else throw Error('Este voucher usa um parâmetro de proteção não suportado.');}
 if(!/^[\x20-\x7e]*$/.test(shared))throw Error('Os dados do dispositivo devem conter somente caracteres ASCII.');
 const sharedBytes=encoder.encode(shared),hmac=await crypto.subtle.importKey('raw',sharedBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);sharedBytes.fill(0);
 const key=new Uint8Array(await crypto.subtle.sign('HMAC',hmac,encoder.encode('PIDv3')));let plaintext;
 try{plaintext=await decryptCBC(key,voucher.cipher_iv,un(voucher.cipher_text));}catch{throw Error('Os dados informados não correspondem ao voucher KFX.');}finally{key.fill(0);}
 try{
  const keyset=requireAnnotation(single(plaintext),'com.amazon.drm.KeySet@1.0');if(!Array.isArray(keyset))throw bad();
  for(const entry of keyset)if(annotation(entry)==='com.amazon.drm.SecretKey@1.0'){const item=un(entry);if(item.algorithm!=='AES'||item.format!=='RAW'||!(item.encoded instanceof Uint8Array)||![16,32].includes(item.encoded.length))throw bad();return {key:item.encoded.slice(),id:symbolName(voucher.id||env.id||'')};}
  throw bad();
 }finally{plaintext.fill(0);}
}
export async function decompressKfxPage(bytes,limit=LIMIT){
 if(bytes.length<14||bytes[0]!==0)throw Error('O filtro de compressão deste KFX não é suportado.');
 const input=bytes.subarray(1),view=new DataView(input.buffer,input.byteOffset,input.length),dictionary=view.getUint32(1,true),size=view.getBigUint64(5,true),unknown=size===0xffffffffffffffffn;
 if(dictionary>64*1024*1024||!unknown&&size>BigInt(limit))throw Error('O KFX excede o limite de descompressão.');
 const {LzmaDecoder}=await import('./vendor/drm-codecs.mjs'),decoder=new LzmaDecoder();if(!decoder.setDecoderProperties(input.subarray(0,5)))throw bad();
 let at=13,length=0,chunk=new Uint8Array(Math.min(65536,limit)),used=0;const chunks=[];
 const output={writeByte(byte){if(++length>limit)throw Error('O KFX excede o limite de descompressão.');if(used===chunk.length){chunks.push(chunk);chunk=new Uint8Array(Math.min(65536,limit-length+1));used=0;}chunk[used++]=byte;}};
 if(!decoder.code({readByte(){if(at>=input.length)throw bad();return input[at++];}},output,unknown?-1:Number(size)))throw bad();
 if(!unknown&&length!==Number(size))throw bad();chunks.push(chunk.subarray(0,used));const result=new Uint8Array(length);let offset=0;for(const part of chunks){result.set(part,offset);offset+=part.length;}return result;
}
export async function unlockDrmIon(bytes,getVoucher,remaining=LIMIT){
 if(!isDrmIon(bytes)||bytes.length<20)throw bad();const records=values(bytes.subarray(8,bytes.length-8));
 if(annotation(records[0])!=='doctype')throw bad();const parts=[];let total=0,key=null,pages=0;
 for(const envelope of records){if(annotation(envelope)==='doctype'||annotation(envelope)==='enddoc')continue;
  if(!['com.amazon.drm.Envelope@1.0','com.amazon.drm.Envelope@2.0'].includes(annotation(envelope))||!Array.isArray(un(envelope)))throw bad();
  for(const itemNode of un(envelope)){
   const type=annotation(itemNode),item=un(itemNode);
   if(/^com\.amazon\.drm\.EnvelopeMetadata@[12]\.0$/.test(type)){if(item.encryption_voucher)key=(await getVoucher(symbolName(item.encryption_voucher))).key;}
   else if(/^com\.amazon\.drm\.(EncryptedPage|PlainText)@[12]\.0$/.test(type)){
    const encrypted=type.includes('EncryptedPage'),source=encrypted?item.cipher_text:item.data;
    if(encrypted&&!key)throw Error('O KFX não contém referência a um voucher válido.');
    let data=encrypted?await decryptCBC(key.subarray(0,16),item.cipher_iv,un(source)):un(source);if(!(data instanceof Uint8Array))throw bad();
    if(annotation(source)==='com.amazon.drm.Compressed@1.0'){const compressed=data;try{data=await decompressKfxPage(compressed,remaining-total);}finally{if(encrypted)compressed.fill(0);}}
    else if(annotation(source))throw Error('Este esquema de compressão KFX não é suportado.');
    total+=data.length;if(total>remaining)throw Error('O KFX excede 200 MB após descompactar.');parts.push(data);pages++;
   }else if(type!=='com.amazon.drm.Signature@1.0')throw Error('Este tipo de envelope KFX não é suportado.');
  }
 }
 if(!pages)throw bad();const result=new Uint8Array(total);let at=0;for(const part of parts){result.set(part,at);at+=part.length;}return result;
}
export function voucherCandidate(bytes){if(bytes[0]!==224)return false;try{const item=single(bytes);return /^com\.amazon\.drm\.VoucherEnvelope@/.test(annotation(item));}catch{return false;}}
