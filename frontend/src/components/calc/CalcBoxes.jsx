import { ItemIcon } from "../common/ItemIcon";
import { TypeBadge } from "../common/TypeBadge";
import { StatRow } from "../common/StatRow";
import { SearchSelect } from "../common/SearchSelect";
import { formatBPAcc } from "../../utils/poke";
import { STATUSES, boostedStat } from "../../calc/engine";

const STAGES = [6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6];

export function ItemBox({ item, iconUrl, itemOff, onToggleOff, itemOptions, onSelectItem }) {
  return (
    <div className="miniBox">
      <div className="calcBoxHeader">
        <div className="h3">Item</div>
        <label className="calcCheck" title="Ignore the held item (consumed, knocked off, Klutz...)">
          <input type="checkbox" checked={itemOff} onChange={(e) => onToggleOff(e.target.checked)} />
          <span>Disable</span>
        </label>
      </div>
      <div className={`calcItemRow ${itemOff ? "calcDisabled" : ""}`}>
        <ItemIcon url={iconUrl} alt={item} />
        {itemOptions ? (
          <div className="calcGrow">
            <SearchSelect
              className="calcInput"
              value={item}
              options={itemOptions}
              onSelect={(o) => onSelectItem(o.key)}
              placeholder="Search item..."
            />
          </div>
        ) : (
          <span className="itemName">{item || "—"}</span>
        )}
        {itemOptions && item ? (
          <button className="slotClearBtn" onClick={() => onSelectItem("")} title="Remove item">
            ✕
          </button>
        ) : null}
      </div>
    </div>
  );
}

// moves: [{ name, type, entry }] (entry = moveDex record); `editable` turns names into searches
export function MovesBox({ moves, selectedIndex, onSelect, crits, onCrit, moveOptions, onSelectMove }) {
  return (
    <div className="miniBox">
      <div className="calcMovesHeader">
        <div className="h3">Moves</div>
        <div className="muted mono movesHeaderPA">POWER / ACC</div>
        <div className="muted mono movesHeaderPA">CRIT</div>
      </div>
      <ul className="moves">
        {moves.map((m, i) => (
          <li
            key={i}
            className={`moveRow calcMoveRow ${selectedIndex === i ? "calcMoveSelected" : ""} ${m.name ? "" : "calcMoveEmpty"}`}
            onClick={() => m.name && onSelect(i)}
            title={m.name ? "Show this move's damage" : undefined}
          >
            <TypeBadge type={m.type} />
            {moveOptions ? (
              <div onClick={(e) => e.stopPropagation()}>
                <SearchSelect
                  className="calcInput"
                  value={m.name}
                  options={moveOptions}
                  onSelect={(o) => onSelectMove(i, o.key)}
                  placeholder={`Move ${i + 1}...`}
                />
              </div>
            ) : (
              <span className="mono">{m.label ?? m.name}</span>
            )}
            <span className="mono movePA">{m.name ? formatBPAcc(m.entry) : ""}</span>
            <input
              type="checkbox"
              className="calcCritBox"
              checked={!!crits[i]}
              disabled={!m.name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onCrit(i, e.target.checked)}
              title="Critical hit"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// rows: [{ id, label, value, highlight }]; `spread` (mine only) adds EV/IV inputs
export function StatsBox({ rows, boosts, onBoost, spread, onSpread }) {
  const evTotal = spread ? Object.values(spread.evs).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="miniBox">
      <div className="calcBoxHeader">
        <div className="h3">Stats (Lv 50)</div>
        {spread ? (
          <div className={`muted mono ${evTotal > 510 ? "calcWarn" : ""}`} title="Max 510 EVs in total">
            EVs {evTotal}/510
          </div>
        ) : null}
      </div>
      <div className={`calcStatHead muted mono ${spread ? "calcStatGridMine" : "calcStatGrid"}`}>
        <span />
        {spread ? (
          <>
            <span>EV</span>
            <span>IV</span>
          </>
        ) : null}
        <span>STAGE</span>
        <span>FINAL</span>
      </div>
      <div className="statTable statTableCompact">
        {rows.map((r) => {
          const stage = boosts[r.id] ?? 0;
          const isHP = r.id === "hp";
          const final = isHP ? r.value : boostedStat(r.value, stage);
          return (
            <div key={r.id} className={spread ? "calcStatGridMine" : "calcStatGrid"}>
              <StatRow label={r.label} value={r.value} max={200} compact boosted={r.highlight} />
              {spread ? (
                <>
                  <NumberInput value={spread.evs[r.id]} min={0} max={255} onChange={(v) => onSpread("evs", r.id, v)} />
                  <NumberInput value={spread.ivs[r.id]} min={0} max={31} onChange={(v) => onSpread("ivs", r.id, v)} />
                </>
              ) : null}
              {isHP ? (
                <span />
              ) : (
                <select
                  className={`calcSelect calcStageSelect ${stage > 0 ? "calcUp" : stage < 0 ? "calcDown" : ""}`}
                  value={stage}
                  onChange={(e) => onBoost(r.id, Number(e.target.value))}
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s > 0 ? `+${s}` : s}
                    </option>
                  ))}
                </select>
              )}
              <span className={`mono calcFinal ${final > r.value ? "calcUp" : final < r.value ? "calcDown" : ""}`}>
                {final}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NumberInput({ value, min, max, onChange }) {
  return (
    <input
      className="calcInput calcNumber mono"
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const n = Math.round(Number(e.target.value));
        onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);
      }}
    />
  );
}

export function BattleBox({ battle, onChange }) {
  return (
    <div className="miniBox">
      <div className="h3">Condition</div>
      <div className="calcConditionRow">
        <label className="calcField">
          <span className="muted">Status</span>
          <select className="calcSelect" value={battle.status} onChange={(e) => onChange({ status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="calcField">
          <span className="muted">Current HP %</span>
          <input
            className="calcInput calcNumber mono"
            type="number"
            min={1}
            max={100}
            value={battle.hpPct}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              onChange({ hpPct: Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 100 });
            }}
          />
        </label>
      </div>
    </div>
  );
}
