import { Sprite } from "../common/Sprite";
import { ItemIcon } from "../common/ItemIcon";
import { TypeBadge } from "../common/TypeBadge";
import { StatRow } from "../common/StatRow";
import { SetTile } from "./SetTile";
import { formatBPAcc, hasEvs, prettyMoveNameFromSlug, setDisplayName } from "../../utils/poke";

function SeenSlotEmptySearch({ index, query, setQuery, onClear }) {
  return (
    <div className="seenSlotEmpty">
      <div className="teamSlotIndex mono">#{index + 1}</div>

      <div className="slotSearchHeader">
        <div className="muted" style={{ fontWeight: 700 }}>
          Filter pool
        </div>
        {query ? (
          <button className="slotClearBtn" onClick={onClear} title="Clear filter">
            Clear ✕
          </button>
        ) : null}
      </div>

      <input
        className="slotSearchInput"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='Type a Pokémon here (e.g. "Gyarados", "Hydreigon-4")...'
      />

      <div className="muted slotHint">Tip: this only filters the pool view. Confirming a set resets the filter.</div>
    </div>
  );
}

function SeenSlot({ set, index, onRemove, searchQuery, setSearchQuery, onClearSearch, moveDex }) {
  if (!set) {
    return (
      <SeenSlotEmptySearch index={index} query={searchQuery} setQuery={setSearchQuery} onClear={onClearSearch} />
    );
  }

  const display = setDisplayName(set);

  return (
    <div className="seenSlot">
      <div className="seenSlotHeader">
        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
          <div className="teamSlotIndex mono">#{index + 1}</div>
          <Sprite url={set.sprite_url_pokeapi} alt={display} />
          <div style={{ minWidth: 0 }}>
            <div className="h2" style={{ margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
            <div className="emptyTitle">Select a trainer</div>
            <div className="muted">Type above to autocomplete and pick one.</div>
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
                    searchQuery={pokemonFilter}
                    setSearchQuery={setPokemonFilter}
                    onClearSearch={() => setPokemonFilter("")}
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
