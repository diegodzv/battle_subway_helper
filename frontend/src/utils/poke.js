export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// Same id scheme as @smogon/calc's toID(): "Porygon-Z" -> "porygonz"
export function speciesId(name) {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function setDisplayName(set) {
  if (!set) return "";
  const v = typeof set.variant_index === "number" ? set.variant_index : null;
  return v ? `${set.species}-${v}` : set.species;
}

export function prettyMoveNameFromSlug(slug) {
  if (!slug || typeof slug !== "string") return null;
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function hasEvs(set, statKey) {
  const n = set?.evs_numeric?.[statKey];
  return typeof n === "number" && n > 0;
}

export function formatBPAcc(moveEntry) {
  if (!moveEntry) return "— / —";
  if (moveEntry.damage_class === "status") return "— / —";
  const bp = typeof moveEntry.power === "number" ? String(moveEntry.power) : "—";
  const acc = typeof moveEntry.accuracy === "number" ? String(moveEntry.accuracy) : "—";
  return `${bp} / ${acc}`;
}

export function getTierClass(v) {
  if (v < 60) return "stat-rDark";
  if (v < 80) return "stat-rLight";
  if (v < 100) return "stat-orange";
  if (v < 130) return "stat-yellow";
  if (v < 160) return "stat-gLight";
  return "stat-gDark";
}

// Gen 5 natures → [boosted stat, lowered stat]; neutral natures are omitted
const NATURE_EFFECTS = {
  Lonely: ["Atk", "Def"], Brave: ["Atk", "Spe"], Adamant: ["Atk", "SpA"], Naughty: ["Atk", "SpD"],
  Bold: ["Def", "Atk"], Relaxed: ["Def", "Spe"], Impish: ["Def", "SpA"], Lax: ["Def", "SpD"],
  Timid: ["Spe", "Atk"], Hasty: ["Spe", "Def"], Jolly: ["Spe", "SpA"], Naive: ["Spe", "SpD"],
  Modest: ["SpA", "Atk"], Mild: ["SpA", "Def"], Quiet: ["SpA", "Spe"], Rash: ["SpA", "SpD"],
  Calm: ["SpD", "Atk"], Gentle: ["SpD", "Def"], Sassy: ["SpD", "Spe"], Careful: ["SpD", "SpA"],
};

export function natureEffectLabel(nature) {
  const effect = NATURE_EFFECTS[nature];
  return effect ? `↑${effect[0]} ↓${effect[1]}` : "Neutral";
}
