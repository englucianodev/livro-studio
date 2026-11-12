# Módulos DRM (fora da versão publicada)

Estes arquivos ficavam em `dist/` e permitiam importar livros Kindle protegidos por DRM.
Foram retirados da pasta publicada na Vercel porque contornar DRM é proibido em vários países
(no Brasil, Lei 9.610/98, art. 107; nos EUA, DMCA §1201) e viola os termos da Amazon, da Vercel e do GitHub,
o que pode levar à remoção do site ou do repositório.

O app continua importando EPUB, MOBI, AZW3 e KFX **sem DRM**. Arquivos protegidos mostram uma mensagem de erro.

Estes módulos declaram licença GPL-3.0-or-later e citam `vendor/DRM-SOURCES.md`, que não existe no projeto.
