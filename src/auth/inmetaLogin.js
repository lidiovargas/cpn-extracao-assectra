import fs from 'fs';
import path from 'path';

/**
 * Realiza o processo de login no site InMeta.
 * @param {import('puppeteer').Page} page - A instância da página do Puppeteer.
 */
export async function inmetaLogin(page) {
  // Valida se as credenciais necessárias para o InMeta estão presentes.
  if (!process.env.INMETA_USER || !process.env.INMETA_PASSWORD) {
    throw new Error(
      'ERRO: As variáveis de ambiente INMETA_USER e INMETA_PASSWORD não estão definidas no arquivo .env.'
    );
  }

  try {
    // Aumenta o timeout padrão para acomodar sites mais lentos.
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);

    console.log('Navegando para a página de login do InMeta...');
    await page.goto('https://app.inmeta.com.br/login', {
      waitUntil: 'networkidle2',
    });

    console.log('Aguardando formulário de login...');
    // Seletores aprimorados para maior robustez, escopando a busca para dentro do formulário
    // e usando atributos mais específicos para evitar ambiguidades.
    const userInputSelector = 'form.q-form input[placeholder="E-mail"]';
    // O tipo 'password' é um identificador único e semântico para o campo de senha.
    const passwordInputSelector = 'form.q-form input[type="password"]';
    // O botão de login é o único com type="submit" e a classe de cor primária.
    const loginButtonSelector = 'button[type="submit"].bg-primary';

    await Promise.all([
      page.waitForSelector(userInputSelector, { visible: true }),
      page.waitForSelector(passwordInputSelector, { visible: true }),
      page.waitForSelector(loginButtonSelector, { visible: true }),
    ]);

    console.log('Preenchendo credenciais do InMeta...');
    await page.type(userInputSelector, process.env.INMETA_USER);
    await page.type(passwordInputSelector, process.env.INMETA_PASSWORD);

    // Aguarda o botão de login ficar habilitado (o atributo 'disabled' ser removido)
    await page.waitForFunction(
      (selector) => !document.querySelector(selector)?.disabled,
      {},
      loginButtonSelector
    );

    console.log('Clicando no botão de login e aguardando navegação...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click(loginButtonSelector),
    ]);

    console.log('Aguardando o carregamento da página principal após o login...');
    // Espera o spinner de carregamento (comum em apps SPA como o InMeta) desaparecer.
    // O seletor '.q-loading' é uma suposição baseada no framework Quasar (q-...).
    // Se o spinner for outro, este seletor precisará ser ajustado.
    await page.waitForSelector('.q-loading', { hidden: true, timeout: 60000 });

    // Verificação final: Aguarda por um elemento estável do dashboard para confirmar
    // que o login foi bem-sucedido e a página está pronta.
    // O seletor anterior ('button[aria-label="Menu Principal"]') não foi encontrado, causando o timeout.
    // Trocamos por um seletor que busca pelo card do módulo "Projetos e Arquivos",
    // que é um forte indicador de que o dashboard carregou corretamente.
    const dashboardElementSelector = 'div[style*="grid-area: DOCUMENTOS;"]';
    await page.waitForSelector(dashboardElementSelector, { visible: true });

    // Captura a tela após o login bem-sucedido para verificação.
    const successOutputDir = path.resolve('output/inmeta/login');
    if (!fs.existsSync(successOutputDir)) {
      fs.mkdirSync(successOutputDir, { recursive: true });
    }
    const successScreenshotPath = path.join(successOutputDir, 'success_login_inmeta_screenshot.png');
    await page.screenshot({ path: successScreenshotPath, fullPage: true });
    console.log(`Screenshot de login bem-sucedido salvo em: ${successScreenshotPath}`);

    console.log('Login no InMeta realizado com sucesso e página principal carregada.');
  } catch (error) {
    console.error('Ocorreu um erro durante o processo de login no InMeta.');
    const outputDir = path.resolve('output/inmeta/login');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const screenshotPath = path.join(outputDir, 'error_login_inmeta_screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot do erro salvo em: ${screenshotPath}`);

    const htmlPath = path.join(outputDir, 'error_login_inmeta_page.html');
    const htmlContent = await page.content();
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`HTML da página do erro salvo em: ${htmlPath}`);

    throw error;
  }
}
