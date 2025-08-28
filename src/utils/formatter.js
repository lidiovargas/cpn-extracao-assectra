/**
 * Converte uma string para o formato Title Case (Primeira Letra de Cada Palavra Maiúscula).
 * @param {string} str A string a ser formatada.
 * @returns {string} A string formatada.
 */
export function toTitleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => {
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
