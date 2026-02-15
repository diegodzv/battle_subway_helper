import { clamp01, getTierClass } from "../../utils/poke";

export function StatRow({ label, value, max = 200, compact = false, boosted = false }) {
  const v = typeof value === "number" ? value : 0;

  const basePct = Math.round(clamp01(v / max) * 100);
  const overflowPct = v > max ? Math.round(clamp01((v - max) / max) * 100) : 0;
  const tierClass = getTierClass(v);

  return (
    <div className={`statLine ${compact ? "statLineCompact" : ""}`}>
      <div className={`statLabel muted ${boosted ? "statLabelBoosted" : ""}`}>{label}</div>
      <div className="statBarTrack" aria-label={`${label} ${v}`}>
        <div className={`statBarFill ${tierClass}`} style={{ width: `${basePct}%` }} />
        {overflowPct > 0 ? (
          <div className="statOverflow" style={{ width: `${overflowPct}%` }} title={`Overflow +${v - max}`} />
        ) : null}
      </div>
      <div className="statValue mono">{typeof value === "number" ? value : "-"}</div>
    </div>
  );
}
