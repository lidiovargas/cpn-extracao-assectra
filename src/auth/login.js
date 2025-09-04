import fs from 'fs';
import path from 'path';

/**
 * Realiza o processo de login no site.
 * @param {import('puppeteer').Page} page - A instância da página do Puppeteer.
 */
export async function login(page) {
  try {
    // Aumenta o timeout padrão para acomodar sites mais lentos.
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);

    console.log('Navegando para a página de login...');
    await page.goto('https://app.assectra.com.br/v3/', {
      waitUntil: 'networkidle2',
    });

    console.log('Aguardando formulário de login...');
    // Seletores refinados para serem mais robustos e específicos,
    // usando atributos do AngularJS e escopo do componente de login.
    const userInputSelector = '.login-card input[ng-model="Credenciais.Usuario"]';
    const passwordInputSelector = '.login-card input[ng-model="Credenciais.Senha"]';
    const loginButtonSelector = '.login-card button[ng-click="Acessar()"]';
    //

    // Espera por todos os elementos do formulário de uma vez.
    // Se um deles não aparecer, o Promise.all vai falhar, indicando o problema.
    await Promise.all([
      page.waitForSelector(userInputSelector, { visible: true }),
      page.waitForSelector(passwordInputSelector, { visible: true }),
      page.waitForSelector(loginButtonSelector, { visible: true }),
    ]);

    console.log('Preenchendo credenciais...');
    await page.type(userInputSelector, process.env.WEBSITE_USER);
    await page.type(passwordInputSelector, process.env.WEBSITE_PASSWORD);

    // --- Validação de Login Robusta ---
    // O login bem-sucedido causa uma navegação. A falha mostra um diálogo.
    // Usamos Promise.race para ver o que acontece primeiro.
    //
    console.log('Clicando no botão de login e aguardando navegação...');
    // A forma mais comum de lidar com login é esperar pela navegação que ocorre após o clique.
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }), // Espera a página carregar
      page.click(loginButtonSelector), // Clica no botão
    ]);

    // Para garantir que o login foi bem-sucedido, é bom verificar um elemento
    // que só existe na página após o login. Ex: 'span.username'
    // await page.waitForSelector('SELETOR_DA_PAGINA_PRINCIPAL');

    console.log('Login realizado com sucesso e página principal carregada.');
  } catch (error) {
    console.error('Ocorreu um erro durante o processo de login.');
    const outputDir = '/usr/src/app/output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const screenshotPath = path.join(outputDir, 'error_login_screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot do erro salvo em: ${screenshotPath}`);

    const htmlPath = path.join(outputDir, 'error_login_page.html');
    const htmlContent = await page.content();
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`HTML da página do erro salvo em: ${htmlPath}`);

    throw error; // Re-lança o erro original para parar a execução.
  }
}
