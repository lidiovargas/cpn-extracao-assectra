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
  const command = process.argv[2]; // Pega o argumento completo, ex: "employees:profiles"
  if (!command || !command.includes(':')) {
    console.error('ERRO: Nenhuma tarefa especificada.');
    console.error('Uso: node src/index.js <entidade>:<tarefa>');
    console.error('Exemplos: employees:profiles, employees:documents');
    process.exit(1);
  }
  const [entity, task] = command.split(':');
  const validEntities = ['employees', 'companies'];
  const validTasks = ['profiles', 'documents'];

  if (!validEntities.includes(entity) || !validTasks.includes(task)) {
    console.error(`ERRO: Tarefa ou entidade inválida: "${command}".`);
    console.error(`  Entidades válidas: ${validEntities.join(', ')}`);
    console.error(`  Tarefas válidas: ${validTasks.join(', ')}`);
    process.exit(1);
  }
  console.log(`Executando a tarefa: ${task}`);

  // --- VERIFICAÇÃO DE VARIÁVEIS DE AMBIENTE ---
  if (!process.env.WEBSITE_USER || !process.env.WEBSITE_PASSWORD) {
    console.error('ERRO: As variáveis de ambiente WEBSITE_USER e WEBSITE_PASSWORD não estão definidas.');
    console.error('Por favor, crie um arquivo .env na raiz do projeto e defina essas variáveis.');
    process.exit(1); // Encerra a aplicação com código de erro
  }

  console.log('Iniciando o navegador...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      // '--single-process', // REMOVIDO: Pode causar instabilidade.
      '--disable-gpu',
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
    // Executa a tarefa selecionada
    if (entity === 'employees') {
      if (task === 'profiles') {
        await extrairDadosColaboradores(browser, page, empresasParaExtrair);
      } else if (task === 'documents') {
        await baixarDocumentosColaboradores(browser, page, empresasParaExtrair);
      }
    } else if (entity === 'companies') {
      // Lógica futura para empresas
      console.log(`(NÃO IMPLEMENTADO) Chamaria o serviço para '${task}' de '${entity}' aqui.`);
      // if (task === 'profiles') {
      //   await extrairDadosEmpresas(browser, page, empresasParaExtrair);
      // } else if (task === 'documents') {
      //   await baixarDocumentosEmpresas(browser, page, empresasParaExtrair);
      // }
    } else {
      throw new Error('Lógica de roteamento para entidade não implementada.');
    }
  } catch (error) {
    console.error('Ocorreu um erro durante a execução:', error);
    const errorScreenshotPath = path.resolve('output', 'error_screenshot.png');
    if (page) {
      console.log(`Salvando screenshot do erro em: ${errorScreenshotPath}`);
      await page.screenshot({ path: errorScreenshotPath, fullPage: true });
    }
    process.exit(1);
  } finally {
    console.log('\nProcesso finalizado. Fechando o navegador.');
    await browser.close();
  }
}

// Inicia a execução da função
main();
