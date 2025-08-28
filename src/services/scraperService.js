import {
  salvarDadosJSON,
  salvarComoExcel,
  baixarImagem,
} from '../utils/fileUtils.js';
import { toTitleCase } from '../utils/formatter.js';
import fs from 'fs';

/**
 * Extrai os dados dos colaboradores de uma lista de empresas.
 * @param {object} browser - A instância do navegador Puppeteer.
 * @param {object} page - A instância da página do Puppeteer.
 * @param {Array<string>} empresasParaExtrair - Lista com os nomes das empresas.
 */
export async function extrairDadosColaboradores(
  browser,
  page,
  empresasParaExtrair
) {
  for (const nomeEmpresa of empresasParaExtrair) {
    console.log(`\n--- Iniciando extração para a empresa: ${nomeEmpresa} ---`);

    console.log('Navegando para a página de colaboradores...');
    await page.goto('https://app.assectra.com.br/v3/colaboradores.php', {
      waitUntil: 'networkidle2',
    });

    await page.waitForSelector('select[ng-model="FiltrosEmpreiteiro_id"]');
    const valorEmpresa = await page.evaluate((nome) => {
      const options = Array.from(
        document.querySelectorAll(
          'select[ng-model="FiltrosEmpreiteiro_id"] option'
        )
      );
      const optionEncontrada = options.find(
        (opt) => opt.innerText.trim().toUpperCase() === nome.toUpperCase()
      );
      return optionEncontrada ? optionEncontrada.value : null;
    }, nomeEmpresa);

    if (!valorEmpresa) {
      console.warn(
        `A empresa "${nomeEmpresa}" não foi encontrada no dropdown. Pulando...`
      );
      continue;
    }

    console.log(`Selecionando a empresa "${nomeEmpresa}"...`);
    await page.select('select[ng-model="FiltrosEmpreiteiro_id"]', valorEmpresa);

    console.log('Clicando no botão "Pesquisar"...');
    await page.click('button[ng-click="Pesquisar()"]');
    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/colaboradores') &&
        response.status() === 200
    );

    const tableSelector = 'table.table-hover';
    await page.waitForSelector(tableSelector, { visible: true });

    const nomesDosColaboradores = await page.$$eval(
      'a[ng-click^="EditarColaborador"]',
      (links) => links.map((a) => a.innerText.trim())
    );
    console.log(
      `Encontrados ${nomesDosColaboradores.length} colaboradores para a empresa ${nomeEmpresa}.`
    );

    const todosOsDados = [];

    for (let i = 0; i < nomesDosColaboradores.length; i++) {
      // CORREÇÃO: Garante que a tabela está visível antes de cada iteração.
      await page.waitForSelector(tableSelector, { visible: true });

      // DEBUG
      await page.screenshot({
        path: `output/debug/passo_${i}_0.png`,
        fullPage: true,
      });
      fs.writeFileSync(`output/debug/passo_${i}_0.html`, await page.content());

      const nomeColaborador = nomesDosColaboradores[i];
      console.log(
        `Processando colaborador ${i + 1}/${
          nomesDosColaboradores.length
        }: ${nomeColaborador}`
      );

      const linkXPath = `//a[normalize-space()="${nomeColaborador}"]`;
      await page.waitForXPath(linkXPath, { visible: true });
      const links = await page.$x(linkXPath);

      if (links.length > 0) {
        await links[0].click();

        const modalContentSelector = 'input[ng-model="Colaborador.Nome"]';
        await page.waitForSelector(modalContentSelector, {
          visible: true,
        });
        await page.waitForTimeout(4000);

        const dadosBrutos = await page.evaluate(() => {
          const getSelectedText = (selector) => {
            const select = document.querySelector(selector);
            if (select && select.selectedIndex !== -1) {
              return select.options[select.selectedIndex].innerText;
            }
            return null;
          };

          const nome = document.querySelector(
            'input[ng-model="Colaborador.Nome"]'
          )?.value;
          const cpf = document.querySelector(
            'input[ng-model="Colaborador.CPF"]'
          )?.value;
          const empresa = getSelectedText(
            'select[ng-model="Colaborador.Empreiteiro_id"]'
          );
          const funcao = getSelectedText(
            'select[ng-model="Colaborador.Funcao_id"]'
          );
          const imageUrl = document.querySelector(
            'img#FotoReconhecimento'
          )?.src;

          return { nome, cpf, empresa, funcao, imageUrl };
        });

        const dadosFormatados = {
          nome: toTitleCase(dadosBrutos.nome),
          cpf: dadosBrutos.cpf,
          empresa: toTitleCase(dadosBrutos.empresa),
          funcao: toTitleCase(dadosBrutos.funcao),
          imageUrl: dadosBrutos.imageUrl,
        };

        todosOsDados.push(dadosFormatados);
        console.log('Dados extraídos:', dadosFormatados);

        if (dadosFormatados.imageUrl) {
          await baixarImagem(
            browser,
            page,
            dadosFormatados.imageUrl,
            nomeEmpresa,
            dadosFormatados.nome
          );
        }

        // DEBUG
        await page.screenshot({
          path: `output/debug/passo_${i}_1_pre_escape.png`,
          fullPage: true,
        });
        fs.writeFileSync(
          `output/debug/passo_${i}_1_pre_escape.html`,
          await page.content()
        );
        await page.keyboard.press('Escape');

        // DEBUG
        await page.screenshot({
          path: `output/debug/passo_${i}_2_pos_escape.png`,
          fullPage: true,
        });
        fs.writeFileSync(
          `output/debug/passo_${i}_2_pos_escape.html`,
          await page.content()
        );

        await page.waitForSelector(modalContentSelector, { hidden: true });

        await page.evaluate(() => {
          const body = document.querySelector('body');
          body.classList.remove('md-dialog-is-showing');
          body.style.position = '';
          body.style.width = '';
          body.style.top = '';
        });

        await page.waitForTimeout(500);
      } else {
        console.warn(
          `Não foi possível encontrar o link para: ${nomeColaborador}`
        );
      }
    }

    console.log(`\n--- Dados Finais para ${nomeEmpresa} ---`);
    console.log(JSON.stringify(todosOsDados, null, 2));
    salvarDadosJSON(nomeEmpresa, todosOsDados);
    salvarComoExcel(nomeEmpresa, todosOsDados);
  }
}
