/* SPDX-License-Identifier: GPL-3.0-or-later — local UI for the adapted DRM engine. */
export function installDRMImport(){
 const dialog=document.createElement('dialog');dialog.id='drmdialog';
 dialog.innerHTML='<div class="dialogheading"><h2>Importar arquivo protegido</h2><button id="canceldrm" type="button">Cancelar</button></div><p id="drmfilename"></p><p>Informe os dados correspondentes ao arquivo. O processamento ocorre neste navegador; esses dados não são salvos no projeto.</p><form id="drmform" autocomplete="off"><label>Serial ou ID do dispositivo<input id="drmserial" type="password" maxlength="80" autocomplete="off" spellcheck="false"></label><label id="drmpidlabel">PID do livro (opcional, MOBI/AZW)<input id="drmpid" type="password" maxlength="10" autocomplete="off" spellcheck="false"></label><label id="drmsecretlabel">Segredo da conta (quando exigido pelo voucher KFX)<input id="drmsecret" type="password" maxlength="80" autocomplete="off" spellcheck="false"></label><label id="drmvoucherlabel">Voucher KFX (se não estiver no pacote)<input id="drmvoucher" type="file" accept=".voucher,.ast,.ion,.bin"></label><p id="drmhint" class="notice"></p><p id="drmstatus" role="status"></p><div class="actions"><button type="submit" class="primary" id="unlockdrm">Processar e importar</button></div></form>';
 document.body.append(dialog);const $=id=>document.getElementById(id);let active=null;
 function clear(){for(const id of ['drmserial','drmpid','drmsecret','drmvoucher'])$(id).value='';}
 function close(){const state=active;active=null;state?.controller?.abort();clear();dialog.close();state?.reject(Error('Importação do arquivo protegido cancelada.'));}
 $('canceldrm').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 $('drmform').onsubmit=async event=>{
  event.preventDefault();const state=active;if(!state||state.busy)return;state.busy=true;state.controller=new AbortController();$('unlockdrm').disabled=true;$('drmstatus').textContent='Preparando processamento local…';
  const credentials={serial:$('drmserial').value.trim(),pid:$('drmpid').value.trim(),secret:$('drmsecret').value.trim()};
  try{
   const voucher=$('drmvoucher').files[0];if(voucher){if(voucher.size>4*1024*1024)throw Error('O voucher deve ter até 4 MB.');credentials.voucherBytes=new Uint8Array(await voucher.arrayBuffer());}
   const {unlockKindleFile}=await import('./drm-unlock.mjs');
   const file=await unlockKindleFile(state.file,credentials,msg=>{if(active===state){$('drmstatus').textContent=msg;state.progress?.(msg);}},state.controller.signal);
   if(active!==state)return;active=null;clear();dialog.close();state.resolve(file);
  }catch(error){if(active===state)$('drmstatus').textContent=error.message;}
  finally{credentials.serial='';credentials.pid='';credentials.secret='';credentials.voucherBytes?.fill(0);state.busy=false;$('unlockdrm').disabled=false;}
 };
 return (file,progress)=>new Promise((resolve,reject)=>{
  if(active){reject(Error('Conclua o processamento do arquivo protegido atual.'));return;}
  clear();const kfx=/\.kfx(?:-zip)?$/i.test(file.name);$('drmfilename').textContent=file.name;
  $('drmpidlabel').hidden=kfx;$('drmsecretlabel').hidden=!kfx;$('drmvoucherlabel').hidden=!kfx;
  $('drmhint').textContent=kfx?'KFX exige um voucher e os dados do dispositivo/conta associados à licença de compra. Prefira o KFX-ZIP completo. Este mecanismo não reconhece todos os esquemas de DRM.':'Use o serial do Kindle para o qual este arquivo foi preparado ou um PID correspondente. A senha de login da Amazon não é usada aqui.';
  $('drmstatus').textContent='';$('unlockdrm').disabled=false;active={file,progress,resolve,reject,busy:false};dialog.showModal();
 });
}
