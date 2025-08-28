import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { toTitleCase } from './formatter.js';

/**
 * Salva os dados extraídos em um arquivo JSON.
 * @param {string} nomeEmpresa - O nome da empresa para criar a pasta e o nome do arquivo.
 * @param {Array<object>} dados - O array de objetos com os dados dos colaboradores.
 */
export function salvarDadosJSON(nomeEmpresa, dados) {
  const outputDir = 'output';
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
export function salvarComoExcel(nomeEmpresa, dados) {
  const outputDir = 'output';
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
  // Pega o intervalo de células da planilha (ex: A1:F10)
  const range = xlsx.utils.decode_range(worksheet['!ref']);
  // Itera sobre a primeira linha (cabeçalho)
  for (let colNum = range.s.c; colNum <= range.e.c; colNum++) {
    // Constrói o endereço da célula (A1, B1, C1...)
    const address = xlsx.utils.encode_cell({ r: range.s.r, c: colNum });
    const cell = worksheet[address];
    // Adiciona o estilo de negrito à célula do cabeçalho
    if (cell) {
      cell.s = { font: { bold: true } };
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
export async function baixarImagem(browser, page, imageUrl, nomeEmpresa, nomeColaborador) {
  let imagePage = null;
  try {
    imagePage = await browser.newPage();
    const viewSource = await imagePage.goto(imageUrl);
    const buffer = await viewSource.buffer();

    const empresaDir = path.join('output', nomeEmpresa.replace(/[\/\\?%*:|"<>]/g, '-'));
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
