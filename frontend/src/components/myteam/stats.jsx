import { clampInt } from "../../utils/poke";

export const EV_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
export const EV_LABEL = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };

export const NATURES = [
  "Hardy","Lonely","Brave","Adamant","Naughty",
  "Bold","Docile","Relaxed","Impish","Lax",
  "Timid","Hasty","Serious","Jolly","Naive",
  "Modest","Mild","Quiet","Bashful","Rash",
  "Calm","Gentle","Sassy","Careful","Quirky",
];

export const NATURE_MODS = {
  Hardy:  { up: null, down: null },
  Docile: { up: null, down: null },
  Serious:{ up: null, down: null },
  Bashful:{ up: null, down: null },
  Quirky: { up: null, down: null },

  Lonely: { up: "atk", down: "def" },
  Brave:  { up: "atk", down: "spe" },
  Adamant:{ up: "atk", down: "spa" },
  Naughty:{ up: "atk", down: "spd" },

  Bold:   { up: "def", down: "atk" },
  Relaxed:{ up: "def", down: "spe" },
  Impish: { up: "def", down: "spa" },
  Lax:    { up: "def", down: "spd" },

  Timid:  { up: "spe", down: "atk" },
  Hasty:  { up: "spe", down: "def" },
  Jolly:  { up: "spe", down: "spa" },
  Naive:  { up: "spe", down: "spd" },

  Modest: { up: "spa", down: "atk" },
  Mild:   { up: "spa", down: "def" },
  Quiet:  { up: "spa", down: "spe" },
  Rash:   { up: "spa", down: "spd" },

  Calm:   { up: "spd", down: "atk" },
  Gentle: { up: "spd", down: "def" },
  Sassy:  { up: "spd", down: "spe" },
  Careful:{ up: "spd", down: "spa" },
};

export function evTotal(evs) {
  return EV_KEYS.reduce((acc, k) => acc + (typeof evs?.[k] === "number" ? evs[k] : 0), 0);
}

export function natureMultiplier(nature, statKey) {
  const n = (nature ?? "").trim();
  const cfg = NATURE_MODS[n] ?? { up: null, down: null };
  if (!cfg.up || !cfg.down) return 1.0;
  if (statKey === cfg.up) return 1.1;
  if (statKey === cfg.down) return 0.9;
  return 1.0;
}

export function calcFinalStatsLv50(
  baseStats,
  evs,
  nature,
  ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }
) {
  const level = 50;
  const out = {};

  const base = baseStats ?? {};
  const E = evs ?? {};
  const I = ivs ?? {};

  // HP
  {
    const b = Number(base.hp ?? 0);
    const ev = Number(E.hp ?? 0);
    const iv = clampInt(Number(I.hp ?? 31), 0, 31);
    const v = Math.floor(((2 * b + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
    out.hp = v;
  }

  // Others
  for (const k of ["atk", "def", "spa", "spd", "spe"]) {
    const b = Number(base[k] ?? 0);
    const ev = Number(E[k] ?? 0);
    const iv = clampInt(Number(I[k] ?? 31), 0, 31);

    const pre = Math.floor(((2 * b + iv + Math.floor(ev / 4)) * level) / 100) + 5;
    const mult = natureMultiplier(nature, k);
    out[k] = Math.floor(pre * mult);
  }

  return out;
}
