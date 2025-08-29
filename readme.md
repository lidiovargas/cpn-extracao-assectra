# Extração Assectra

## Como Executar

O projeto utiliza Docker e espera um argumento para definir qual tarefa executar, no formato `<entidade>:<tarefa>`.

**Lembre-se:** Sempre reconstrua a imagem após alterar o código-fonte ou o `package.json`.

### Extrair Perfis de Colaboradores

```bash
docker compose build && \
docker compose run --rm scraper npm run employees:profiles
```

### Baixar Documentos de Colaboradores

```bash
docker compose build && \
docker compose run --rm scraper npm run employees:documents
```

# Como Depurar Scripts do Puppeteer (Headless)

1. Tirar "Fotos" da Tela (Screenshots): Esta é a técnica mais poderosa. Em qualquer ponto do seu script, você pode adicionar a linha `await page.screenshot({ path: 'output/debug_passo_X.png', fullPage: true });` para salvar uma imagem do que o navegador headless está "vendo". Como já mapeamos a pasta output, a imagem aparecerá instantaneamente no seu computador.

2. Salvar o HTML da Página: Para analisar a estrutura, você pode salvar o HTML completo em um arquivo: `fs.writeFileSync('output/pagina_estado_X.html', await page.content());`. Isso é exatamente o que você fez manualmente e que nos ajudou a encontrar o problema!

3. Pausar o Script: Para ter tempo de analisar os logs, você pode adicionar uma pausa longa em qualquer ponto com `await new Promise(r => setTimeout(r, 10000));` (pausa de 10 segundos).

4. Executar Localmente (Temporariamente): A forma mais fácil de depurar visualmente é rodar o script fora do Docker por um momento.

- No seu terminal local (não no Docker), rode `npm install`.
- Mude a linha `headless: "new"` para `headless: false` no `src/index.js`.
- Rode `npm run dev`.
- Isso abrirá um navegador Chrome real na sua tela, e você poderá ver exatamente o que o script está fazendo, passo a passo.
