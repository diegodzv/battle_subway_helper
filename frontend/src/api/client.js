const BASE_PATH = import.meta.env.BASE_URL;

export async function loadStaticJson(filename) {
  const url = `${BASE_PATH}data/${filename}`;
  const res = await fetch(url, { cache: 'default' });
  if (!res.ok) throw new Error(`Data not found: ${url}`);
  return res.json();
}
