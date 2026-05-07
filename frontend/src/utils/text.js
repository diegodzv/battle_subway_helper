/**
 * Réplica de la función normalize de Python para JS.
 */
export function normalize(s) {
  if (!s) return "";
  return s
    .toString()
    .normalize("NFD") // Descompone tildes
    .replace(/[\u0300-\u036f]/g, "") // Elimina tildes
    .toLowerCase()
    .replace(/[^\w\s]+/gu, " ") // Quita símbolos
    .replace(/\s+/g, " ") // Colapsa espacios
    .trim();
}