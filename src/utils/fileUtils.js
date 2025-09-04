import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { toTitleCase } from './formatter.js';

/**
 * Salva os dados extraídos em um arquivo JSON.
 * @param {string} nomeEmpresa - O nome da empresa para criar a pasta e o nome do arquivo.
 * @param {Array<object>} dados - O array de objetos com os dados dos colaboradores.
 */
export function salvarDadosJSON(outputSubfolder, nomeEmpresa, dados) {
  const outputDir = outputSubfolder;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const nomeArquivo = path.join(outputDir, `dados_${nomeEmpresa.replace(/ /g, '_')}.json`);
  fs.writeFileSync(nomeArquivo, JSON.stringify(dados, null, 2));
  console.log(`Dados JSON salvos em ${nomeArquivo}`);
}

/**
 * Salva os dados extraídos em um arquivo Excel (.xlsx).
 * @param {string} nomeEmpresa - O nome da empresa para o nome do arquivo.
 * @param {Array<object>} dados - O array de objetos com os dados dos colaboradores.
 */
export function salvarComoExcel(outputSubfolder, nomeEmpresa, dados) {
  const outputDir = outputSubfolder;
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  // Mapeia os dados para a estrutura desejada para o Excel,
  // definindo a ordem, os nomes das colunas e adicionando campos vazios.
  const dadosParaPlanilha = dados.map((colaborador) => ({
    Empreiteiro: nomeEmpresa,
    CNPJ: '', // Nova coluna vazia
    'Nome do Colaborador': colaborador.Nome,
    CPF: colaborador.cpf,
    Função: colaborador.funcao,
    Obra: 'Jesuíno #1', // Nova coluna vazia
  }));

  const worksheet = xlsx.utils.json_to_sheet(dadosParaPlanilha);

  // --- Lógica para auto-ajuste da largura das colunas ---
  if (dadosParaPlanilha.length > 0) {
    const headers = Object.keys(dadosParaPlanilha[0]);
    const colWidths = headers.map((header) => {
      // Calcula a largura máxima dos dados na coluna
      const maxDataWidth = dadosParaPlanilha.reduce((w, r) => {
        const cellValue = r[header];
        const cellWidth = cellValue ? String(cellValue).length : 0;
        return Math.max(w, cellWidth);
      }, 0);

      // A largura final é o maior valor entre a largura do cabeçalho e a dos dados
      const finalWidth = Math.max(maxDataWidth, header.length);
      return { wch: finalWidth + 2 }; // 'wch' é a largura em caracteres + um espaço extra
    });
    worksheet['!cols'] = colWidths;
  }

  // --- Lógica para deixar o cabeçalho em negrito ---
  if (worksheet['!ref']) {
    // Garante que a planilha não está vazia
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    const firstRowIndex = range.s.r; // O índice da primeira linha (geralmente 0)

    // Itera sobre todas as colunas da primeira linha
    for (let colIndex = range.s.c; colIndex <= range.e.c; ++colIndex) {
      const address = xlsx.utils.encode_cell({ r: firstRowIndex, c: colIndex });
      const cell = worksheet[address];

      // Aplica o estilo de forma segura, sem sobrescrever outros estilos existentes
      if (cell) {
        if (!cell.s) cell.s = {}; // Cria o objeto de estilo se não existir
        if (!cell.s.font) cell.s.font = {}; // Cria o objeto de fonte se não existir
        cell.s.font.bold = true;
      }
    }
  }

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Colaboradores');

  const nomeArquivo = path.join(outputDir, `dados_${nomeEmpresa.replace(/ /g, '_')}.xlsx`);
  xlsx.writeFile(workbook, nomeArquivo, { cellStyles: true });
  console.log(`Planilha Excel salva em ${nomeArquivo}`);
}

/**
 * Baixa a imagem de um colaborador.
 * @param {object} browser - A instância do navegador Puppeteer.
 * @param {object} page - A instância da página do Puppeteer.
 * @param {string} imageUrl - A URL da imagem a ser baixada.
 * @param {string} nomeEmpresa - O nome da empresa para criar a subpasta.
 * @param {string} nomeColaborador - O nome do colaborador para nomear o arquivo.
 */
export async function baixarImagem(browser, outputSubfolder, imageUrl, nomeEmpresa, nomeColaborador) {
  let imagePage = null;
  try {
    imagePage = await browser.newPage();
    const viewSource = await imagePage.goto(imageUrl);
    const buffer = await viewSource.buffer();

    const empresaDir = path.join(outputSubfolder, nomeEmpresa.replace(/[\/\\?%*:|"<>]/g, '-'));
    if (!fs.existsSync(empresaDir)) {
      fs.mkdirSync(empresaDir, { recursive: true });
    }

    const nomeFormatado = toTitleCase(nomeColaborador)
      .replace(/[\/\\?%*:|"<>]/g, '-')
      .replace(/ /g, '_');
    const caminhoArquivo = path.join(empresaDir, `${nomeFormatado}.jpeg`);

    fs.writeFileSync(caminhoArquivo, buffer);
    console.log(`Imagem salva em: ${caminhoArquivo}`);
  } catch (error) {
    console.error(`Falha ao baixar imagem para ${nomeColaborador}: ${error.message}`);
  } finally {
    if (imagePage) {
      await imagePage.close();
    }
  }
}

/**
 * Baixa um arquivo de uma URL e o salva em um caminho específico.
 * Abre uma nova página para isolar o download e aumentar a robustez.
 * @param {import('puppeteer-core').Browser} browser - A instância do navegador Puppeteer.
 * @param {import('puppeteer-core').Page} page - A página principal que detém a sessão (cookies).
 * @param {string} downloadDir - O diretório onde o arquivo será salvo.
 * @param {string} fileUrl - A URL completa do arquivo a ser baixado.
 * @param {string} finalFilename - O nome final do arquivo (com extensão).
 * @returns {Promise<boolean>} - Retorna true em caso de sucesso, false em caso de falha.
 */
export async function baixarArquivo(browser, page, downloadDir, fileUrl, finalFilename) {
  let downloadPage = null;
  try {
    // 1. Pega os cookies da página principal, que contém a sessão de login.
    const cookies = await page.cookies();

    downloadPage = await browser.newPage();

    // 2. Define os cookies na nova página. Isso é crucial para autenticação.
    await downloadPage.setCookie(...cookies);

    // Herda o User-Agent da sessão principal para consistência e para evitar bloqueios.
    await downloadPage.setUserAgent(await browser.userAgent());

    const response = await downloadPage.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });

    if (!response.ok()) {
      throw new Error(`Falha ao buscar o arquivo: ${response.status()} ${response.statusText()}`);
    }

    const buffer = await response.buffer();

    // Garante que o diretório de destino exista
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    const filePath = path.join(downloadDir, finalFilename);
    fs.writeFileSync(filePath, buffer);

    console.log(`   - SUCESSO: Arquivo salvo como "${finalFilename}"`);
    return true;
  } catch (error) {
    console.error(`   - ERRO ao baixar o arquivo "${finalFilename}": ${error.message}`);
    return false;
  } finally {
    if (downloadPage) {
      await downloadPage.close();
    }
  }
}
