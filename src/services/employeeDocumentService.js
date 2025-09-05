import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { obrasParaExtrair } from '../config/plantas.js';
import { toTitleCase } from '../utils/formatter.js';
import { baixarArquivo } from '../utils/fileUtils.js';

/**
 * Navega para a página de acervo digital e baixa os documentos dos colaboradores.
 * @param {object} browser - A instância do navegador Puppeteer.
 * @param {object} page - A instância da página do Puppeteer.
 * @param {Array<string>} empresasParaExtrair - Lista com os nomes das empresas.
 */
export async function baixarDocumentosColaboradores(
  browser,
  page,
  empresasParaExtrair
) {
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
  await page.goto(
    'https://app.assectra.com.br/v3/acervo-digital-colaboradores.php',
    {
      waitUntil: 'networkidle2',
    }
  );

  for (const nomeEmpresa of empresasParaExtrair) {
    const empresaSanitizada = nomeEmpresa
      .normalize('NFD') // Decompõe caracteres acentuados (ex: 'Ç' -> 'C' + '¸')
      .replace(/[\u0300-\u036f]/g, '') // Remove os acentos (diacríticos)
      .replace(/[^a-z0-9]/gi, '_') // Substitui o que não for letra/número por _
      .toLowerCase();
    const empresaDownloadDir = path.join(baseDownloadDir, empresaSanitizada);

    for (const nomeObra of obrasParaExtrair) {
      const obraSanitizada = nomeObra
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase();

      console.log(
        `\n--- Processando Empresa: ${nomeEmpresa} | Obra: ${nomeObra} ---`
      );

      try {
        // 2. Selecionar a empresa na página
        console.log(`Selecionando a empresa "${nomeEmpresa}"...`);
        const empresaSelector =
          '.panel.panel-default select[ng-model="FiltrosEmpreiteiro_id"]';
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
          console.warn(
            `Empresa "${nomeEmpresa}" não encontrada no dropdown. Pulando combinação.`
          );
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
          console.warn(
            `Obra "${nomeObra}" não encontrada no dropdown. Pulando combinação.`
          );
          continue;
        }
        await page.select(obraSelector, valorObra);
        console.log(`Obra "${nomeObra}" selecionada.`);

        // 4. Aplicar filtro de "Enviados" e pesquisar
        const enviadosCheckboxSelector =
          '.panel-body input[ng-model="FiltrosEnviado"]';
        await page.waitForSelector(enviadosCheckboxSelector, { visible: true });
        const isChecked = await page.$eval(
          enviadosCheckboxSelector,
          (el) => el.checked
        );

        if (!isChecked) {
          console.log(
            'Marcando a caixa "Enviados" para filtrar e iniciar a pesquisa...'
          );
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
        await page
          .waitForNetworkIdle({ idleTime: 1000, timeout: 20000 })
          .catch(() => {
            console.log('A rede não ficou ociosa, mas o script continuará.');
          });

        // --- DEBUG ---
        // Salva um screenshot e o HTML da página para análise após a pesquisa.
        const debugScreenshotPath = path.join(
          debugDir,
          `${empresaSanitizada}_${obraSanitizada}.png`
        );
        const debugHtmlPath = path.join(
          debugDir,
          `${empresaSanitizada}_${obraSanitizada}.html`
        );
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
            const noResultsText = await noResultsHandle.evaluate(
              (el) => el.innerText
            );
            if (noResultsText.includes('Nenhum registro encontrado')) {
              console.log(
                `Nenhum documento encontrado para ${nomeEmpresa} | ${nomeObra}. Pulando.`
              );
              continue; // Pula para a próxima iteração do loop de obras
            }
          }

          // Mapeia os cabeçalhos da tabela para encontrar os índices das colunas dinamicamente.
          const tableHeaderSelector = `${tableSelector} thead tr`;
          await page.waitForSelector(tableHeaderSelector);
          const columnMap = await page.evaluate((headerSelector) => {
            const headers = document.querySelectorAll(`${headerSelector} th`);
            const map = {};
            headers.forEach((th, index) => {
              const headerText = th.innerText.trim().toUpperCase();
              if (headerText) {
                // Usa 1-based index para compatibilidade com :nth-child
                map[headerText] = index + 1;
              }
            });
            return map;
          }, tableHeaderSelector);

          if (!columnMap['COLABORADOR'] || !columnMap['ARQUIVOS']) {
            console.error(
              'ERRO CRÍTICO: Não foi possível mapear as colunas essenciais da tabela (Colaborador, Arquivos).'
            );
            continue; // Pula para a próxima combinação de empresa/obra
          }
          console.log('Mapeamento de colunas detectado:', columnMap);

          // --- INÍCIO DA LÓGICA DE PAGINAÇÃO ---
          while (true) {
            const pageInfoSelector = 'ul.pagination a.rounded';
            const pageInfoText = await page
              .$eval(pageInfoSelector, (el) => el.innerText)
              .catch(() => 'Página desconhecida');
            console.log(`\nProcessando ${pageInfoText}...`);

            const rows = await page.$$(`${tableSelector} tbody tr[ng-repeat]`);
            console.log(
              `Encontradas ${rows.length} linhas de documentos para ${nomeEmpresa} | ${nomeObra} nesta página.`
            );

            let nomeColaboradorAtual = '';

            for (let i = 0; i < rows.length; i++) {
              // Re-seleciona os elementos a cada iteração para evitar Stale Element Reference
              const currentRow = (
                await page.$$(`${tableSelector} tbody tr[ng-repeat]`)
              )[i];
              if (!currentRow) continue;

              const rowData = await currentRow.evaluate((el, map) => {
                const cells = el.querySelectorAll('td');
                const getCellText = (colName) => {
                  const index = map[colName] - 1; // Converte de 1-based para 0-based
                  if (index >= 0 && cells.length > index) {
                    return cells[index].innerText.trim();
                  }
                  return '';
                };

                const colaboradorCellText = getCellText('COLABORADOR');
                const arquivoCellText = getCellText('ARQUIVOS'); // Esta é a descrição do documento

                return {
                  colaboradorCellText,
                  arquivoCellText,
                };
              }, columnMap);

              // Atualiza o nome do colaborador se um novo for encontrado na linha
              if (rowData.colaboradorCellText) {
                nomeColaboradorAtual = rowData.colaboradorCellText;
              }

              // A abordagem de encontrar e clicar é movida para dentro de um único page.evaluate
              // para ser mais robusta contra problemas de timing em aplicações AngularJS.
              const clickResult = await currentRow.evaluate(
                (row, arquivoColumnIndex) => {
                  // Alvo corrigido: usa o índice da coluna "Arquivos" encontrado dinamicamente
                  const cell = row.querySelector(
                    `td:nth-child(${arquivoColumnIndex})`
                  );
                  if (!cell) {
                    return {
                      clicked: false,
                      error: `Célula de Arquivos (TD ${arquivoColumnIndex}) não encontrada.`,
                    };
                  }
                  const icon = cell.querySelector(
                    'i.fa-search[ng-click*="ProcessaArquivo"]'
                  );
                  if (icon) {
                    icon.click(); // Clica no ícone encontrado
                    return { clicked: true, error: null };
                  }
                  return {
                    clicked: false,
                    error: 'Ícone de pesquisa não encontrado na célula.',
                    cellHTML: cell.innerHTML,
                  };
                },
                columnMap['ARQUIVOS']
              ); // Passa o índice da coluna "Arquivos"

              // Log de depuração para cada linha, mostrando os dados extraídos.
              console.log(
                `[Linha ${i + 1}/${
                  rows.length
                }] Colab.: "${nomeColaboradorAtual}" | Arquivo: "${
                  rowData.arquivoCellText
                }" | Tentativa de Clique no Ícone: ${clickResult.clicked}`
              );

              if (!clickResult.clicked) {
                console.error(`   - Falha ao clicar: ${clickResult.error}`);
                console.log(
                  `   - Conteúdo da Célula 4 no momento da falha: ${clickResult.cellHTML}`
                );
              }

              // Prossegue apenas se o ícone foi encontrado e clicado com sucesso.
              if (clickResult.clicked) {
                const modalSelector = 'md-dialog';
                try {
                  console.log(
                    `   -> Tentando abrir modal para "${rowData.arquivoCellText}"...`
                  );
                  // O clique já foi feito, agora apenas esperamos o resultado (o modal aparecer).
                  await page.waitForSelector(modalSelector, {
                    visible: true,
                    timeout: 15000,
                  });
                  console.log('   - Modal de visualização aberto.');

                  const fileElementSelector =
                    'md-dialog iframe[ng-src], md-dialog img[ng-src]';
                  await page.waitForSelector(fileElementSelector, {
                    timeout: 10000,
                  });

                  const relativeSrc = await page.$eval(
                    fileElementSelector,
                    (el) => el.getAttribute('src')
                  );
                  const fileUrl = new URL(relativeSrc, page.url()).href;
                  console.log(`   - URL do arquivo encontrada: ${fileUrl}`);

                  const fileExtension = path.extname(new URL(fileUrl).pathname);
                  // Sanitiza a descrição do arquivo da tabela para usar como nome de arquivo.
                  // Removemos o path.basename, pois ele interpreta '/' como separador de diretório no Windows, causando nomes incorretos.
                  const sanitizedFilename = rowData.arquivoCellText.replace(
                    /[\\/:*?"<>|]/g,
                    '-'
                  );
                  const finalFilename = `${sanitizedFilename}${fileExtension}`;

                  // Cria o caminho de download final, incluindo o nome do colaborador.
                  const nomeColaboradorSanitizado = toTitleCase(
                    nomeColaboradorAtual
                  ).replace(/[\/\\?%*:|"<>]/g, '-');
                  const colaboradorDownloadDir = path.join(
                    empresaDownloadDir,
                    nomeColaboradorSanitizado
                  );

                  // Reutiliza a função de utilitário para baixar e salvar o arquivo
                  await baixarArquivo(
                    browser,
                    page,
                    colaboradorDownloadDir,
                    fileUrl,
                    finalFilename
                  );
                } catch (downloadError) {
                  console.error(
                    `   - ERRO no processo do documento "${rowData.arquivoCellText}": ${downloadError.message}`
                  );
                  console.log('   - Tentando recuperar e continuar...');
                } finally {
                  // Garante que o modal seja fechado, mesmo em caso de erro
                  try {
                    const closeButtonSelector =
                      'md-dialog i.fa-times[ng-click="hide()"]';
                    await page.waitForSelector(closeButtonSelector, {
                      timeout: 5000,
                    });
                    await page.click(closeButtonSelector);
                    await page.waitForSelector(modalSelector, {
                      hidden: true,
                      timeout: 10000,
                    });
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

            // --- LÓGICA PARA IR PARA A PRÓXIMA PÁGINA ---
            const proximaPaginaSelector = 'span[ng-click="proximaPagina()"]';
            const proximaPaginaButton = await page.$(proximaPaginaSelector);

            if (!proximaPaginaButton) {
              console.log('Botão "Próxima" não encontrado. Fim da paginação.');
              break;
            }

            const isDisabled = await proximaPaginaButton.evaluate((el) =>
              el.hasAttribute('disabled')
            );

            if (isDisabled) {
              console.log(
                'Botão "Próxima" está desabilitado. Fim da paginação.'
              );
              break;
            }

            console.log(
              'Clicando em "Próxima" para ir para a próxima página...'
            );
            await proximaPaginaButton.click();

            // Aguarda a atualização da tabela após o clique
            console.log(
              'Aguardando a tabela carregar os dados da nova página...'
            );
            await page
              .waitForNetworkIdle({ idleTime: 1000, timeout: 20000 })
              .catch(() => {
                console.log(
                  'A rede não ficou ociosa, mas o script continuará.'
                );
              });
            // Uma pequena pausa extra para garantir que o DOM foi atualizado pelo Angular
            await new Promise((r) => setTimeout(r, 500));
          }
          // --- FIM DA LÓGICA DE PAGINAÇÃO ---
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
        console.error(
          `Ocorreu um erro ao processar a combinação "${nomeEmpresa}" / "${nomeObra}":`,
          error
        );
        console.log('Continuando para a próxima combinação...');
      }
    }
  }
  console.log('\nProcesso de download de documentos concluído.');
}
