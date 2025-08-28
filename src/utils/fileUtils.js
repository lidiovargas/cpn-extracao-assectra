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

  const nomeArquivo = path.join(
    outputDir,
    `dados_${nomeEmpresa.replace(/ /g, '_')}.json`
  );
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

  // Remove a URL da imagem para a exportação do Excel
  const dadosParaPlanilha = dados.map(({ imageUrl, ...resto }) => resto);

  const worksheet = xlsx.utils.json_to_sheet(dadosParaPlanilha);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Colaboradores');

  const nomeArquivo = path.join(
    outputDir,
    `dados_${nomeEmpresa.replace(/ /g, '_')}.xlsx`
  );
  xlsx.writeFile(workbook, nomeArquivo);
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
export async function baixarImagem(
  browser,
  page,
  imageUrl,
  nomeEmpresa,
  nomeColaborador
) {
  let imagePage = null;
  try {
    imagePage = await browser.newPage();
    const viewSource = await imagePage.goto(imageUrl);
    const buffer = await viewSource.buffer();

    const empresaDir = path.join(
      'output',
      nomeEmpresa.replace(/[\/\\?%*:|"<>]/g, '-')
    );
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
    console.error(
      `Falha ao baixar imagem para ${nomeColaborador}: ${error.message}`
    );
  } finally {
    if (imagePage) {
      await imagePage.close();
    }
  }
}
