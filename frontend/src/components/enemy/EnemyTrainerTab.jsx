import { Sprite } from "../common/Sprite";
import { ItemIcon } from "../common/ItemIcon";
import { TypeBadge } from "../common/TypeBadge";
import { StatRow } from "../common/StatRow";
import { SetTile } from "./SetTile";
import { formatBPAcc, hasEvs, prettyMoveNameFromSlug, setDisplayName } from "../../utils/poke";

function SeenSlotEmpty({ index }) {
  return (
    <div className="seenSlotEmpty" style={{ placeItems: "center", display: "grid" }}>
      <div className="teamSlotIndex mono">#{index + 1}</div>
    </div>
  );
}

function SeenSlot({ set, index, onRemove, moveDex }) {
  if (!set) {
    return <SeenSlotEmpty index={index} />;
  }

  const display = setDisplayName(set);

  return (
    <div className="seenSlot">
      <div className="seenSlotHeader">
        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
          <div className="teamSlotIndex mono">#{index + 1}</div>
          <Sprite url={set.sprite_url_pokeapi} alt={display} />
          <div style={{ minWidth: 0 }}>
            <div className="h3" style={{ margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {display}
            </div>
            <div className="muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              <span className="mono">#{set.global_id}</span> · Dex <span className="mono">{set.dex_number ?? "?"}</span> ·{" "}
              <span className="mono">{set.nature}</span>
            </div>

            <div className="itemLine">
              <ItemIcon url={set.item_sprite_url} alt={set.item} />
              <span className="itemName">{set.item}</span>
            </div>
          </div>
        </div>

        <button className="chip chipDanger" onClick={() => onRemove(set.global_id)} title="Remove from seen">
          Remove ✕
        </button>
      </div>

      <div className="seenSlotBody">
        <div className="miniBox">
          <div className="movesHeaderRow">
            <div className="h3">Moves</div>
            <div className="muted mono movesHeaderPA">POWER / ACC</div>
          </div>

          <ul className="moves">
            {(Array.isArray(set.moves_meta) ? set.moves_meta : []).map((m) => {
              const label = prettyMoveNameFromSlug(m.slug) ?? m.name;
              const entry =
                m?.slug && moveDex && Object.prototype.hasOwnProperty.call(moveDex, m.slug) ? moveDex[m.slug] : null;
              const bpacc = formatBPAcc(entry);

              return (
                <li key={m.slug ?? m.name} className="moveRow moveRowSeen">
                  <TypeBadge type={m.type} />
                  <span className="mono">{label}</span>
                  <span className="mono movePA">{bpacc}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="miniBox">
          <div className="h3">Stats (Lv 50)</div>
          <div className="statTable statTableCompact">
            <StatRow label="HP" value={set.stats_lv50?.HP} max={200} compact boosted={hasEvs(set, "HP")} />
            <StatRow label="Atk" value={set.stats_lv50?.Atk} max={200} compact boosted={hasEvs(set, "Atk")} />
            <StatRow label="Def" value={set.stats_lv50?.Def} max={200} compact boosted={hasEvs(set, "Def")} />
            <StatRow label="SpA" value={set.stats_lv50?.SpA} max={200} compact boosted={hasEvs(set, "SpA")} />
            <StatRow label="SpD" value={set.stats_lv50?.SpD} max={200} compact boosted={hasEvs(set, "SpD")} />
            <StatRow label="Spe" value={set.stats_lv50?.Spe} max={200} compact boosted={hasEvs(set, "Spe")} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function EnemyTrainerTab(props) {
  const {
    searchProps,
    trainer,
    confirmed,
    discarded,
    showDiscarded,
    setShowDiscarded,
    showStatsInPool,
    setShowStatsInPool,
    pokemonFilter,
    setPokemonFilter,
    debouncedPokemonFilter,
    moveDex,
    poolSets,
    visiblePool,
    confirmedSets,
    toggleDiscard,
    confirmSet,
    removeConfirmed,
  } = props;

  return (
    <>
      <main className="content">
        {!trainer ? (
          <div className="empty">
            <div className="emptyTitle" style={{ textAlign: "center" }}>Enter Trainer Name</div>
            <div className="searchBox" style={{ marginTop: 14 }}>
              <input
                className="searchInput"
                value={searchProps.q}
                onChange={(e) => searchProps.setQ(e.target.value)}
                placeholder="Search trainer / Buscar entrenador (e.g. clerk, oficinista)..."
                autoFocus
              />
              {!searchProps.dataReady ? <div className="spinner" title="Loading data..." /> : null}
              {searchProps.suggestions.length > 0 ? (
                <div className="dropdown dropdownAbove">
                  {searchProps.suggestions.map((s) => (
                    <button
                      key={s.trainer_id}
                      className="dropdownItem"
                      onClick={() => {
                        searchProps.loadTrainer(s.trainer_id);
                        searchProps.setSuggestions([]);
                      }}
                    >
                      <div className="dropdownName">{s.display_name ?? s.name_en}</div>
                      <div className="dropdownMeta muted">
                        {s.name_es ? (
                          <><span className="mono">{s.name_en}</span> · {s.section}</>
                        ) : (
                          <>{s.section}</>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="layoutNew">
            <section className="panel">
              <div className="panelTitle">
                <div className="h2">Seen ({confirmed.length}/4)</div>
                <div className="muted">Confirm sets to fill slots 1–4</div>
              </div>

              <div className="seenGrid">
                {confirmedSets.map((s, idx) => (
                  <SeenSlot
                    key={idx}
                    set={s}
                    index={idx}
                    onRemove={removeConfirmed}
                    moveDex={moveDex}
                  />
                ))}
              </div>

              <div className="muted" style={{ marginTop: 10 }}>
                Tip: confirming a set auto-discards other variants of the same species, and also applies Item Clause (same
                item can’t appear twice).
              </div>
            </section>

            <section className="panel">
              <div className="panelTitle">
                <div className="h2">Pool</div>
                <div className="muted">
                  Use ✕ to discard and ✓ to confirm.
                  {debouncedPokemonFilter.trim() ? (
                    <>
                      {" "}
                      · filtering by <span className="mono">{debouncedPokemonFilter.trim()}</span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="poolGrid">
                {visiblePool.map((s) => (
                  <SetTile
                    key={s.global_id}
                    set={s}
                    isDiscarded={discarded.has(s.global_id)}
                    onDiscardToggle={toggleDiscard}
                    onConfirm={confirmSet}
                    canConfirm={confirmed.length < 4}
                    showStats={showStatsInPool}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      <footer className="footer muted">Confirming auto-discards other variants of the same species + Item Clause.</footer>
    </>
  );
}
