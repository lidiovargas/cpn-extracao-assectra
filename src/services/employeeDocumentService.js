import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { obrasParaExtrair } from '../config/plantas.js';
import { toTitleCase } from '../utils/formatter.js';
import { baixarArquivo } from '../utils/fileUtils.js';

/**
 * Configura o comportamento de download do Puppeteer.
 * Esta função será chamada para cada empresa para garantir que os arquivos sejam salvos na pasta correta.
 * @param {object} page - A instância da página do Puppeteer.
 * @param {string} downloadPath - O caminho para a pasta de download.
 */
async function setupDownloadBehavior(page, downloadPath) {
  if (!fs.existsSync(downloadPath)) {
    // Cria o diretório da empresa se ele não existir
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
  const baseDownloadDir = path.resolve('output', 'employee-documents');
  // Cria e limpa o diretório de debug no início da execução.
  const debugDir = path.join(baseDownloadDir, 'debug');
  console.log('Limpando diretório de debug de documentos...');
  // Remove o diretório e todo o seu conteúdo. O 'force: true' evita erro se o diretório não existir.
  fs.rmSync(debugDir, { recursive: true, force: true });
  fs.mkdirSync(debugDir, { recursive: true });

  console.log('Iniciando o processo de download de documentos...');

  // 1. Navegar para a página de acervo digital UMA VEZ
  console.log('Navegando para a página de acervo digital...');
  await page.goto('https://app.assectra.com.br/v3/acervo-digital-colaboradores.php', {
    waitUntil: 'networkidle2',
  });

  for (const nomeEmpresa of empresasParaExtrair) {
    for (const nomeObra of obrasParaExtrair) {
      // Cria um caminho de download específico para a empresa e obra, com nomes sanitizados
      const empresaSanitizada = nomeEmpresa.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const obraSanitizada = nomeObra.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const downloadDir = path.join(baseDownloadDir, empresaSanitizada, obraSanitizada);

      // Configura o download para o diretório da combinação atual
      await setupDownloadBehavior(page, downloadDir);

      console.log(`\n--- Processando Empresa: ${nomeEmpresa} | Obra: ${nomeObra} ---`);

      try {
        // 2. Selecionar a empresa na página
        console.log(`Selecionando a empresa "${nomeEmpresa}"...`);
        const empresaSelector = '.panel.panel-default select[ng-model="FiltrosEmpreiteiro_id"]';
        await page.waitForSelector(empresaSelector, { timeout: 10000 });

        const valorEmpresaHandle = await page.evaluateHandle(
          (nome, sel) => {
            const select = document.querySelector(sel);
            if (!select) return null;
            const option = Array.from(select.options).find(
              (opt) => opt.innerText.trim().toUpperCase() === nome.toUpperCase()
            );
            return option ? option.value : null;
          },
          nomeEmpresa,
          empresaSelector
        );

        const valorEmpresa = await valorEmpresaHandle.jsonValue();
        await valorEmpresaHandle.dispose(); // Libera o handle

        if (!valorEmpresa) {
          console.warn(`Empresa "${nomeEmpresa}" não encontrada no dropdown. Pulando combinação.`);
          continue;
        }
        await page.select(empresaSelector, valorEmpresa);
        console.log(`Empresa "${nomeEmpresa}" selecionada.`);

        // 3. Selecionar a planta/obra na página
        console.log(`Selecionando a obra "${nomeObra}"...`);
        const obraSelector = 'select[ng-model="ObraSelecionada"]';
        await page.waitForSelector(obraSelector, { timeout: 10000 });

        const valorObraHandle = await page.evaluateHandle(
          (nome, sel) => {
            const select = document.querySelector(sel);
            if (!select) return null;
            const option = Array.from(select.options).find(
              (opt) => opt.innerText.trim().toUpperCase() === nome.toUpperCase()
            );
            return option ? option.value : null;
          },
          nomeObra,
          obraSelector
        );

        const valorObra = await valorObraHandle.jsonValue();
        await valorObraHandle.dispose(); // Libera o handle

        if (!valorObra) {
          console.warn(`Obra "${nomeObra}" não encontrada no dropdown. Pulando combinação.`);
          continue;
        }
        await page.select(obraSelector, valorObra);
        console.log(`Obra "${nomeObra}" selecionada.`);

        // 4. Aplicar filtro de "Enviados" e pesquisar
        const enviadosCheckboxSelector = '.panel-body input[ng-model="FiltrosEnviado"]';
        await page.waitForSelector(enviadosCheckboxSelector, { visible: true });
        const isChecked = await page.$eval(enviadosCheckboxSelector, (el) => el.checked);

        if (!isChecked) {
          console.log('Marcando a caixa "Enviados" para filtrar e iniciar a pesquisa...');
          // Clicar na caixa de seleção aciona a função getDocumentos() e já inicia a pesquisa
          await page.click(enviadosCheckboxSelector);
        } else {
          console.log(
            'A caixa "Enviados" já está marcada. Clicando em "Pesquisar" para aplicar os outros filtros...'
          );
          // Se a caixa já estiver marcada, precisamos clicar no botão principal para
          // garantir que a pesquisa seja executada com os filtros de empresa/obra selecionados.
          const pesquisarButtonSelector = 'button[ng-click="getDocumentos()"]';
          await page.waitForSelector(pesquisarButtonSelector);
          await page.click(pesquisarButtonSelector);
        }

        // 5. Aguardar os resultados da pesquisa
        console.log('Aguardando resultados da pesquisa...');
        await page.waitForNetworkIdle({ idleTime: 1000, timeout: 20000 }).catch(() => {
          console.log('A rede não ficou ociosa, mas o script continuará.');
        });

        // --- DEBUG ---
        // Salva um screenshot e o HTML da página para análise após a pesquisa.
        const debugScreenshotPath = path.join(debugDir, `${empresaSanitizada}_${obraSanitizada}.png`);
        const debugHtmlPath = path.join(debugDir, `${empresaSanitizada}_${obraSanitizada}.html`);
        console.log(`Salvando screenshot de debug em: ${debugScreenshotPath}`);
        await page.screenshot({ path: debugScreenshotPath, fullPage: true });
        fs.writeFileSync(debugHtmlPath, await page.content());

        // 6. Iterar pelos resultados e baixar os documentos
        const panelBodySelector = 'div.panel-body';
        const tableSelector = `${panelBodySelector} table.table-hover`;
        const noResultsSelector = `${panelBodySelector} h3.text-center:not(.ng-hide)`;

        try {
          // Espera pela tabela ou pela mensagem de "nenhum registro"
          await page.waitForSelector(`${tableSelector}, ${noResultsSelector}`, {
            visible: true,
            timeout: 20000,
          });

          // Verifica se a mensagem "Nenhum registro encontrado" está presente
          const noResultsHandle = await page.$(noResultsSelector);
          if (noResultsHandle) {
            const noResultsText = await noResultsHandle.evaluate((el) => el.innerText);
            if (noResultsText.includes('Nenhum registro encontrado')) {
              console.log(`Nenhum documento encontrado para ${nomeEmpresa} | ${nomeObra}. Pulando.`);
              continue; // Pula para a próxima iteração do loop de obras
            }
          }

          const rows = await page.$$(`${tableSelector} tbody tr[ng-repeat]`);
          console.log(`Encontradas ${rows.length} linhas de documentos para ${nomeEmpresa} | ${nomeObra}.`);

          let nomeColaboradorAtual = '';

          for (let i = 0; i < rows.length; i++) {
            // Re-seleciona os elementos a cada iteração para evitar Stale Element Reference
            const currentRow = (await page.$$(`${tableSelector} tbody tr[ng-repeat]`))[i];
            if (!currentRow) continue;

            const rowData = await currentRow.evaluate((el) => {
              const cells = el.querySelectorAll('td');
              // Colaborador (célula 3, index 2). O nome só aparece se for diferente do anterior.
              const colaboradorCellText = cells.length > 2 ? cells[2].innerText.trim() : '';
              // Arquivo (célula 5, index 4)
              const arquivoCellText = cells.length > 4 ? cells[4].innerText.trim() : '';

              // Descrição do Documento (célula 4, index 3)
              let documentoDescricao = '';
              if (cells.length > 3) {
                // Clona o nó para não alterar o DOM original
                const cellClone = cells[3].cloneNode(true);
                // Remove todos os elementos filhos (spans, icons) para sobrar apenas o texto principal
                cellClone.querySelectorAll('span, i').forEach((child) => child.remove());
                documentoDescricao = cellClone.innerText.trim();
              }

              // Verifica se o ícone de download (lupa) está visível
              const hasDownloadIcon = !!(
                cells.length > 3 && cells[3].querySelector('i.fa-search:not(.ng-hide)')
              );

              return {
                colaboradorCellText,
                arquivoCellText,
                documentoDescricao,
                hasDownloadIcon,
              };
            });

            // Atualiza o nome do colaborador se um novo for encontrado na linha
            if (rowData.colaboradorCellText) {
              nomeColaboradorAtual = rowData.colaboradorCellText;
            }

            if (!rowData.hasDownloadIcon) continue;

            console.log(
              ` -> [${i + 1}/${rows.length}] Processando "${
                rowData.documentoDescricao
              }" para "${nomeColaboradorAtual}"...`
            );

            const searchIcon = await currentRow.$('td:nth-child(4) i.fa-search');
            if (searchIcon) {
              const modalSelector = 'md-dialog';
              try {
                await searchIcon.click();
                await page.waitForSelector(modalSelector, { visible: true, timeout: 15000 });
                console.log('   - Modal de visualização aberto.');

                const fileElementSelector = 'md-dialog iframe[ng-src], md-dialog img[ng-src]';
                await page.waitForSelector(fileElementSelector, { timeout: 10000 });

                const relativeSrc = await page.$eval(fileElementSelector, (el) => el.getAttribute('src'));
                const fileUrl = new URL(relativeSrc, page.url()).href;
                console.log(`   - URL do arquivo encontrada: ${fileUrl}`);

                const fileExtension = path.extname(new URL(fileUrl).pathname);
                const sanitizedDescription = toTitleCase(rowData.documentoDescricao).replace(
                  /[\\/:*?"<>|]/g,
                  '-'
                );
                const finalFilename = `${sanitizedDescription}${fileExtension}`;

                // Reutiliza a função de utilitário para baixar e salvar o arquivo
                await baixarArquivo(page, downloadDir, fileUrl, finalFilename);
              } catch (downloadError) {
                console.error(
                  `   - ERRO no processo do documento "${rowData.documentoDescricao}": ${downloadError.message}`
                );
                console.log('   - Tentando recuperar e continuar...');
              } finally {
                // Garante que o modal seja fechado, mesmo em caso de erro
                try {
                  const closeButtonSelector = 'md-dialog i.fa-times[ng-click="hide()"]';
                  await page.waitForSelector(closeButtonSelector, { timeout: 5000 });
                  await page.click(closeButtonSelector);
                  await page.waitForSelector(modalSelector, { hidden: true, timeout: 10000 });
                  console.log('   - Modal fechado.');
                } catch (closeError) {
                  console.warn(
                    '   - Não foi possível fechar o modal clicando no "X". Tentando com a tecla "Escape".'
                  );
                  await page.keyboard.press('Escape').catch(() => {});
                }
              }
            }
          }
        } catch (error) {
          if (error.name === 'TimeoutError') {
            console.log(
              `A tabela de resultados não carregou a tempo para ${nomeEmpresa} | ${nomeObra}. Pulando.`
            );
          } else {
            throw error;
          }
        }
      } catch (error) {
        console.error(`Ocorreu um erro ao processar a combinação "${nomeEmpresa}" / "${nomeObra}":`, error);
        console.log('Continuando para a próxima combinação...');
      }
    }
  }
  console.log('\nProcesso de download de documentos concluído.');
}
