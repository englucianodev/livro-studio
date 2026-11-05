# Development only: run through calibre-debug -e after obtaining KFX Input reference source.
import os, base64, sys, io
from pathlib import Path
reference=Path(os.environ.get('KFX_INPUT_REFERENCE','.kfx-reference')).resolve()
sys.path.insert(0,str(reference))
sys.path.insert(0,str(reference / 'kfxlib' / 'calibre-plugin-modules'))
from kfxlib.ion import IonStruct, IonBLOB, IS
from kfxlib.ion_symbol_table import LocalSymbolTable
from kfxlib.kfx_container import KfxContainer
from kfxlib.yj_container import YJFragment, YJFragmentList
from kfxlib.utilities import DataFile

out=Path('tests/fixtures');out.mkdir(parents=True,exist_ok=True)
symbols=LocalSymbolTable('YJ_symbols')
for name in ['section-two','section-one','story-two','story-one','bold-style','picture','picture.png','text-store']:
    symbols.create_local_symbol(name)
def st(**kwargs):return IonStruct({IS(key):value for key,value in kwargs.items()})
def fragment(kind,value,name=None):return YJFragment(ftype=IS(kind),fid=IS(name) if name else None,value=value)
node=lambda text:st(**{'$159':IS('$269'),'$145':text})
first_story=st(**{'$176':IS('story-one'),'$146':[
    st(**{'$159':IS('$269'),'$790':1,'$145':'Capítulo 1 — Histórias 🌎'}),
    st(**{'$159':IS('$269'),'$145':'Ação, edição e negrito.','$142':[st(**{'$143':15,'$144':7,'$157':IS('bold-style')})]}),
    st(**{'$159':IS('$276'),'$146':[st(**{'$159':IS('$277'),'$145':'Primeiro item'}),st(**{'$159':IS('$277'),'$145':'Segundo item'})]}),
    st(**{'$159':IS('$271'),'$164':IS('picture'),'$584':'Figura de exemplo'}),
    st(**{'$159':IS('$278'),'$146':[st(**{'$159':IS('$279'),'$146':[st(**{'$159':IS('$270'),'$145':'Nome'}),st(**{'$159':IS('$270'),'$145':'Valor'})]}),st(**{'$159':IS('$279'),'$146':[st(**{'$159':IS('$270'),'$145':'Maçã'}),st(**{'$159':IS('$270'),'$145':'20'})]})]})
]})
second_story=st(**{'$176':IS('story-two'),'$146':[node('Capítulo 2'),node(st(**{'name':IS('text-store'),'$403':0}))]})
items=[
fragment('$270',st(**{'$409':'Livro-Studio-fixture'})),
YJFragment(symbols.create_import()),
fragment('$419',st()),
fragment('$258',st(**{'$153':'Histórias KFX sem DRM','$222':'Luciano','$10':'pt-BR'})),
fragment('$538',st(**{'$169':[st(**{'$170':[IS('section-one'),IS('section-two')]})],'$436':IS('$442')})),
fragment('$260',st(**{'$174':IS('section-two'),'$141':[st(**{'$159':IS('$270'),'$176':IS('story-two')})]}),'section-two'),
fragment('$260',st(**{'$174':IS('section-one'),'$141':[st(**{'$159':IS('$270'),'$176':IS('story-one')})]}),'section-one'),
fragment('$259',second_story,'story-two'),fragment('$259',first_story,'story-one'),
fragment('$157',st(**{'$173':IS('bold-style'),'$13':IS('$361')}),'bold-style'),
fragment('$145',st(**{'name':IS('text-store'),'$146':['Fim da história, sem perda de conteúdo.']}),'text-store'),
fragment('$164',st(**{'$175':IS('picture'),'$165':'picture.png','$161':IS('$284')}),'picture'),
fragment('$417',IonBLOB(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')),'picture.png'),
]
# Serialize using the independent KFX Input implementation, not the app reader.
data=KfxContainer(symbols,fragments=YJFragmentList(items)).serialize()
(out/'sample.kfx').write_bytes(data)
check=KfxContainer(LocalSymbolTable('YJ_symbols'),datafile=DataFile(io.BytesIO(data)))
check.deserialize()
print('Independent KFX Input validation:',len(check.get_fragments()),'fragments;',len(data),'bytes')

for name, kinds in [('metadata',{'$258','$538'}),('content',{'$260','$259','$157','$145'}),('resources',{'$164','$417'})]:
    group=[item for item in items if item.ftype in kinds or item.ftype in {'$270','$ion_symbol_table','$419'}]
    (out/(name+'.kfx')).write_bytes(KfxContainer(symbols,fragments=YJFragmentList(group)).serialize())
