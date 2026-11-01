export function installWorkspace(){
 const bar=document.querySelector('.workspacebar');
 const actions=document.createElement('div');actions.className='workspace-actions';
 const focus=document.createElement('button');focus.textContent='⛶ Modo foco';focus.setAttribute('aria-pressed','false');
 focus.onclick=()=>{const on=document.body.classList.toggle('focus-mode');focus.setAttribute('aria-pressed',String(on));focus.textContent=on?'↙ Sair do foco':'⛶ Modo foco';};
 const tools=document.createElement('button');tools.textContent='⚙ Mais ferramentas';tools.setAttribute('aria-expanded','false');
 const advanced=document.querySelector('.advanced-tools');advanced.id='advancedtools';tools.setAttribute('aria-controls',advanced.id);
 tools.onclick=()=>{const on=document.body.classList.toggle('expanded-tools');tools.setAttribute('aria-expanded',String(on));};
 const pages=document.createElement('button');pages.textContent='▤ Miniaturas';pages.setAttribute('aria-pressed','false');
 pages.onclick=()=>{const on=document.body.classList.toggle('show-thumbnails');pages.setAttribute('aria-pressed',String(on));};
 actions.append(tools,pages,focus);bar.append(actions);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('focus-mode')&&!document.querySelector('dialog[open]'))focus.click();});
 const metadata=document.querySelector('.bookmeta');
 const settings=document.createElement('details');settings.className='book-settings';
 const summary=document.createElement('summary');summary.textContent='Configurações do livro';metadata.after(settings);settings.append(summary);
 const preset=document.getElementById('imagepreset').closest('label');
 const filename=document.getElementById('exportfilename').closest('label');
 settings.append(filename,preset);
 preset.firstChild.textContent='Qualidade das imagens no EPUB';
}
