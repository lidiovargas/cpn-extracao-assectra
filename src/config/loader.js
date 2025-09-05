import fs from 'fs';
import path from 'path';

const DEFAULT_COMPANIES_PATH = path.resolve('config', 'companies.js');
const DEFAULT_OBRAS_PATH = path.resolve('config', 'plantas.js');

// Fallback caso nenhum arquivo de configuração seja encontrado.
const FALLBACK_COMPANIES = ['FJ CONSTRUÇÕES'];
const FALLBACK_OBRAS = ['BELFORT', 'CHAMONIX'];

/**
 * Lê um arquivo de configuração JS de forma segura usando require().
 * @param {string} filePath - O caminho para o arquivo.
 * @returns {Array|null} - O conteúdo do módulo ou null se houver erro.
 */
function readConfigFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      // Usa require() para carregar o módulo JS. É síncrono e compatível com CommonJS.
      const configModule = require(filePath);
      if (Array.isArray(configModule)) {
        return configModule;
      }
      console.error(`Erro: O arquivo de configuração "${filePath}" não exporta um array via module.exports.`);
    }
  } catch (error) {
    console.error(`Erro ao carregar o arquivo de configuração "${filePath}":`, error.message);
  }
  return null;
}

/**
 * Carrega a configuração de uma fonte (arquivo especificado, padrão ou fallback).
 * @param {string[]} args - Argumentos da linha de comando (process.argv).
 * @param {string} flagName - O nome da flag (ex: '--empresas-file').
 * @param {string} defaultPath - O caminho do arquivo padrão.
 * @param {Array} fallbackData - O array de dados de fallback.
 * @param {string} configName - O nome da configuração para logs (ex: 'Empresas').
 * @returns {Array} - A lista de configuração carregada.
 */
function loadConfigList(args, flagName, defaultPath, fallbackData, configName) {
  const fileArg = args.find((arg) => arg.startsWith(`${flagName}=`));
  let data = null;
  let source = '';

  if (fileArg) {
    const filePath = path.resolve(fileArg.split('=')[1]);
    data = readConfigFile(filePath);
    source = `arquivo especificado (${filePath})`;
  } else {
    data = readConfigFile(defaultPath);
    source = `arquivo padrão (${defaultPath})`;
  }

  if (data) {
    console.log(`- ${configName}: Configuração carregada do ${source}.`);
    return data;
  }

  console.warn(`- ${configName}: Não foi possível carregar do ${source}. Usando a lista de fallback.`);
  return fallbackData;
}

/**
 * Carrega as configurações de empresas e obras.
 * @param {string[]} cliArgs - Argumentos da linha de comando (process.argv).
 * @returns {{empresas: Array<string>, obras: Array<string>}}
 */
export function loadConfig(cliArgs) {
  console.log('Carregando configurações...');
  const empresas = loadConfigList(
    cliArgs,
    '--empresas-file',
    DEFAULT_COMPANIES_PATH,
    FALLBACK_COMPANIES,
    'Empresas'
  );
  const obras = loadConfigList(cliArgs, '--obras-file', DEFAULT_OBRAS_PATH, FALLBACK_OBRAS, 'Obras');
  return { empresas, obras };
}
