/* SPDX-License-Identifier: GPL-3.0-or-later */
import './vendor/jszip.min.js';
import {unlockKindleBytes} from './drm-unlock.mjs';
self.onmessage=async({data})=>{
 try{const bytes=await unlockKindleBytes(data.bytes,data.credentials,progress=>self.postMessage({progress}));self.postMessage({bytes:bytes.buffer},[bytes.buffer]);}
 catch(error){self.postMessage({error:error.message||'Não foi possível processar o arquivo protegido.'});}
 finally{if(data.credentials){data.credentials.serial='';data.credentials.secret='';data.credentials.pid='';data.credentials.voucherBytes?.fill(0);}}
};
