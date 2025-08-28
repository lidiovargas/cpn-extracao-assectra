import { salvarDadosJSON, salvarComoExcel, baixarImagem } from '../utils/fileUtils.js';
import { toTitleCase } from '../utils/formatter.js';
import fs from 'fs';
import path from 'path';

/**
 * Extrai os dados dos colaboradores de uma lista de empresas.
 * @param {object} browser - A instância do navegador Puppeteer.
 * @param {object} page - A instância da página do Puppeteer.
 * @param {Array<string>} empresasParaExtrair - Lista com os nomes das empresas.
 */
export async function extrairDadosColaboradores(browser, page, empresasParaExtrair) {
  // Limpa e recria o diretório de debug no início da execução.
  const debugDir = path.join('output', 'debug');
  console.log('Limpando diretório de debug...');
  // Remove o diretório e todo o seu conteúdo. O 'force: true' evita erro se o diretório não existir.
  fs.rmSync(debugDir, { recursive: true, force: true });
  // Recria o diretório. O 'recursive: true' garante que a pasta 'output' seja criada se necessário.
  fs.mkdirSync(debugDir, { recursive: true });

  for (const nomeEmpresa of empresasParaExtrair) {
    console.log(`\n--- Iniciando extração para a empresa: ${nomeEmpresa} ---`);

    console.log('Navegando para a página de colaboradores...');
    await page.goto('https://app.assectra.com.br/v3/colaboradores.php', {
      waitUntil: 'networkidle2',
    });

    await page.waitForSelector('select[ng-model="FiltrosEmpreiteiro_id"]');
    let valorEmpresa;
    try {
      console.log('Aguardando a empresa aparecer no dropdown...');
      const valorEmpresaHandle = await page.waitForFunction(
        (nome) => {
          const el = document.querySelector('select[ng-model="FiltrosEmpreiteiro_id"]');
          if (!el) return false; // Garante que o select exista
          const optionEncontrada = Array.from(el.options).find(
            (opt) => opt.innerText.trim().toUpperCase() === nome.toUpperCase()
          );
          return optionEncontrada ? optionEncontrada.value : null;
        },
        { timeout: 30000 }, // Timeout de 30s. Aumente se necessário.
        nomeEmpresa
      );
      valorEmpresa = await valorEmpresaHandle.jsonValue();
    } catch (e) {
      valorEmpresa = null; // A empresa não foi encontrada antes do timeout
    }

    if (!valorEmpresa) {
      console.warn(`A empresa "${nomeEmpresa}" não foi encontrada no dropdown após aguardar. Pulando...`);
      continue;
    }

    console.log(`Selecionando a empresa "${nomeEmpresa}"...`);
    await page.select('select[ng-model="FiltrosEmpreiteiro_id"]', valorEmpresa);

    console.log('Clicando no botão "Pesquisar"...');
    await page.click('button[ng-click="Pesquisar()"]');
    await page.waitForResponse(
      (response) => response.url().includes('/api/v1/colaboradores') && response.status() === 200
    );

    const tableSelector = 'table.table-hover';
    await page.waitForSelector(tableSelector, { visible: true });

    // Pega a contagem total de colaboradores para o log de progresso.
    const totalCount = (await page.$$('a[ng-click^="EditarColaborador"]')).length;
    console.log(`Encontrados ${totalCount} colaboradores para a empresa ${nomeEmpresa}.`);

    const todosOsDados = [];

    // LÓGICA ROBUSTA: Busca a lista de links atualizada a cada iteração para evitar "Stale Elements".
    for (let i = 0; ; i++) {
      await page.waitForSelector(tableSelector, { visible: true });

      // Busca a lista de links "fresca" a cada iteração
      const links = await page.$$('a[ng-click^="EditarColaborador"]');

      // Se não houver um link no índice atual, significa que processamos todos.
      if (!links[i]) {
        console.log('Todos os colaboradores foram processados.');
        break;
      }

      const nomeColaborador = await links[i].evaluate((el) => el.innerText.trim());
      console.log(`Processando colaborador ${i + 1}/${totalCount}: ${nomeColaborador}`);

      // Clica diretamente no elemento do índice atual para evitar "stale elements".
      await links[i].click();

      try {
        const modalContentSelector = 'input[ng-model="Colaborador.Nome"]';
        await page.waitForSelector(modalContentSelector, {
          visible: true,
        });

        // Aguarda dinamicamente até que o campo 'Nome' no modal seja preenchido,
        // indicando que os dados do colaborador foram carregados.
        console.log('Aguardando dados do colaborador no modal...');
        await page.waitForFunction(
          () => {
            const nomeInput = document.querySelector('input[ng-model="Colaborador.Nome"]');
            // A função tentará novamente até que o valor do input não seja uma string vazia.
            return nomeInput && nomeInput.value.trim() !== '';
          },
          { timeout: 15000 } // Timeout de 15s para o carregamento dos dados.
        );

        const dadosBrutos = await page.evaluate(() => {
          const getSelectedText = (selector) => {
            const select = document.querySelector(selector);
            if (select && select.selectedIndex !== -1) {
              return select.options[select.selectedIndex].innerText;
            }
            return null;
          };

          const nome = document.querySelector('input[ng-model="Colaborador.Nome"]')?.value;
          const cpf = document.querySelector('input[ng-model="Colaborador.CPF"]')?.value;
          const empresa = getSelectedText('select[ng-model="Colaborador.Empreiteiro_id"]');
          const funcao = getSelectedText('select[ng-model="Colaborador.Funcao_id"]');
          const imageUrl = document.querySelector('img#FotoReconhecimento')?.src;

          return { Nome: nome, cpf, empresa, funcao, imageUrl };
        });

        const dadosFormatados = {
          Nome: toTitleCase(dadosBrutos.Nome),
          cpf: dadosBrutos.cpf,
          empresa: toTitleCase(dadosBrutos.empresa),
          funcao: toTitleCase(dadosBrutos.funcao),
          imageUrl: dadosBrutos.imageUrl,
        };

        todosOsDados.push(dadosFormatados);

        if (dadosFormatados.imageUrl) {
          await baixarImagem(browser, page, dadosFormatados.imageUrl, nomeEmpresa, dadosFormatados.Nome);
        }

        //DEBUG
        await page.screenshot({ path: `output/debug/passo_${i}_1_preescape.png`, fullPage: true });
        fs.writeFileSync(`output/debug/passo_${i}_1_preescape.html`, await page.content());

        await page.keyboard.press('Escape');
        await page.waitForSelector(modalContentSelector, { hidden: true });

        //DEBUG
        await page.screenshot({ path: `output/debug/passo_${i}_2_postescape.png`, fullPage: true });
        fs.writeFileSync(`output/debug/passo_${i}_2_postescape.html`, await page.content());

        // CORREÇÃO CRÍTICA: Espera o 'backdrop' do modal desaparecer completamente
        // para evitar que ele intercepte o próximo clique.
        await page.waitForSelector('md-backdrop', { hidden: true });

        // NOVA CORREÇÃO: Espera por um possível spinner de carregamento desaparecer.
        // A aplicação pode ficar ocupada por um instante após fechar o modal.
        await page.waitForSelector('md-progress-circular', { hidden: true, timeout: 5000 }).catch(() => {});

        // LÓGICA DE LIMPEZA: Garante que a página volte a um estado interativo.
        await page.evaluate(() => {
          const body = document.querySelector('body');
          body.classList.remove('md-dialog-is-showing');
          body.removeAttribute('style');
        });
      } catch (error) {
        console.warn(`Ocorreu um erro ao processar o colaborador "${nomeColaborador}". Pulando...`);
        console.error(error);
        // Se um modal falhar, tentamos recarregar a página para recuperar o estado
        await page.reload({ waitUntil: 'networkidle2' });
        continue;
      }
    }

    console.log(`\n--- Dados Finais para ${nomeEmpresa} ---`);
    console.log(JSON.stringify(todosOsDados, null, 2));
    salvarDadosJSON(nomeEmpresa, todosOsDados);
    salvarComoExcel(nomeEmpresa, todosOsDados);
  }
}
