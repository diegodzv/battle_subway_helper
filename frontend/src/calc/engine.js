// Thin wrapper around @smogon/calc (Pokémon Showdown's damage calculator), Gen 5 only.
// Everything that touches the library lives here so the UI only deals with plain state.
import { Field, Generations, Move, Pokemon, Stats, calculate, toID } from "@smogon/calc";

export const GEN = Generations.get(5);
export const LEVEL = 50;

export const STATS = [
  { id: "hp", label: "HP" },
  { id: "atk", label: "Atk" },
  { id: "def", label: "Def" },
  { id: "spa", label: "SpA" },
  { id: "spd", label: "SpD" },
  { id: "spe", label: "Spe" },
];

export const STATUSES = [
  { id: "", label: "Healthy" },
  { id: "brn", label: "Burned" },
  { id: "par", label: "Paralyzed" },
  { id: "psn", label: "Poisoned" },
  { id: "tox", label: "Badly poisoned" },
  { id: "slp", label: "Asleep" },
  { id: "frz", label: "Frozen" },
];

export const WEATHERS = ["", "Sun", "Rain", "Sand", "Hail"];

const byName = (a, b) => a.name.localeCompare(b.name);

export const SPECIES_LIST = [...GEN.species].sort(byName);
export const MOVE_LIST = [...GEN.moves]
  .filter((m) => m.name !== "(No Move)" && !/^Hidden Power ./.test(m.name))
  .sort(byName);
export const ITEM_LIST = [...GEN.items].sort(byName);
export const ABILITY_LIST = [...GEN.abilities].sort(byName);
export const NATURE_LIST = [...GEN.natures].sort(byName);

export function getSpecies(name) {
  return name ? GEN.species.get(toID(name)) : undefined;
}

export function getMove(name) {
  return name ? GEN.moves.get(toID(name)) : undefined;
}

// Subway data uses Gen 5 spellings ("TwistedSpoon"); the calc uses modern ones
export function calcItemName(name) {
  return (name && GEN.items.get(toID(name))?.name) || "";
}

// Same slug scheme as the `moves` keys in subway_data.json
export function moveSlug(name) {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Same slug scheme as PokeAPI's item sprites
export function itemSpriteUrl(name) {
  if (!name) return null;
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${moveSlug(name)}.png`;
}

export function speciesSpriteUrl(species) {
  return species ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${species.num}.png` : null;
}

// Regular abilities first (the only ones Subway Pokémon can have), then the Dream World one
export function speciesAbilities(speciesName, abilityData) {
  const id = toID(speciesName ?? "");
  const regular = abilityData?.regular?.[id] ?? [];
  const hidden = abilityData?.hidden?.[id];
  return { regular, hidden: hidden && !regular.includes(hidden) ? hidden : null };
}

export function stageMultiplier(stage) {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

export function boostedStat(value, stage) {
  return Math.floor(value * stageMultiplier(stage));
}

export function hiddenPowerType(ivs) {
  return Stats.getHiddenPower(GEN, ivs)?.type ?? "Dark";
}

function maxIvs() {
  return Object.fromEntries(STATS.map((s) => [s.id, 31]));
}

function curHP(maxHP, hpPct) {
  if (hpPct == null || hpPct >= 100) return undefined;
  return Math.max(1, Math.floor((maxHP * Math.max(0, hpPct)) / 100));
}

function makePokemon(name, { nature, ability, item, evs, ivs, boosts, status, hpPct }) {
  const base = { level: LEVEL, nature, ability: ability || undefined, item: item || undefined, evs, ivs, boosts, status };
  const full = new Pokemon(GEN, name, base);
  const hp = curHP(full.maxHP(), hpPct);
  return hp == null ? full : new Pokemon(GEN, name, { ...base, curHP: hp });
}

// `mon` is a team member from useCalcState; `battle` holds its per-battle toggles
export function buildMyPokemon(mon, battle) {
  const species = getSpecies(mon?.species);
  if (!species) return null;
  return makePokemon(species.name, {
    nature: mon.nature,
    ability: mon.ability,
    item: battle.itemOff ? "" : mon.item,
    evs: mon.evs,
    ivs: mon.ivs,
    boosts: battle.boosts,
    status: battle.status,
    hpPct: battle.hpPct,
  });
}

// `set` is an expanded Subway set (see api/client.js); Subway Pokémon have 31 IVs
export function buildEnemyPokemon(set, battle) {
  const species = getSpecies(set?.species);
  if (!species) return null;
  const evs = Object.fromEntries(STATS.map((s) => [s.id, set.evs_numeric?.[s.label] ?? 0]));
  return makePokemon(species.name, {
    nature: set.nature,
    ability: battle.ability,
    item: battle.itemOff ? "" : calcItemName(set.item),
    evs,
    ivs: maxIvs(),
    boosts: battle.boosts,
    status: battle.status,
    hpPct: battle.hpPct,
  });
}

export function enemyIvs() {
  return maxIvs();
}

function buildMove(name, { crit, ivs }) {
  const move = getMove(name);
  if (!move) return null;
  const moveName = move.name === "Hidden Power" ? `Hidden Power ${hiddenPowerType(ivs)}` : move.name;
  return new Move(GEN, moveName, { isCrit: !!crit });
}

const SIDE_KEYS = ["isReflect", "isLightScreen", "isTailwind", "isSR", "spikes", "isSeeded", "isHelpingHand", "isFriendGuard"];

function sideOptions(side, doubles) {
  const out = {};
  for (const k of SIDE_KEYS) out[k] = side?.[k] ?? (k === "spikes" ? 0 : false);
  if (!doubles) {
    out.isHelpingHand = false;
    out.isFriendGuard = false;
  }
  return out;
}

function buildField(field, attackerKey) {
  const doubles = field.gameType === "Doubles";
  const defenderKey = attackerKey === "mine" ? "enemy" : "mine";
  return new Field({
    gameType: field.gameType,
    weather: field.weather || undefined,
    isGravity: field.isGravity,
    isMagicRoom: field.isMagicRoom,
    isWonderRoom: field.isWonderRoom,
    attackerSide: sideOptions(field.sides[attackerKey], doubles),
    defenderSide: sideOptions(field.sides[defenderKey], doubles),
  });
}

// Returns { desc, short, isStatus } for one attack, or null if it can't be computed
export function computeAttack({ attacker, defender, moveName, crit, attackerIvs, field, attackerKey }) {
  if (!attacker || !defender || !moveName) return null;
  const move = buildMove(moveName, { crit, ivs: attackerIvs });
  if (!move) return null;
  if (move.category === "Status") {
    return { desc: `${attacker.name} ${move.name} is a status move.`, short: "status", isStatus: true };
  }
  const result = calculate(GEN, attacker, defender, move, buildField(field, attackerKey));
  try {
    return { desc: result.desc(), short: result.moveDesc(), isStatus: false };
  } catch {
    // the library throws when every roll is 0 (type immunity, Levitate, Wonder Guard...)
    return { desc: `${attacker.name} ${move.name} vs. ${defender.name}: 0 damage`, short: "0%", isStatus: false };
  }
}
