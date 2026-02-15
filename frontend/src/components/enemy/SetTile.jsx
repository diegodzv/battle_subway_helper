import { Sprite } from "../common/Sprite";
import { ItemIcon } from "../common/ItemIcon";
import { TypeBadge } from "../common/TypeBadge";
import { StatRow } from "../common/StatRow";
import { formatBPAcc, hasEvs, prettyMoveNameFromSlug, setDisplayName } from "../../utils/poke";

export function SetTile({ set, isDiscarded, onDiscardToggle, onConfirm, canConfirm, showStats }) {
  const display = setDisplayName(set);
  const movesMeta = Array.isArray(set.moves_meta) ? set.moves_meta : null;

  return (
    <div className={`setTile ${isDiscarded ? "setTileDiscarded" : ""}`}>
      <div className="setTileTop">
        <Sprite url={set.sprite_url_pokeapi} alt={display} />

        <div className="setTileTitle">
          <div className="name">{display}</div>
          <div className="meta muted">
            <span className="mono">#{set.global_id}</span> · Dex <span className="mono">{set.dex_number ?? "?"}</span> ·{" "}
            <span className="mono">{set.nature}</span>
          </div>
        </div>

        <div className="setTileActions">
          <button
            className={`tileBtn ${isDiscarded ? "tileBtnUndo" : "tileBtnDiscard"}`}
            onClick={() => onDiscardToggle(set.global_id)}
            title={isDiscarded ? "Undo discard" : "Discard this set"}
          >
            {isDiscarded ? "↩" : "✕"}
          </button>

          <button
            className="tileBtn tileBtnConfirm"
            onClick={() => onConfirm(set)}
            disabled={!canConfirm || isDiscarded}
            title={
              !canConfirm
                ? "Team already has 4 confirmed"
                : isDiscarded
                ? "Undo discard first"
                : "Confirm this set (adds to Seen)"
            }
          >
            ✓
          </button>
        </div>
      </div>

      <div className="setTileBody">
        <div className="tileSection">
          <div className="tileLabel muted">Item</div>
          <div className="itemLine">
            <ItemIcon url={set.item_sprite_url} alt={set.item} />
            <span className="itemName">{set.item}</span>
          </div>
        </div>

        <div className="tileSection">
          <div className="tileLabel muted">Moves</div>
          <ul className="moves">
            {movesMeta
              ? movesMeta.map((m) => {
                  const label = prettyMoveNameFromSlug(m.slug) ?? m.name;
                  return (
                    <li key={m.slug ?? m.name} className="moveRow">
                      <TypeBadge type={m.type} />
                      <span className="mono">{label}</span>
                    </li>
                  );
                })
              : (Array.isArray(set.moves) ? set.moves : []).map((m) => (
                  <li key={m} className="moveRow">
                    <TypeBadge type={null} />
                    <span className="mono">{m}</span>
                  </li>
                ))}
          </ul>
        </div>

        {showStats ? (
          <div className="tileSection">
            <div className="tileLabel muted">Stats (Lv 50)</div>
            <div className="statTable statTableCompact">
              <StatRow label="HP" value={set.stats_lv50?.HP} max={200} compact boosted={hasEvs(set, "HP")} />
              <StatRow label="Atk" value={set.stats_lv50?.Atk} max={200} compact boosted={hasEvs(set, "Atk")} />
              <StatRow label="Def" value={set.stats_lv50?.Def} max={200} compact boosted={hasEvs(set, "Def")} />
              <StatRow label="SpA" value={set.stats_lv50?.SpA} max={200} compact boosted={hasEvs(set, "SpA")} />
              <StatRow label="SpD" value={set.stats_lv50?.SpD} max={200} compact boosted={hasEvs(set, "SpD")} />
              <StatRow label="Spe" value={set.stats_lv50?.Spe} max={200} compact boosted={hasEvs(set, "Spe")} />
            </div>
          </div>
        ) : null}
      </div>

      {isDiscarded ? <div className="tileRibbon">DISCARDED</div> : null}
    </div>
  );
}
