# Livro Studio — projeto local

Esta pasta contém o código completo da versão atual do editor, com suas bibliotecas de importação incluídas. Não é necessário executar npm install.

## Iniciar no Windows

1. Tenha o Node.js 20 ou superior instalado.
2. Dê dois cliques em INICIAR.cmd.
3. Abra http://127.0.0.1:8787 no navegador.
4. Mantenha a janela do servidor aberta durante o uso. Pressione Ctrl+C para encerrar.

Alternativa pelo terminal, dentro desta pasta: node servidor.mjs (ou npm start).

Não abra dist/index.html diretamente: os módulos JavaScript e o leitor PDF precisam do servidor local.

## Arquivos

- dist/index.html: interface do editor.
- dist/app.js: edição, armazenamento e interação.
- dist/book-tools.mjs: organização do texto e estilos adaptáveis.
- dist/importers.mjs: importação PDF, TXT, EPUB, MOBI, AZW/AZW3 e exportação EPUB.
- dist/mobile.css: interface responsiva e ferramentas de organização.
- dist/vendor/: bibliotecas JSZip, PDF.js e leitor MOBI/KF8 do Foliate, com avisos de licença nos arquivos e foliate-LICENSE.
- servidor.mjs: servidor HTTP local, sem dependências adicionais.
- INICIAR.cmd: inicializador para Windows.

## Trazer seus livros da versão online

O código do projeto não inclui os livros salvos no navegador. Na versão online, clique em Salvar backup editável. Na versão local, use Abrir backup para importar esse arquivo JSON. Cada endereço e navegador tem seu próprio armazenamento; use sempre o mesmo endereço local acima. Guarde backups dos livros importantes.

## Recursos e limites

Importação de ebooks sem DRM e PDFs com texto selecionável; organização com comparação antes/depois; reconstrução opcional de parágrafos; preservação de versos; prévia com diferentes larguras e fontes; exportação EPUB com sumário e imagens rasterizadas quando disponíveis. A saída é EPUB, inclusive para livros originalmente em MOBI ou AZW.

A reconstrução automática precisa de revisão, especialmente em poesia, colunas, notas e títulos ambíguos. PDFs escaneados precisam de OCR. Figuras, gráficos e tabelas detectados no PDF são preservados como blocos de imagem otimizados. A diagramação fixa completa é substituída por texto adaptável. KFX e Topaz não são suportados.

Os livros são processados e salvos localmente no navegador. As bibliotecas de conversão estão incluídas; as fontes visuais podem usar Google Fonts quando houver internet, com alternativas locais disponíveis. O envio pelo Send to Kindle requer internet.

Esta exportação é independente da hospedagem Sites e não contém credenciais nem configuração de publicação do site original.

## Limpeza de cabeçalhos e rodapés

Ao importar PDF, o editor compara elementos nas margens de várias páginas e oferece as versões com e sem limpeza, com a lista dos trechos detectados. Frases interrompidas entre páginas são reconstruídas quando há continuidade clara.

Para livros já importados, abra Organizar texto e marque Limpar cabeçalhos, rodapés e paginação. Selecione os cabeçalhos sugeridos ou informe os textos exatos. Se já estiverem misturados à frase, ative a remoção no meio do parágrafo. Confira a comparação antes de aplicar; a última organização pode ser desfeita enquanto a página estiver aberta. Para maior precisão, reimporte o PDF original.


## Projetos, capítulos, capas e páginas

- Arraste arquivos para a área de importação ou selecione vários arquivos. Confira a ordem e os capítulos no resumo; use Adicionar ao projeto para reunir PDFs e ebooks.
- Os capítulos são identificados pelo sumário do arquivo, títulos e tipografia. EPUBs com vários capítulos dentro de um único XHTML também são divididos. Sem estrutura clara, revise em Identificar capítulos; formate os títulos e tente novamente. A abertura do livro é preservada.
- Nome do arquivo EPUB é independente do título do livro. O nome escolhido é usado ao baixar o EPUB e o backup.
- Em Escolher capa, aproveite uma capa/imagem existente ou envie uma imagem PNG, JPEG ou WebP. A capa é gravada na abertura e nos metadados do EPUB; a apresentação da miniatura depende do processamento do Kindle.
- Em Gerenciar páginas, selecione um PDF de origem, exclua intervalos, reordene páginas ou insira texto e páginas de outros PDFs. Aplicar páginas reconstrói somente os PDFs alterados e substitui as edições dos capítulos associados a eles. Os outros PDFs e capítulos independentes são preservados. A última operação pode ser desfeita enquanto a página estiver aberta.
- As páginas são as páginas de origem dos PDFs; o EPUB usa texto adaptável, sem numeração ou tamanho de página fixos. Para ebooks, Adicionar seção independente insere uma nova divisão de conteúdo.
- PDFs importados antes desta atualização precisam ser reimportados para disponibilizar as páginas de origem. Os backups novos incluem as páginas extraídas, as fontes do projeto, a capa e o nome de saída.
- Recarregue o navegador para usar a atualização. Não é necessário instalar bibliotecas adicionais.



## Imagens, tabelas e leitura no Kindle

- Novas importações de PDF capturam imagens, gráficos vetoriais e tabelas detectadas. Tabelas de PDF ficam como imagens para preservar as células; tabelas estruturadas de EPUB/MOBI continuam editáveis, incluindo células mescladas. Figuras SVG de EPUB são rasterizadas quando suportadas.
- Os blocos visuais ficam centralizados, proporcionais e limitados à tela. No seletor Imagens no EPUB, use Equilibrado (até 1400 × 2400), Leve (até 1000 × 1600) ou Mais detalhes (até 1800 × 3000). As proporções originais são mantidas; imagens raster pequenas não são ampliadas.
- A exportação redimensiona imagens grandes, comprime JPEG e usa PNG para desenhos/tabelas quando vantajoso. Imagens idênticas do conteúdo compartilham um recurso. A mensagem final informa o tamanho do EPUB; a compressão usa metas por imagem, sem prometer um tamanho máximo para o livro inteiro.
- O texto exportado fica justificado com uma fonte serifada uniforme, mantendo negrito, itálico, títulos e versos. O Kindle pode substituir a fonte conforme a preferência do leitor. Textos dentro de figuras preservam a aparência da imagem.
- O sumário identificado perde pontilhados, traços de tabulação e páginas antigas; mantém os títulos e links disponíveis. O EPUB inclui também um sumário de navegação por capítulos. Confira sumários incomuns e títulos ambíguos.
- Reimporte os PDFs antigos para recuperar figuras que não foram extraídas nas versões anteriores. O backup antigo não contém essas imagens. Guarde um backup antes de substituir um projeto editado.
- Revise PDFs com múltiplas colunas, sobreposições, tabelas sem bordas ou gráficos complexos. A detecção visual é automática e pode precisar de revisão. Tabelas largas podem exigir zoom no aparelho; capturas não se tornam tabelas editáveis. PDFs escaneados podem permanecer como imagens; para editar o texto deles, use OCR antes.
