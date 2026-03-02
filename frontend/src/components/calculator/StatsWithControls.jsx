import StatRow from "../common/StatRow";

const BOOSTS = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];

function clampInt(n, lo, hi) {
  const x = Number.isFinite(n) ? n : lo;
  return Math.max(lo, Math.min(hi, x));
}

export default function StatsWithControls({
  title = "Stats (Lv 50)",
  stats, // {hp, atk, def, spa, spd, spe}
  currentHp,
  onCurrentHpChange,
  boosts, // {atk, def, spa, spd, spe}
  onBoostChange,
}) {
  const maxHp = clampInt(parseInt(stats?.hp ?? 1, 10), 1, 9999);
  const curHp = clampInt(parseInt(currentHp ?? maxHp, 10), 0, maxHp);

  const rows = [
    { key: "hp", label: "HP" },
    { key: "atk", label: "Atk" },
    { key: "def", label: "Def" },
    { key: "spa", label: "SpA" },
    { key: "spd", label: "SpD" },
    { key: "spe", label: "Spe" },
  ];

  return (
    <div className="miniBox">
      <div className="statsTitleRow">
        <div className="h3">{title}</div>
      </div>

      {/* Grid propio del calculator: valor + barra + control */}
      <div className="calcStatsGrid">
        {rows.map((r) => {
          const v = Number(stats?.[r.key] ?? 0);

          return (
            <div key={r.key} className="calcStatRow">
              {/* Etiqueta */}
              <div className="mono calcStatKey">{r.label}</div>

              {/* Valor Lv50 (un poco más a la izquierda) */}
              <div className="mono calcStatVal">
                {r.key === "hp" ? maxHp : v}
              </div>

              {/* Barra: reutilizamos StatRow para el render de barra/colores */}
              <div className="calcStatBar">
                <StatRow
                  statKey={r.key}
                  label={r.label}
                  value={r.key === "hp" ? maxHp : v}
                  compact
                />
              </div>

              {/* Control */}
              {r.key === "hp" ? (
                <div className="calcHpControl mono">
                  <input
                    className="hpInput mono"
                    type="number"
                    min={0}
                    max={maxHp}
                    step={1}
                    value={curHp}
                    onChange={(e) => {
                      const next = clampInt(parseInt(e.target.value || "0", 10), 0, maxHp);
                      onCurrentHpChange?.(next);
                    }}
                  />
                  <span className="muted">/</span>
                  <span>{maxHp}</span>
                </div>
              ) : (
                <select
                  className="boostSelect mono"
                  value={Number(boosts?.[r.key] ?? 0)}
                  onChange={(e) => onBoostChange?.(r.key, parseInt(e.target.value, 10))}
                  title="Boost stage"
                >
                  {BOOSTS.map((b) => (
                    <option key={b} value={b}>
                      {b >= 0 ? `+${b}` : `${b}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
