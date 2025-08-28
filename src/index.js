// Carrega as variáveis de ambiente do arquivo .env
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { extrairDadosColaboradores } from './services/scraperService.js';

// Array com os nomes das empresas que você deseja extrair os dados
// O nome deve ser EXATAMENTE como aparece no dropdown do site
const empresasParaExtrair = [
  'SONDOSOLO',
  // 'ENGEMIX CONCRETO'
];

/**
 * Função principal que executa o processo de web scraping.
 */
async function main() {
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
    console.log('Navegando para a página de login...');
    await page.goto('https://app.assectra.com.br/v3/', {
      waitUntil: 'networkidle2',
    });

    await page.waitForSelector('md-dialog input[name="Usuario"]', {
      visible: true,
    });
    await page.waitForSelector('md-dialog input[name="Senha"]', {
      visible: true,
    });

    console.log('Preenchendo credenciais...');
    await page.type('input[name="Usuario"]', process.env.WEBSITE_USER);
    await page.type('input[name="Senha"]', process.env.WEBSITE_PASSWORD);

    const loginButtonSelector = 'button[ng-click="Acessar()"]';
    await page.waitForSelector(loginButtonSelector);
    await page.click(loginButtonSelector);

    console.log('Login realizado. Aguardando redirecionamento...');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('Redirecionamento concluído.');

    // --- ETAPA DE EXTRAÇÃO DE DADOS ---
    await extrairDadosColaboradores(browser, page, empresasParaExtrair);
  } catch (error) {
    console.error('Ocorreu um erro durante a extração:', error);
  } finally {
    console.log('\nProcesso finalizado. Fechando o navegador.');
    await browser.close();
  }
}

// Inicia a execução da função
main();
