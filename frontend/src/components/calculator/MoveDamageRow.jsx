import TypeBadge from "../common/TypeBadge";

/**
 * Fila compacta de movimiento:
 * - nombre y tipo
 * - daño
 * - POWER/ACC inline (no en línea aparte)
 * - toggle Crit a la derecha
 */
export default function MoveDamageRow({
  moveName,
  moveType,
  damageText,
  powerAccText,
  crit,
  onCritChange,
  onClick,
}) {
  return (
    <button className="calcMoveRow" type="button" onClick={onClick}>
      <div className="calcMoveLeft">
        <TypeBadge type={moveType || "unknown"} />
        <span className="mono calcMoveName">{moveName || "—"}</span>
      </div>

      <div className="calcMoveRight mono">
        <span className="calcMoveDmg">{damageText || "—"}</span>
        <span className="calcMovePA muted">{powerAccText || ""}</span>

        <label className="calcCritToggle" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!crit}
            onChange={(e) => onCritChange?.(e.target.checked)}
          />
          <span>Crit</span>
        </label>
      </div>
    </button>
  );
}
