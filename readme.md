# Extração Assectra

## Como Executar

O projeto utiliza Docker e espera um argumento para definir qual tarefa executar, no formato `<entidade>:<tarefa>`.

### Modo de Desenvolvimento (com Hot-Reload)

Para rodar um script em modo de desenvolvimento, use os comandos `dev:*`. O `nodemon` irá reiniciar o script automaticamente sempre que um arquivo na pasta `src` for alterado.

```bash
# CONDICIONAL:
# Se tiver mudado o package.json (ou qualquer pasta fora de src/...), refaça a build manualmente
docker compose build
# Exemplo para extrair perfis de colaboradores
docker compose run --rm scraper-dev npm run dev:employees:profiles
# Exemplo para extrair documentos de colaboradores
docker compose run --rm scraper-dev npm run dev:employees:documents
docker compose run --rm scraper-dev npm run dev:employees:documents -- --start-page=6
docker compose run --rm scraper-dev npm run dev:employees:documents -- --start-page=6 --end-page=10
# TODO: Exemplo para extrair documentos de empresas
docker compose run --rm scraper-dev npm run dev:companies:documents
```

### Modo de produção

```bash
docker compose build
# Exemplo para extrair perfis de colaboradores
docker compose run --rm scraper npm run employees:profiles
# Exemplo para extrair documentos de colaboradores
docker compose run --rm scraper npm run employees:documents
docker compose run --rm scraper npm run employees:documents -- --start-page=6
# TODO: Exemplo para extrair documentos de empresas
docker compose run --rm scraper npm run companies:documents
```

# Configuração de empresas e obras

Crie uma pasta `./config` no contexto do projeto:

```bash
mkdir config
```

Crie um arquivo para empresas, chamado `companies.js`:

```javascript
// Lista de empresas para extração.
// O nome deve ser EXATAMENTE como aparece no dropdown do site.
module.exports = [
  // ----- 100% exportados por employess:documents -----
  // 'FJ CONSTRUÇÕES',
  // 'ENGEMIX CONCRETO',
  // 'SONDOSOLO',
  // 'CONCRE - TEST',
  // ------ Exportação pendente ------
  // 'RILE CONSTRUÇÕES ELETRICAS EIRELI',
  'MULTIPAV TERRAPLENAGEM',
  // 'GUILHERME DA SILVA GONGRA DE OLIVEIRA',
  // 'CONCRELONGO',
  // 'BG TOPOGRAFIA',
  // 'BV SERRALHERIA',
  // 'TRANSPESSIN',
];
```

Crie um arquivo para obras, chamado `plantas.js`:

```javascript
module.exports = [
  // ---- exportados ---
  'BELFORT',
  'CHAMONIX',
  'JESUINO',
  'LAKE',
  'MULTIUSO CAMBUI PARTICIPAÇÕES',
  // --- pendentes ---
  // ...
];
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
