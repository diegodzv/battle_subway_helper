/**
 * Utility to fetch JSON data from the static public folder.
 * Base URL is automatically handled by Vite based on the 'base' config.
 */
const BASE_PATH = import.meta.env.BASE_URL;

export async function apiGetJson(path) {
  // Eliminamos el slash inicial si existe para evitar rutas absolutas rotas
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const url = `${BASE_PATH}data/${cleanPath}`;
  
  const res = await fetch(url, { cache: "default" }); // Usamos cache por defecto para velocidad
  if (!res.ok) throw new Error(`Data not found: ${url}`);
  return res.json();
}

// Nota: apiPostJson ya no tiene sentido en GitHub Pages porque es estático.
// Si tenías lógica de cálculo en el backend (POST), ahora deberá ser una función JS.