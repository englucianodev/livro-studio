# Bibliotecas Word

O módulo `word-codecs.mjs` é distribuído pronto e carregado sob demanda, sem CDN.

- Mammoth 1.13.0: https://github.com/mwilliamson/mammoth.js — BSD-2-Clause, `mammoth-LICENSE`.
- docx 9.15.1: https://github.com/dolanmiu/docx — MIT, `docx-LICENSE`.
- JSDoc: https://github.com/Alpaq92/JSDoc — 0BSD, `JSDoc-LICENSE`.
  Revisão fixada: `821695a884e0c0bb8592a635d9524bb3e116cd67`.
  `docToText.cjs` e `textToDoc.cjs` são cópias sem alterações dos respectivos
  arquivos `.js` em `src/`, com extensão CommonJS para o empacotador.

Para gerar novamente: `npm ci` e `npm run build:word` na raiz.
As dependências npm estão fixadas em `package-lock.json`; o ponto de entrada
é `scripts/word-codecs-entry.mjs`. Os comentários legais das dependências
também são preservados no módulo gerado.
