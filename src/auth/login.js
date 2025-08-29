/**
 * Realiza o processo de login no site.
 * @param {import('puppeteer').Page} page - A instância da página do Puppeteer.
 */
export async function login(page) {
  console.log('Navegando para a página de login...');
  await page.goto('https://app.assectra.com.br/v3/', {
    waitUntil: 'networkidle2',
  });

  console.log('Aguardando formulário de login...');
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
  await page.waitForSelector(loginButtonSelector, { visible: true });

  // --- Validação de Login Robusta ---
  // O login bem-sucedido causa uma navegação. A falha mostra um diálogo.
  // Usamos Promise.race para ver o que acontece primeiro.
  const failureSelector = 'md-dialog .md-dialog-content-body';

  console.log('Aguardando resultado do login...');
  try {
    await Promise.all([
      page.click(loginButtonSelector), // Clica no botão para iniciar a ação
      Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }),
        page.waitForSelector(failureSelector, { timeout: 20000 }),
      ]),
    ]);

    // Após a corrida, verificamos se o seletor de falha apareceu.
    // Se não, a navegação foi bem-sucedida.
    const loginFailedElement = await page.$(failureSelector);
    if (loginFailedElement) {
      const errorMessage = await page.evaluate((el) => el.textContent.trim(), loginFailedElement);
      throw new Error(`Falha no login: ${errorMessage}`);
    }
  } catch (e) {
    if (e.message.startsWith('Falha no login')) throw e;
    throw new Error(`Não foi possível determinar o resultado do login. Causa provável: ${e.message}`);
  }

  console.log('Login realizado com sucesso e página principal carregada.');
}
