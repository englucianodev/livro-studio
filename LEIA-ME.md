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

Importação de ebooks sem DRM e PDFs com texto selecionável; organização com comparação antes/depois; reconstrução opcional de parágrafos; preservação de versos; leitor com páginas simuladas e zoom; exportação EPUB com sumário e imagens rasterizadas quando disponíveis. A saída é EPUB, inclusive para livros originalmente em MOBI ou AZW.

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
- O texto exportado fica justificado por padrão, com uma fonte serifada uniforme, mantendo negrito, itálico, títulos e versos. O Kindle pode substituir a fonte conforme a preferência do leitor. Textos dentro de figuras preservam a aparência da imagem.
- O sumário identificado perde pontilhados, traços de tabulação e páginas antigas; mantém os títulos e links disponíveis. O EPUB inclui também um sumário de navegação por capítulos. Confira sumários incomuns e títulos ambíguos.
- Reimporte os PDFs antigos para recuperar figuras que não foram extraídas nas versões anteriores. O backup antigo não contém essas imagens. Guarde um backup antes de substituir um projeto editado.
- Revise PDFs com múltiplas colunas, sobreposições, tabelas sem bordas ou gráficos complexos. A detecção visual é automática e pode precisar de revisão. Tabelas largas podem exigir zoom no aparelho; capturas não se tornam tabelas editáveis. PDFs escaneados podem permanecer como imagens; para editar o texto deles, use OCR antes.


## Leitor de páginas e edição avançada

A interface removeu a opção de idioma e os blocos de dicas e envio ao Kindle. O idioma dos metadados existentes é mantido internamente.

- Abra Leitor de páginas para visualizar o livro em uma página, uma coluna contínua ou duas colunas lado a lado com rolagem contínua. Há zoom de 25% a 300%, ajuste à largura/à página, anterior/próxima, campo de página com botão Ir (ou Enter), busca no livro e miniaturas das páginas próximas na parte inferior.
- Quando o leitor estiver focado, use Page Up/Page Down, setas esquerda/direita, Home e End. O texto da prévia pode ser selecionado e copiado. Use Editar este capítulo para alterar o capítulo correspondente à página atual.
- As páginas do leitor são simuladas a partir do conteúdo editado; não correspondem necessariamente às páginas do PDF de origem nem à paginação final do Kindle. O EPUB continua adaptável. Tabelas altas são divididas por linhas na prévia, com repetição do cabeçalho; elementos muito grandes ou com células mescladas podem ter rolagem interna para manter o conteúdo visível. A divisão visual não modifica a estrutura exportada.
- A edição oferece negrito, itálico, sublinhado, tachado, sobrescrito/subscrito, listas numeradas, recuos, alinhamentos, tamanho, cor e realce. A fonte continua uniforme. As escolhas explícitas de tamanho/cor/alinhamento são mantidas no EPUB; estilos fixos dos arquivos de origem continuam normalizados.
- Em Figura, envie PNG/JPEG/WebP e escolha descrição, legenda e largura relativa. A imagem é otimizada. Clique em uma figura e use Editar / substituir figura para trocar o arquivo ou suas propriedades; Excluir seleção também remove a figura e sua legenda.
- Insira tabelas com até 30 linhas por inserção e 12 colunas, título e cabeçalho opcional. Edite as células no documento. Clique em uma célula para adicionar/excluir linhas ou colunas e excluir a tabela. Algumas operações são limitadas em tabelas com células mescladas para evitar danificá-las.
- Quadro cria um bloco com título e texto editável dentro de uma tabela de uma célula.
- Selecione texto para excluir ou substituir apenas o trecho escolhido. Localizar / substituir atua no capítulo aberto e permite trocar uma ocorrência ou todas, preservando as imagens e os parágrafos. Os botões de desfazer/refazer e Ctrl+Z/Ctrl+Shift+Z (ou Ctrl+Y) incluem alterações de texto, figuras e tabelas no capítulo atual. O histórico é limitado e reinicia ao trocar de capítulo; use backups para guardar estados anteriores.


## Edição por páginas e painéis ajustáveis

- A edição abre em páginas editáveis. Escolha Uma página, Rolagem contínua ou Lado a lado. Use Anterior/Próxima, o número da página e Ir/Enter, zoom, miniaturas e os controles de seleção.
- O texto, figuras e tabelas podem ser alterados diretamente na página. As ferramentas de formatação atuam na página que está em edição. Para editar o capítulo inteiro em uma área contínua, escolha Texto corrido; Editar por páginas retorna à visualização paginada. Localizar/substituir atua na área em edição (página atual ou texto corrido).
- Reorganizar páginas redistribui o conteúdo depois de alterações extensas. Durante a digitação, os limites ficam estáveis para não deslocar o cursor; conteúdo maior pode ter rolagem interna até a reorganização. A paginação da edição é simulada e difere da paginação original do PDF e da adotada pelo Kindle.
- Excluir página atual remove o conteúdo daquela página. Para excluir várias, marque as caixas de seleção ou informe intervalos como 1-3, 5, clique Selecionar e Excluir selecionadas. Capítulos que ficarem sem páginas são removidos; se todo o conteúdo for excluído, permanece um documento vazio válido.
- Desfazer exclusão restaura a última exclusão enquanto não houver novas alterações de conteúdo, reorganização ou troca do documento. O recurso evita reverter silenciosamente edições posteriores. Faça backups antes de alterações extensas. Os PDFs originais armazenados como fontes não são alterados; reconstruir suas páginas pode recuperar conteúdo do original.
- Arraste a divisória vertical entre o menu e o documento para mudar a largura lateral. Arraste as divisórias horizontais para ajustar dados do livro, capítulos, importação, ferramentas e miniaturas. As áreas menores têm rolagem para manter seus controles acessíveis. As janelas de ferramentas também aceitam redimensionamento pelo canto quando o navegador permite.
- Os tamanhos ficam salvos neste navegador. Dois cliques em uma divisória restauram aquele painel. Restaurar tamanho dos painéis, ao final do menu lateral, retorna todo o layout ao padrão. As divisórias também respondem às setas do teclado quando estão focadas. No celular o menu se adapta à largura disponível.
