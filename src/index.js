// Carrega as variáveis de ambiente do arquivo .env
import 'dotenv/config';
import path from 'path';
import puppeteer from 'puppeteer-core';
import { extrairDadosColaboradores } from './services/employeeProfileService.js';
import { baixarDocumentosColaboradores } from './services/employeeDocumentService.js';
import { login } from './auth/login.js';
import { empresasParaExtrair } from './config/companies.js';

/**
 * Função principal que executa o processo de web scraping.
 */
async function main() {
  // --- ROTEAMENTO DE TAREFA ---
  // Mapeia os comandos para as funções de serviço correspondentes.
  // Esta estrutura (dispatch table) facilita a adição de novas tarefas sem aumentar a complexidade do código.
  const taskMap = {
    employees: {
      profiles: extrairDadosColaboradores,
      documents: baixarDocumentosColaboradores,
    },
    companies: {
      // Lógica futura para empresas
      profiles: async () =>
        console.log('(NÃO IMPLEMENTADO) Chamaria o serviço para "profiles" de "companies" aqui.'),
      documents: async () =>
        console.log('(NÃO IMPLEMENTADO) Chamaria o serviço para "documents" de "companies" aqui.'),
    },
  };

  const command = process.argv[2];
  if (!command || !command.includes(':')) {
    console.error('ERRO: Nenhuma tarefa especificada.');
    console.error('Uso: node src/index.js <entidade>:<tarefa>');
    const validCommands = Object.keys(taskMap)
      .flatMap((e) => Object.keys(taskMap[e]).map((t) => `${e}:${t}`))
      .join(', ');
    console.error(`  Exemplos: ${validCommands}`);
    process.exit(1);
  }

  // --- PARÂMETROS ADICIONAIS (PAGINAÇÃO) ---
  const args = process.argv.slice(3); // Pega argumentos extras, como --start-page=1
  const options = {};
  args.forEach((arg) => {
    if (arg.startsWith('--start-page=')) {
      options.startPage = parseInt(arg.split('=')[1], 10);
    }
    if (arg.startsWith('--end-page=')) {
      options.endPage = parseInt(arg.split('=')[1], 10);
    }
  });
  if (options.startPage) {
    console.log(`Iniciando a partir da página: ${options.startPage}`);
  }

  const [entity, task] = command.split(':');
  const taskFunction = taskMap[entity]?.[task];

  if (!taskFunction) {
    console.error(`ERRO: Tarefa ou entidade inválida: "${command}".`);
    const validCommands = Object.keys(taskMap)
      .flatMap((e) => Object.keys(taskMap[e]).map((t) => `${e}:${t}`))
      .join(', ');
    console.error(`  Comandos válidos: ${validCommands}`);
    process.exit(1);
  }
  console.log(`Executando a tarefa: ${entity}:${task}`);

  // --- VERIFICAÇÃO DE VARIÁVEIS DE AMBIENTE ---
  if (!process.env.WEBSITE_USER || !process.env.WEBSITE_PASSWORD) {
    console.error('ERRO: As variáveis de ambiente WEBSITE_USER e WEBSITE_PASSWORD não estão definidas.');
    console.error('Por favor, crie um arquivo .env na raiz do projeto e defina essas variáveis.');
    process.exit(1); // Encerra a aplicação com código de erro
  }

  console.log('Iniciando o navegador...');
  const browser = await puppeteer.launch({
    headless: 'new',
    // Aponta para o executável do Chromium instalado no Dockerfile
    executablePath: '/usr/bin/chromium',
    // Argumentos recomendados para rodar no Docker e evitar problemas de sandbox
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // Super importante em ambientes com memória limitada
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      // '--single-process', // REMOVIDO: Pode causar instabilidade.
      '--disable-gpu', // Desnecessário em modo headless
    ],
  });
  const page = await browser.newPage();

  // AUMENTADO: Aumenta o tempo limite padrão para todas as ações de navegação
  page.setDefaultNavigationTimeout(60000);

  try {
    // --- ETAPA DE LOGIN ---
    // A lógica de login foi abstraída para o módulo de autenticação
    await login(page);

    // --- ETAPA DE EXTRAÇÃO DE DADOS ---
    // Executa a tarefa selecionada a partir do mapa, passando os argumentos necessários.
    await taskFunction(browser, page, empresasParaExtrair, options);
  } catch (error) {
    console.error('Ocorreu um erro durante a execução:', error);
    const errorScreenshotPath = path.resolve('output', 'error_screenshot.png');
    if (page) {
      console.log(`Salvando screenshot do erro em: ${errorScreenshotPath}`);
      await page.screenshot({ path: errorScreenshotPath, fullPage: true });
    }
    // Em modo de produção, encerra com erro. Em desenvolvimento, permite que o nodemon continue.
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  } finally {
    console.log('\nProcesso finalizado. Fechando o navegador.');
    await browser.close();
  }
}

// Inicia a execução da função
main();
