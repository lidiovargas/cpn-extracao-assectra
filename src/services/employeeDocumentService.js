import fs from 'fs';
import path from 'path';

/**
 * Configura o comportamento de download do Puppeteer para salvar arquivos em um diretório específico.
 * @param {object} page - A instância da página do Puppeteer.
 * @param {string} downloadPath - O caminho para a pasta de download.
 */
async function setupDownloadBehavior(page, downloadPath) {
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }
  console.log(`Arquivos serão baixados em: ${downloadPath}`);

  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadPath,
  });
}

/**
 * Navega para a página de acervo digital e baixa os documentos dos colaboradores.
 * @param {object} browser - A instância do navegador Puppeteer.
 * @param {object} page - A instância da página do Puppeteer.
 * @param {Array<string>} empresasParaExtrair - Lista com os nomes das empresas.
 */
export async function baixarDocumentosColaboradores(browser, page, empresasParaExtrair) {
  const downloadDir = path.resolve('output', 'documentos');
  await setupDownloadBehavior(page, downloadDir);

  console.log('Iniciando o processo de download de documentos...');

  for (const nomeEmpresa of empresasParaExtrair) {
    console.log(`\n--- Iniciando busca de documentos para a empresa: ${nomeEmpresa} ---`);

    // 1. Navegar para a página de acervo digital
    console.log('Navegando para a página de acervo digital...');
    await page.goto('https://app.assectra.com.br/v3/acervo-digital-colaboradores.php', {
      waitUntil: 'networkidle2',
    });

    // 2. A lógica para selecionar a empresa e cada colaborador será necessária aqui.
    //    Provavelmente será semelhante à do employeeProfileService.
    //    Você precisará de uma lista de colaboradores (talvez pelo CPF) para iterar.

    // 3. Para cada colaborador, encontrar e clicar nos botões/links de download.
    //    O 'setupDownloadBehavior' garantirá que os arquivos sejam salvos automaticamente.

    console.log(`(LÓGICA PENDENTE) Lógica de download para ${nomeEmpresa} deve ser implementada aqui.`);
  }
}
