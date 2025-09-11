import fs from 'fs';
import path from 'path';

/**
 * Realiza o processo de login no site Assectra.
 * @param {import('puppeteer').Page} page - A instância da página do Puppeteer.
 */
export async function assectraLogin(page) {
  // Valida se as credenciais necessárias para o Assectra estão presentes.
  if (!process.env.ASSECTRA_USER || !process.env.ASSECTRA_PASSWORD) {
    throw new Error(
      'ERRO: As variáveis de ambiente ASSECTRA_USER e ASSECTRA_PASSWORD não estão definidas no arquivo .env.'
    );
  }

  try {
    // Aumenta o timeout padrão para acomodar sites mais lentos.
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);

    console.log('Navegando para a página de login do Assectra...');
    await page.goto('https://app.assectra.com.br/v3/', {
      waitUntil: 'networkidle2',
    });

    console.log('Aguardando formulário de login...');
    const userInputSelector = '.login-card input[ng-model="Credenciais.Usuario"]';
    const passwordInputSelector = '.login-card input[ng-model="Credenciais.Senha"]';
    const loginButtonSelector = '.login-card button[ng-click="Acessar()"]';

    await Promise.all([
      page.waitForSelector(userInputSelector, { visible: true }),
      page.waitForSelector(passwordInputSelector, { visible: true }),
      page.waitForSelector(loginButtonSelector, { visible: true }),
    ]);

    console.log('Preenchendo credenciais do Assectra...');
    await page.type(userInputSelector, process.env.ASSECTRA_USER);
    await page.type(passwordInputSelector, process.env.ASSECTRA_PASSWORD);

    console.log('Clicando no botão de login e aguardando navegação...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click(loginButtonSelector),
    ]);

    console.log('Login no Assectra realizado com sucesso e página principal carregada.');
  } catch (error) {
    console.error('Ocorreu um erro durante o processo de login no Assectra.');
    const outputDir = path.resolve('output/assectra/login');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const screenshotPath = path.join(outputDir, 'error_login_assectra_screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot do erro salvo em: ${screenshotPath}`);

    const htmlPath = path.join(outputDir, 'error_login_assectra_page.html');
    const htmlContent = await page.content();
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`HTML da página do erro salvo em: ${htmlPath}`);

    throw error;
  }
}
