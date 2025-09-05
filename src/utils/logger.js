import fs from 'fs';
import path from 'path';

// Guarda as funções originais do console para poder restaurá-las.
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

let logStream = null;

/**
 * Cria uma função de log que escreve tanto no console original quanto em um arquivo.
 * @param {string} level - O nível do log (e.g., 'INFO', 'WARN').
 * @param {Function} originalFunc - A função original do console a ser chamada.
 * @returns {Function} A nova função de log.
 */
const createLogOverride = (level, originalFunc) => {
  return (...args) => {
    // 1. Imprime no console original para manter o comportamento padrão.
    originalFunc.apply(console, args);

    // 2. Formata e escreve no arquivo de log, se o stream estiver ativo.
    if (logStream) {
      const message = args
        .map((arg) =>
          // Converte objetos para JSON para melhor visualização no log
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        )
        .join(' ');
      const timestamp = new Date().toISOString();
      logStream.write(`[${timestamp}] [${level.toUpperCase()}] ${message}\n`);
    }
  };
};

/**
 * Configura o logger para uma execução.
 * Sobrescreve os métodos do console global e prepara o arquivo de log.
 * @param {string} logFilePath - O caminho completo para o arquivo de log.
 */
export function setupLogger(logFilePath) {
  fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
  // Em vez de sobrescrever o arquivo com writeFileSync, usamos appendFileSync.
  // Isso irá criar o arquivo se ele não existir, ou adicionar ao final se já existir.
  // Adicionamos uma linha separadora para distinguir as execuções no mesmo arquivo.
  fs.appendFileSync(logFilePath, `\n--- Nova execução em ${new Date().toISOString()} ---\n\n`);
  logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

  console.log = createLogOverride('info', originalConsole.log);
  console.warn = createLogOverride('warn', originalConsole.warn);
  console.error = createLogOverride('error', originalConsole.error);

  originalConsole.log(`Logger configurado. Logs serão salvos em: ${logFilePath}`);
}

/**
 * Restaura as funções originais do console e fecha o stream do arquivo de log.
 */
export function closeLogger(logFilePath) {
  if (logStream) logStream.end();
  logStream = null;

  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;

  originalConsole.log(`\nLogger finalizado. Logs da execução salvos em: ${logFilePath}`);
}
