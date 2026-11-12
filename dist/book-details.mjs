// Metadados do livro, backup, painel lateral no celular e proteção do armazenamento.
const $=id=>document.getElementById(id);

export const LANGUAGES=[['pt-BR','Português (Brasil)'],['pt-PT','Português (Portugal)'],['en','Inglês'],['es','Espanhol'],['fr','Francês'],['it','Italiano'],['de','Alemão']];
const FIELDS=[
 ['description','bookdescription'],['publisher','bookpublisher'],['pubDate','bookdate'],['isbn','bookisbn'],
 ['series','bookseries'],['seriesIndex','bookseriesindex'],['subject','booksubject'],['language','booklanguage']
];

export function installBookDetails({save,onRestore,toast}){
 const settings=document.querySelector('.book-settings');
 if(settings&&!$('bookdetails')){
  const box=document.createElement('div');box.className='book-details';box.id='bookdetails';
  box.innerHTML=`
   <label>Idioma do livro<select id="booklanguage">${LANGUAGES.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>
   <label>Descrição / sinopse<textarea id="bookdescription" maxlength="4000" placeholder="Aparece nos detalhes do livro no Kindle"></textarea></label>
   <label>Editora<input id="bookpublisher" maxlength="200" placeholder="Opcional"></label>
   <label>Data de publicação<input id="bookdate" type="date"></label>
   <label>ISBN<input id="bookisbn" maxlength="20" inputmode="numeric" placeholder="Opcional"><small id="isbnstatus"></small></label>
   <div class="pair"><label>Série<input id="bookseries" maxlength="200" placeholder="Opcional"></label><label>Nº<input id="bookseriesindex" type="number" min="0" step="1"></label></div>
   <label>Assunto / gênero<input id="booksubject" maxlength="300" placeholder="Ex.: Romance; Ficção brasileira"><small>Separe vários com ponto e vírgula.</small></label>
   <span class="eyebrow" style="margin-top:6px">Backup</span>
   <small>Os livros ficam salvos só neste navegador. Guarde um backup para não perder seu trabalho.</small>
   <div class="backup-actions"><button type="button" id="savebackup">↓ Salvar backup</button><button type="button" id="openbackup">↥ Abrir backup</button></div>
   <input type="file" id="backupfile" accept=".json,application/json" hidden>`;
  settings.append(box);
  for(const [,id] of FIELDS)$(id).addEventListener(id==='booklanguage'?'change':'input',save);
  $('bookisbn').addEventListener('input',isbnStatus);
  $('openbackup').onclick=()=>$('backupfile').click();
  $('backupfile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(file)await onRestore(file);};
 }
 installAsideToggle();
 installFilenameSync();
 protectStorage(toast);
}

export function readBookDetails(book){
 if(!$('bookdetails'))return;
 for(const [key,id] of FIELDS)book[key]=$(id).value;
}
export function writeBookDetails(book){
 if(!$('bookdetails'))return;
 for(const [key,id] of FIELDS)$(id).value=book[key]??(key==='language'?'pt-BR':'');
 if(!LANGUAGES.some(([v])=>v===$('booklanguage').value)&&book.language){const o=document.createElement('option');o.value=o.textContent=book.language;$('booklanguage').append(o);$('booklanguage').value=book.language;}
 isbnStatus();
}

function isbnStatus(){const v=$('bookisbn').value;$('isbnstatus').textContent=!v.trim()?'':validISBN(v)?'✓ ISBN válido':'ISBN inválido: confira os dígitos.';}
export function validISBN(value){
 const s=String(value).replace(/[\s-]/g,'').toUpperCase();
 if(/^\d{9}[\dX]$/.test(s)){let sum=0;for(let i=0;i<10;i++)sum+=(s[i]==='X'?10:+s[i])*(10-i);return sum%11===0;}
 if(/^\d{13}$/.test(s)){let sum=0;for(let i=0;i<13;i++)sum+=+s[i]*(i%2?3:1);return sum%10===0;}
 return false;
}

function installAsideToggle(){
 const aside=document.querySelector('.layout>aside');if(!aside||$('asidetoggle'))return;
 const button=document.createElement('button');button.type='button';button.id='asidetoggle';button.setAttribute('aria-expanded','false');
 const label=()=>{const open=document.body.classList.contains('aside-open');button.innerHTML=`<span>☰ Capítulos, capa e importação</span><span>${open?'▲':'▼'}</span>`;button.setAttribute('aria-expanded',String(open));};
 button.onclick=()=>{document.body.classList.toggle('aside-open');label();};
 aside.querySelector('.bookmeta')?.after(button);label();
}

// O nome do arquivo acompanha o título enquanto o usuário não o personalizar.
function installFilenameSync(){
 const title=$('title'),file=$('exportfilename');if(!title||!file)return;
 let previous=title.value;
 title.addEventListener('focus',()=>{previous=title.value;});
 document.addEventListener('input',e=>{
  if(e.target!==title)return;
  if(!file.value.trim()||file.value===previous)file.value=title.value;
  previous=title.value;
 },true);
}

async function protectStorage(toast){
 try{
  if(navigator.storage?.persist&&!(await navigator.storage.persisted?.()))await navigator.storage.persist();
  const est=await navigator.storage?.estimate?.();
  if(est?.quota&&est.usage/est.quota>.8)toast?.('O espaço do navegador está quase cheio. Salve um backup do livro em Configurações do livro.');
 }catch{}
}
