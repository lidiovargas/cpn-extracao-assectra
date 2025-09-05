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

  const nomeArquivo = path.join(
    outputDir,
    `dados_${nomeEmpresa.replace(/ /g, '_')}.xlsx`
  );
  xlsx.writeFile(workbook, nomeArquivo, { cellStyles: true });
  console.log(`Planilha Excel salva em ${nomeArquivo}`);
}

/**
 * Baixa a imagem de um colaborador.
 * @param {object} browser - A instância do navegador Puppeteer.
 * @param {object} page - A instância da página principal para herdar a sessão (cookies, referer).
 * @param {string} imageUrl - A URL da imagem a ser baixada.
 * @param {string} nomeEmpresa - O nome da empresa para criar a subpasta.
 * @param {string} nomeColaborador - O nome do colaborador para nomear o arquivo.
 */
export async function baixarImagem(
  browser,
  page,
  outputSubfolder,
  imageUrl,
  nomeEmpresa,
  nomeColaborador
) {
  let imagePage = null;
  try {
    const cookies = await page.cookies();
    imagePage = await browser.newPage();
    await imagePage.setCookie(...cookies);
    await imagePage.setExtraHTTPHeaders({ Referer: page.url() });
    await imagePage.setUserAgent(await browser.userAgent());

    const response = await imagePage.goto(imageUrl, {
      // 'load' é mais adequado para downloads de arquivos do que 'networkidle0'.
      waitUntil: 'load',
      timeout: 120000, // Aumentado para 2 minutos para imagens grandes/lentas.
    });

    if (!response.ok()) {
      throw new Error(
        `Falha ao buscar a imagem: ${response.status()} ${response.statusText()}`
      );
    }

    const contentType = response.headers()['content-type'];
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error(
        `Conteúdo inesperado (${
          contentType || 'unknown'
        }) em vez de uma imagem.`
      );
    }

    const buffer = await response.buffer();

    const empresaDir = path.join(
      outputSubfolder,
      nomeEmpresa.replace(/[\/\\?%*:|"<>]/g, '-')
    );
    fs.mkdirSync(empresaDir, { recursive: true });

    const nomeFormatado = toTitleCase(nomeColaborador)
      .replace(/[\/\\?%*:|"<>]/g, '-')
      .replace(/ /g, '_');
    const extension = (contentType.split('/')[1] || 'jpg').split('+')[0]; // Pega 'jpeg' de 'image/jpeg' ou 'svg' de 'image/svg+xml'
    const caminhoArquivo = path.join(
      empresaDir,
      `${nomeFormatado}.${extension}`
    );

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
export async function baixarArquivo(
  browser,
  page,
  downloadDir,
  fileUrl,
  finalFilename
) {
  try {
    // Estratégia: Usa page.evaluate para rodar `fetch` no contexto do navegador.
    // Isso herda a sessão de login (cookies) e evita problemas de navegação e timeouts.
    // A função é reescrita sem 'async/await' para evitar problemas de transpilação
    // que podem causar o erro 'ReferenceError: _ref is not defined'.
    const base64Data = await page.evaluate((url) => {
      return fetch(url)
        .then((response) => {
          if (!response.ok) {
            // Lança um erro que será capturado pelo .catch() do evaluate
            throw new Error(
              `Falha na requisição de rede: ${response.status} ${response.statusText}`
            );
          }
          return response.blob();
        })
        .then((blob) => {
          // Converte o blob para base64
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              // reader.result é uma string 'data:<mime>;base64,<data>'
              // Pegamos apenas a parte dos dados.
              const data = reader.result.split(',')[1];
              resolve(data);
            };
            reader.onerror = () => {
              reject(new Error('Erro do FileReader ao ler o arquivo.'));
            };
            reader.readAsDataURL(blob);
          });
        });
    }, fileUrl);

    if (!base64Data) {
      throw new Error(
        'Não foi possível obter os dados do arquivo (base64 vazio).'
      );
    }

    const buffer = Buffer.from(base64Data, 'base64');

    // Validação do "Magic Number" para PDFs.
    if (finalFilename.toLowerCase().endsWith('.pdf')) {
      if (
        !buffer ||
        buffer.length < 8 ||
        !buffer.toString('utf8', 0, 5).startsWith('%PDF-')
      ) {
        const preview = buffer.toString('utf8', 0, 200);
        throw new Error(
          `O conteúdo baixado não é um PDF válido. Início do conteúdo: "${preview}..."`
        );
      }
    }

    // Garante que o diretório de destino exista
    fs.mkdirSync(downloadDir, { recursive: true });

    const filePath = path.join(downloadDir, finalFilename);
    fs.writeFileSync(filePath, buffer);

    console.log(`   - SUCESSO: Arquivo salvo como "${finalFilename}"`);
    return true;
  } catch (error) {
    // O erro de `evaluate` pode ser um objeto serializado ou uma string, não uma instância de Error.
    const errorMessage = error.message || String(error);
    console.error(
      `   - ERRO ao baixar o arquivo "${finalFilename}": ${errorMessage}`
    );
    return false;
  }
}
