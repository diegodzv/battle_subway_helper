const BASE_PATH = import.meta.env.BASE_URL;
const SPRITES_URL = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites";
const STAT_KEYS = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];

export async function loadStaticJson(filename) {
  const url = `${BASE_PATH}data/${filename}`;
  const res = await fetch(url, { cache: 'default' });
  if (!res.ok) throw new Error(`Data not found: ${url}`);
  return res.json();
}

// The Subway splits 510 EVs evenly across the trained stats, capped at 255 each
function evsNumeric(evs) {
  const per = evs.length ? Math.min(255, Math.floor(510 / evs.length)) : 0;
  return Object.fromEntries(STAT_KEYS.map((k) => [k, evs.includes(k) ? per : 0]));
}

// Expands a compact set record from subway_data.json into the shape the components use
function expandSet(raw, moves, items) {
  const itemSlug = items[raw.item];
  return {
    global_id: raw.id,
    species: raw.species,
    variant_index: raw.variant,
    dex_number: raw.dex,
    nature: raw.nature,
    item: raw.item,
    moves_meta: raw.moves.map((slug) => ({ slug, type: moves[slug]?.type })),
    evs_numeric: evsNumeric(raw.evs),
    stats_lv50: Object.fromEntries(STAT_KEYS.map((k, i) => [k, raw.stats[i]])),
    sprite_url_pokeapi: `${SPRITES_URL}/pokemon/${raw.dex}.png`,
    item_sprite_url: itemSlug ? `${SPRITES_URL}/items/${itemSlug}.png` : null,
  };
}

export async function loadSubwayData() {
  const data = await loadStaticJson("subway_data.json");
  const moveDex = data.moves ?? {};
  const items = data.items ?? {};

  const setsIndex = new Map();
  for (const raw of data.sets ?? []) setsIndex.set(raw.id, expandSet(raw, moveDex, items));

  const pools = data.pools ?? [];
  const trainersList = (data.trainers ?? []).map((t) => ({ ...t, pool_global_ids: pools[t.pool] ?? [] }));

  return { trainersList, setsIndex, moveDex };
}
