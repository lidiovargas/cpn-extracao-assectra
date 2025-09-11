// Carrega as variáveis de ambiente do arquivo .env
import 'dotenv/config';
import path from 'path';
import puppeteer from 'puppeteer-core';
// --- Serviços do Assectra ---
import { extrairDadosColaboradores } from './services/assectra/employeeProfileService.js';
import { baixarDocumentosColaboradores } from './services/assectra/employeeDocumentService.js';
import { baixarDocumentosEmpresas } from './services/assectra/companyDocumentService.js';

// --- Serviços do InMeta (Exemplos) ---
// import { uploadDocumentosColaboradores } from './services/inmeta/employeeUploadService.js';
// import { uploadDocumentosEmpresas } from './services/inmeta/companyUploadService.js';

import { loadConfig } from './config/loader.js';
import { assectraLogin } from './auth/assectraLogin.js';
import { inmetaLogin } from './auth/inmetaLogin.js';

/**
 * Função principal que executa o processo de web scraping.
 */
async function main() {
  // --- ROTEAMENTO DE TAREFA ---
  // O mapa de tarefas agora é aninhado por sistema (assectra, inmeta), entidade e tarefa.
  const taskMap = {
    assectra: {
      employees: {
        profiles: extrairDadosColaboradores,
        documents: baixarDocumentosColaboradores,
      },
      companies: {
        profiles: async () =>
          console.log('(NÃO IMPLEMENTADO) Chamaria o serviço para "profiles" de "companies" aqui.'),
        documents: baixarDocumentosEmpresas,
      },
    },
    inmeta: {
      employees: {
        // Exemplo: a função viria de 'src/services/inmeta/documentUploadService.js'
        upload: async () =>
          console.log('Lógica de upload de documentos de colaboradores para o InMeta aqui.'),
      },
      companies: {
        upload: async () => console.log('Lógica de upload de documentos de empresas para o InMeta aqui.'),
      },
    },
  };

  const command = process.argv[2];
  if (!command || !command.includes(':')) {
    console.error('ERRO: Nenhuma tarefa especificada.');
    console.error('Uso: node src/index.js <sistema>:<entidade>:<tarefa>');
    console.error('  Exemplos: assectra:employees:profiles, inmeta:employees:upload');
    process.exit(1);
  }

  // --- PARÂMETROS ADICIONAIS ---
  const args = process.argv.slice(3); // Pega argumentos extras, como --start-page=1
  const options = {};
  args.forEach((arg) => {
    if (arg.startsWith('--start-page=')) {
      options.startPage = parseInt(arg.split('=')[1], 10);
    }
    if (arg.startsWith('--end-page=')) {
      options.endPage = parseInt(arg.split('=')[1], 10);
    }
    // Os argumentos de arquivo são lidos pelo loader, não precisam ser armazenados aqui.
  });

  // Carrega as configurações de empresas e obras de forma dinâmica
  const { empresas: empresasParaExtrair, obras: obrasParaExtrair } = loadConfig(process.argv);

  if (options.startPage) {
    console.log(`Iniciando a partir da página: ${options.startPage}`);
  }

  const [system, entity, task] = command.split(':');
  const taskFunction = taskMap[system]?.[entity]?.[task];

  if (!taskFunction) {
    console.error(`ERRO: Tarefa ou entidade inválida: "${command}".`);
    console.error('Uso: node src/index.js <sistema>:<entidade>:<tarefa>');
    console.error(
      '  Exemplos de comandos válidos: assectra:employees:documents, assectra:companies:documents, inmeta:employees:upload'
    );
    process.exit(1);
  }
  console.log(`Executando a tarefa: ${system}:${entity}:${task}`);

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
    // A lógica de login agora é selecionada com base no sistema alvo.
    if (system === 'assectra') {
      await assectraLogin(page);
    } else if (system === 'inmeta') {
      // A função de login do InMeta seria chamada aqui.
      await inmetaLogin(page);
    }

    // --- ETAPA DE EXTRAÇÃO DE DADOS ---
    // Executa a tarefa selecionada a partir do mapa, passando os argumentos necessários.
    await taskFunction(browser, page, { empresasParaExtrair, obrasParaExtrair }, options);
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
