export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export function clampInt(n, lo, hi) {
  const x = Number.isFinite(n) ? n : Number.parseInt(String(n), 10);
  const v = Number.isFinite(x) ? x : 0;
  return Math.max(lo, Math.min(hi, Math.trunc(v)));
}

export function normalizeKey(s) {
  return (s ?? "").toString().trim().toLowerCase();
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

export function findMoveSlugFromText(text, moveDex) {
  if (!moveDex || typeof moveDex !== "object") return null;

  const t = normalizeKey(text);
  if (!t) return null;

  // exact slug match
  if (Object.prototype.hasOwnProperty.call(moveDex, t)) return t;

  // spaces -> hyphen
  const hy = t.replace(/\s+/g, "-");
  if (Object.prototype.hasOwnProperty.call(moveDex, hy)) return hy;

  // match by pretty name
  for (const slug of Object.keys(moveDex)) {
    const pn = prettyMoveNameFromSlug(slug);
    if (pn && normalizeKey(pn) === t) return slug;
  }

  return null;
}

export function getTierClass(v) {
  if (v < 60) return "stat-rDark";
  if (v < 80) return "stat-rLight";
  if (v < 100) return "stat-orange";
  if (v < 130) return "stat-yellow";
  if (v < 160) return "stat-gLight";
  return "stat-gDark";
}
