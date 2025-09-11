import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { setupLogger, closeLogger } from '../../utils/logger.js';
import { baixarArquivo } from '../../utils/fileUtils.js';

/**
 * Navega para a página de acervo digital da empresa e baixa os documentos.
 * @param {object} browser - A instância do navegador Puppeteer.
 * @param {object} page - A instância da página do Puppeteer.
 * @param {object} config - Objeto de configuração.
 * @param {Array<string>} config.empresasParaExtrair - Lista com os nomes das empresas.
 * @param {Array<string>} config.obrasParaExtrair - Lista com os nomes das obras.
 * @param {object} options - Opções adicionais, como paginação.
 * @param {number} [options.startPage=1] - A página por onde começar.
 * @param {number} [options.endPage] - A página onde parar (inclusiva).
 */
export async function baixarDocumentosEmpresas(browser, page, config, options = {}) {
  const { empresasParaExtrair, obrasParaExtrair } = config;
  const { startPage = 1, endPage = Infinity } = options;

  const baseDownloadDir = path.resolve('output', 'company-documents');
  const logFilePath = path.join(baseDownloadDir, 'log.txt');
  setupLogger(logFilePath);

  try {
    const debugDir = path.join(baseDownloadDir, 'debug');
    console.log('Limpando diretório de debug de documentos de empresa...');
    fs.rmSync(debugDir, { recursive: true, force: true });
    fs.mkdirSync(debugDir, { recursive: true });

    console.log('Iniciando o processo de download de documentos de empresa...');

    // 1. Navegar para a página de acervo digital da empresa
    console.log('Navegando para a página de acervo digital de empresa...');
    await page.goto('https://app.assectra.com.br/v3/acervo-digital.php', {
      waitUntil: 'networkidle2',
    });

    for (const nomeEmpresa of empresasParaExtrair) {
      const empresaSanitizada = nomeEmpresa
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase();
      const empresaDownloadDir = path.join(baseDownloadDir, empresaSanitizada);

      for (const nomeObra of obrasParaExtrair) {
        const obraSanitizada = nomeObra
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/gi, '_')
          .toLowerCase();

        const obraDownloadDir = path.join(empresaDownloadDir, obraSanitizada);

        console.log(`\n--- Processando Empresa: ${nomeEmpresa} | Obra: ${nomeObra} ---`);

        try {
          // 2. Selecionar a empresa na página
          console.log(`Selecionando a empresa "${nomeEmpresa}"...`);
          const empresaSelector = '.panel.panel-default select[ng-model="Filtros.Empreiteiro_id"]';
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
          await valorEmpresaHandle.dispose();

          if (!valorEmpresa) {
            console.warn(`Empresa "${nomeEmpresa}" não encontrada no dropdown. Pulando combinação.`);
            continue;
          }
          await page.select(empresaSelector, valorEmpresa);
          console.log(`Empresa "${nomeEmpresa}" selecionada.`);

          // 3. Selecionar a planta/obra na página
          console.log(`Selecionando a obra "${nomeObra}"...`);
          const obraSelector = 'select[ng-model="Filtros.Obra_id"]';
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
          await valorObraHandle.dispose();

          if (!valorObra) {
            console.warn(`Obra "${nomeObra}" não encontrada no dropdown. Pulando combinação.`);
            continue;
          }
          await page.select(obraSelector, valorObra);
          console.log(`Obra "${nomeObra}" selecionada.`);

          // 4. Aplicar filtro de "Enviados" e pesquisar
          const enviadosCheckboxSelector = '.panel-body input[ng-model="FiltrosEnviado"]';
          await page.waitForSelector(enviadosCheckboxSelector, {
            visible: true,
          });
          const isChecked = await page.$eval(enviadosCheckboxSelector, (el) => el.checked);

          if (!isChecked) {
            console.log('Marcando a caixa "Enviados" para filtrar e iniciar a pesquisa...');
            await page.click(enviadosCheckboxSelector);
          } else {
            console.log(
              'A caixa "Enviados" já está marcada. Clicando em "Pesquisar" para aplicar os outros filtros...'
            );
            const pesquisarButtonSelector = '.panel-body button[ng-click="getDocumentos()"]';
            await page.waitForSelector(pesquisarButtonSelector);
            await page.click(pesquisarButtonSelector);
          }

          // 5. Aguardar os resultados da pesquisa
          console.log('Aguardando resultados da pesquisa...');
          await page.waitForNetworkIdle({ idleTime: 1000, timeout: 20000 }).catch(() => {
            console.log('A rede não ficou ociosa, mas o script continuará.');
          });

          const debugScreenshotPath = path.join(debugDir, `${empresaSanitizada}_${obraSanitizada}.png`);
          await page.screenshot({ path: debugScreenshotPath, fullPage: true });

          // 6. Iterar pelos resultados e baixar os documentos
          const panelBodySelector = 'div.panel-body';
          const tableSelector = `${panelBodySelector} table.table-hover`;
          const noResultsSelector = `${panelBodySelector} h3.text-center:not(.ng-hide)`;

          try {
            await page.waitForSelector(`${tableSelector}, ${noResultsSelector}`, {
              visible: true,
              timeout: 20000,
            });

            const noResultsHandle = await page.$(noResultsSelector);
            if (noResultsHandle) {
              const noResultsText = await noResultsHandle.evaluate((el) => el.innerText);
              if (noResultsText.includes('Nenhum registro encontrado')) {
                console.log(`Nenhum documento encontrado para ${nomeEmpresa} | ${nomeObra}. Pulando.`);
                continue;
              }
            }

            // Mapeia os cabeçalhos da tabela para encontrar os índices das colunas dinamicamente.
            // Isso torna o script robusto a mudanças na ordem das colunas.
            const tableHeaderSelector = `${tableSelector} thead tr`;
            await page.waitForSelector(tableHeaderSelector);
            const columnMap = await page.evaluate((headerSelector) => {
              const headers = document.querySelectorAll(`${headerSelector} th`);
              const map = {};
              headers.forEach((th, index) => {
                const headerText = th.innerText.trim().toUpperCase();
                if (headerText) {
                  map[headerText] = index + 1;
                }
              });
              return map;
            }, tableHeaderSelector);

            // A coluna 'ARQUIVOS' é a que contém o nome do documento e o ícone de download.
            // As colunas 'EMPREITEIROS' e 'PLANTAS' não precisam ser lidas da tabela, pois já as temos dos filtros.
            const docColumnName = 'ARQUIVOS';
            if (!columnMap[docColumnName]) {
              console.error(
                `ERRO CRÍTICO: Não foi possível mapear a coluna '${docColumnName}'. Colunas encontradas: ${Object.keys(
                  columnMap
                ).join(', ')}`
              );
              continue;
            }
            console.log('Mapeamento de colunas detectado:', columnMap);

            let currentPageNum = 1;
            let totalPages = 1;
            while (true) {
              const pageInfoSelector = 'ul.pagination a.rounded';
              const pageInfoText = await page
                .$eval(pageInfoSelector, (el) => el.innerText)
                .catch(() => '1 de 1');
              const match = pageInfoText.match(/(\d+)\s+de\s+(\d+)/);
              if (match) {
                currentPageNum = parseInt(match[1], 10);
                totalPages = parseInt(match[2], 10);
              }

              if (currentPageNum > endPage) {
                console.log(`Atingido o limite da página final (${endPage}). Encerrando paginação.`);
                break;
              }

              if (currentPageNum < startPage) {
                console.log(
                  `Página ${currentPageNum} está antes da página inicial (${startPage}). Pulando...`
                );
              } else {
                console.log(`\nProcessando ${pageInfoText}...`);
              }

              const rows = await page.$$(`${tableSelector} tbody tr[ng-repeat]`);
              console.log(
                `Encontradas ${rows.length} linhas de documentos para ${nomeEmpresa} | ${nomeObra} nesta página.`
              );

              if (currentPageNum >= startPage) {
                for (let i = 0; i < rows.length; i++) {
                  const success = await processRowWithRetries(i, rows.length);
                  if (!success) {
                    console.error(
                      `Falha ao processar a linha ${i + 1} após múltiplas tentativas. Pulando para a próxima.`
                    );
                  }
                }
              }

              async function processRowWithRetries(rowIndex, totalRows) {
                const MAX_RETRIES = 3;
                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                  try {
                    const currentRow = (await page.$$(`${tableSelector} tbody tr[ng-repeat]`))[rowIndex];
                    if (!currentRow) {
                      console.warn(`[Tentativa ${attempt}] Linha ${rowIndex + 1} não encontrada. Pulando.`);
                      return true;
                    }

                    const rowData = await currentRow.evaluate(
                      (el, map, docColName) => {
                        const cells = el.querySelectorAll('td');
                        const getCellText = (colName) => {
                          const index = map[colName] - 1;
                          return index >= 0 && cells.length > index ? cells[index].innerText.trim() : '';
                        };
                        return {
                          arquivoCellText: getCellText(docColName),
                        };
                      },
                      columnMap,
                      docColumnName
                    );

                    console.log(
                      `[Linha ${
                        rowIndex + 1
                      }/${totalRows}] Tentativa ${attempt}/${MAX_RETRIES} para Empresa: "${nomeEmpresa}" | Obra: "${nomeObra}" | p. ${currentPageNum} de ${totalPages} | Arquivo: "${
                        rowData.arquivoCellText
                      }"`
                    );

                    const clickResult = await currentRow.evaluate((row, arquivoColumnIndex) => {
                      const cell = row.querySelector(`td:nth-child(${arquivoColumnIndex})`);
                      if (!cell) return { clicked: false, error: 'Célula de Arquivos não encontrada.' };
                      const icon = cell.querySelector('i.fa-search[ng-click*="ProcessaArquivo"]');
                      if (icon) {
                        icon.click();
                        return { clicked: true, error: null };
                      }
                      return { clicked: false, error: 'Ícone de pesquisa não encontrado.' };
                    }, columnMap[docColumnName]);

                    if (!clickResult.clicked) {
                      throw new Error(`Falha ao clicar no ícone: ${clickResult.error}`);
                    }

                    const modalSelector = 'md-dialog';
                    await page.waitForSelector(modalSelector, { visible: true, timeout: 15000 });
                    console.log('   - Modal de visualização aberto.');

                    const fileElementSelector = 'md-dialog iframe[ng-src], md-dialog img[ng-src]';
                    await page.waitForSelector(fileElementSelector, { timeout: 10000 });

                    const relativeSrc = await page.$eval(fileElementSelector, (el) => el.getAttribute('src'));
                    const fileUrl = new URL(relativeSrc, page.url()).href;

                    const fileExtension = path.extname(new URL(fileUrl).pathname);
                    const sanitizedFilename = rowData.arquivoCellText.replace(/[\\/:*?"<>|]/g, '-');
                    const finalFilename = `${sanitizedFilename}${fileExtension}`;

                    await baixarArquivo(browser, page, obraDownloadDir, fileUrl, finalFilename);

                    return true;
                  } catch (error) {
                    console.warn(`   - ERRO (Tentativa ${attempt}): ${error.message}`);
                    if (attempt === MAX_RETRIES) {
                      console.error('   - Número máximo de tentativas atingido. Desistindo deste item.');
                      return false;
                    }
                    console.log('   - Aguardando 5 segundos antes de tentar novamente...');
                    await new Promise((r) => setTimeout(r, 5000));
                  } finally {
                    const isModalOpen = await page.$('md-dialog');
                    if (isModalOpen) {
                      try {
                        await page.click('md-dialog i.fa-times[ng-click="hide()"]', { timeout: 2000 });
                        await page.waitForSelector('md-dialog', { hidden: true, timeout: 5000 });
                        console.log('   - Modal fechado com sucesso.');
                      } catch (closeError) {
                        console.warn('   - Falha ao fechar modal com clique, tentando com "Escape".');
                        await page.keyboard.press('Escape').catch(() => {});
                        await new Promise((r) => setTimeout(r, 500));
                      }
                    }
                  }
                }
                return false;
              }

              const proximaPaginaSelector = 'span[ng-click="proximaPagina()"]';
              const proximaPaginaButton = await page.$(proximaPaginaSelector);

              if (!proximaPaginaButton) {
                console.log('Botão "Próxima" não encontrado. Fim da paginação.');
                break;
              }

              const isDisabled = await proximaPaginaButton.evaluate((el) => el.hasAttribute('disabled'));

              if (isDisabled) {
                console.log('Botão "Próxima" está desabilitado. Fim da paginação.');
                break;
              }

              console.log('Clicando em "Próxima" para ir para a próxima página...');
              await proximaPaginaButton.click();

              console.log('Aguardando a tabela carregar os dados da nova página...');
              await page.waitForNetworkIdle({ idleTime: 1000, timeout: 20000 }).catch(() => {
                console.log('A rede não ficou ociosa, mas o script continuará.');
              });
              await new Promise((r) => setTimeout(r, 500));
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
    console.log('\nProcesso de download de documentos de empresa concluído.');
  } finally {
    closeLogger(logFilePath);
  }
}
