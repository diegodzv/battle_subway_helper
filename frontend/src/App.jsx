import { useEffect, useMemo, useState } from "react";
import "./App.css";

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function Sprite({ url, alt }) {
  if (!url) return <div className="spriteFallback">?</div>;
  return <img className="sprite" src={url} alt={alt} loading="lazy" />;
}

function ItemIcon({ url, alt }) {
  if (!url)
    return (
      <span className="itemIconFallback" title="No icon">
        ◻
      </span>
    );
  return <img className="itemIcon" src={url} alt={alt} loading="lazy" />;
}

function TypeBadge({ type }) {
  if (!type) return <span className="typeBadge type-unknown">???</span>;
  return <span className={`typeBadge type-${type}`}>{type.toUpperCase()}</span>;
}

function getTierClass(v) {
  if (v < 60) return "stat-rDark";
  if (v < 80) return "stat-rLight";
  if (v < 100) return "stat-orange";
  if (v < 130) return "stat-yellow";
  if (v < 160) return "stat-gLight";
  return "stat-gDark"; // 160..200 (and also base for >=200)
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function StatRow({ label, value, max = 200, compact = false, boosted = false }) {
  const v = typeof value === "number" ? value : 0;

  // Base fill is capped at max (200).
  const basePct = Math.round(clamp01(v / max) * 100);

  // Overflow: for v > max, overlay from left with (v-max)/max, capped at 100%.
  // Example: v=220 -> overflowPct=10; v=210 -> 5; v=400 -> 100
  const overflowPct = v > max ? Math.round(clamp01((v - max) / max) * 100) : 0;

  const tierClass = getTierClass(v);

  return (
    <div className={`statLine ${compact ? "statLineCompact" : ""}`}>
      <div className={`statLabel muted ${boosted ? "statLabelBoosted" : ""}`}>{label}</div>
      <div className="statBarTrack" aria-label={`${label} ${v}`}>
        <div className={`statBarFill ${tierClass}`} style={{ width: `${basePct}%` }} />
        {overflowPct > 0 ? (
          <div
            className="statOverflow"
            style={{ width: `${overflowPct}%` }}
            title={`Overflow +${v - max}`}
          />
        ) : null}
      </div>
      <div className="statValue mono">{typeof value === "number" ? value : "-"}</div>
    </div>
  );
}

function setDisplayName(set) {
  if (!set) return "";
  const v = typeof set.variant_index === "number" ? set.variant_index : null;
  return v ? `${set.species}-${v}` : set.species;
}

function prettyMoveNameFromSlug(slug) {
  if (!slug || typeof slug !== "string") return null;
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function hasEvs(set, statKey) {
  const n = set?.evs_numeric?.[statKey];
  return typeof n === "number" && n > 0;
}

function SetTile({ set, isDiscarded, onDiscardToggle, onConfirm, canConfirm, showStats }) {
  const display = setDisplayName(set);
  const movesMeta = Array.isArray(set.moves_meta) ? set.moves_meta : null;

  return (
    <div className={`setTile ${isDiscarded ? "setTileDiscarded" : ""}`}>
      <div className="setTileTop">
        <Sprite url={set.sprite_url_pokeapi} alt={display} />

        <div className="setTileTitle">
          <div className="name">{display}</div>
          <div className="meta muted">
            <span className="mono">#{set.global_id}</span> · Dex{" "}
            <span className="mono">{set.dex_number ?? "?"}</span> ·{" "}
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

        {/* Stats opcionales en el pool */}
        {showStats ? (
          <div className="tileSection">
            <div className="tileLabel muted">Stats (Lv 50)</div>
            <div className="statTable statTableCompact">
              <StatRow
                label="HP"
                value={set.stats_lv50?.HP}
                max={200}
                compact
                boosted={hasEvs(set, "HP")}
              />
              <StatRow
                label="Atk"
                value={set.stats_lv50?.Atk}
                max={200}
                compact
                boosted={hasEvs(set, "Atk")}
              />
              <StatRow
                label="Def"
                value={set.stats_lv50?.Def}
                max={200}
                compact
                boosted={hasEvs(set, "Def")}
              />
              <StatRow
                label="SpA"
                value={set.stats_lv50?.SpA}
                max={200}
                compact
                boosted={hasEvs(set, "SpA")}
              />
              <StatRow
                label="SpD"
                value={set.stats_lv50?.SpD}
                max={200}
                compact
                boosted={hasEvs(set, "SpD")}
              />
              <StatRow
                label="Spe"
                value={set.stats_lv50?.Spe}
                max={200}
                compact
                boosted={hasEvs(set, "Spe")}
              />
            </div>
          </div>
        ) : null}
      </div>

      {isDiscarded ? <div className="tileRibbon">DISCARDED</div> : null}
    </div>
  );
}

function SeenSlot({ set, index, onRemove }) {
  if (!set) {
    return (
      <div className="seenSlotEmpty">
        <div className="teamSlotIndex mono">#{index + 1}</div>
        <div className="muted">Empty slot</div>
      </div>
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
            <div
              className="h2"
              style={{
                margin: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {display}
            </div>
            <div
              className="muted"
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <span className="mono">#{set.global_id}</span> · Dex{" "}
              <span className="mono">{set.dex_number ?? "?"}</span> ·{" "}
              <span className="mono">{set.nature}</span>
            </div>

            {/* Item en los vistos */}
            <div className="itemLine">
              <ItemIcon url={set.item_sprite_url} alt={set.item} />
              <span className="itemName">{set.item}</span>
            </div>
          </div>
        </div>

        <button
          className="chip chipDanger"
          onClick={() => onRemove(set.global_id)}
          title="Remove from seen"
        >
          Remove ✕
        </button>
      </div>

      <div className="seenSlotBody">
        <div className="miniBox">
          <div className="h3">Moves</div>
          <ul className="moves">
            {(Array.isArray(set.moves_meta) ? set.moves_meta : []).map((m) => {
              const label = prettyMoveNameFromSlug(m.slug) ?? m.name;
              return (
                <li key={m.slug ?? m.name} className="moveRow">
                  <TypeBadge type={m.type} />
                  <span className="mono">{label}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="miniBox">
          <div className="h3">Stats</div>
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

export default function App() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 150);
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [trainer, setTrainer] = useState(null);

  // confirmed team (4 slots): store global_ids, order matters
  const [confirmed, setConfirmed] = useState([]); // array of global_id
  const [discarded, setDiscarded] = useState(() => new Set()); // Set<global_id>
  const [showDiscarded, setShowDiscarded] = useState(false);

  // toggle stats en pool
  const [showStatsInPool, setShowStatsInPool] = useState(false);

  const poolSets = trainer?.sets ?? [];

  // quick map for lookups
  const setById = useMemo(() => {
    const m = new Map();
    for (const s of poolSets) m.set(s.global_id, s);
    return m;
  }, [poolSets]);

  // pool sorted: dex_number then global_id
  const poolSortedDex = useMemo(() => {
    const copy = [...poolSets];
    copy.sort((a, b) => {
      const da = typeof a.dex_number === "number" ? a.dex_number : 999999;
      const db = typeof b.dex_number === "number" ? b.dex_number : 999999;
      if (da !== db) return da - db;
      return (a.global_id ?? 0) - (b.global_id ?? 0);
    });
    return copy;
  }, [poolSets]);

  // visible pool = not confirmed, and (not discarded unless toggle)
  const visiblePool = useMemo(() => {
    const confirmedSet = new Set(confirmed);
    return poolSortedDex.filter((s) => {
      if (confirmedSet.has(s.global_id)) return false;
      const isDisc = discarded.has(s.global_id);
      if (isDisc && !showDiscarded) return false;
      return true;
    });
  }, [poolSortedDex, confirmed, discarded, showDiscarded]);

  const confirmedSets = useMemo(() => {
    const slots = [null, null, null, null];
    for (let i = 0; i < Math.min(4, confirmed.length); i++) {
      slots[i] = setById.get(confirmed[i]) ?? null;
    }
    return slots;
  }, [confirmed, setById]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const nq = debouncedQ.trim();
      if (!nq) {
        setSuggestions([]);
        return;
      }
      setIsSearching(true);
      try {
        const res = await fetch(`/trainers/search?q=${encodeURIComponent(nq)}&limit=20`);
        if (!res.ok) throw new Error(`search failed: ${res.status}`);
        const data = await res.json();
        if (!cancelled) setSuggestions(data);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ]);

  async function loadTrainer(trainerId) {
    setTrainer(null);
    setConfirmed([]);
    setDiscarded(new Set());
    setShowDiscarded(false);
    setShowStatsInPool(false);

    const res = await fetch(`/trainers/${trainerId}`);
    if (!res.ok) {
      alert("Could not load trainer.");
      return;
    }
    const data = await res.json();
    setTrainer(data);
  }

  function resetAll() {
    setTrainer(null);
    setConfirmed([]);
    setDiscarded(new Set());
    setShowDiscarded(false);
    setShowStatsInPool(false);
    setQ("");
    setSuggestions([]);
  }

  function toggleDiscard(globalId) {
    setDiscarded((prev) => {
      const next = new Set(prev);
      if (next.has(globalId)) next.delete(globalId);
      else next.add(globalId);
      return next;
    });
  }

  function confirmSet(set) {
    if (!set) return;
    if (confirmed.length >= 4) return;
    if (discarded.has(set.global_id)) return;

    setConfirmed((prev) => [...prev, set.global_id]);

    // Auto-discard rules:
    //  - same species, other variants (as before)
    //  - item clause: same item cannot appear twice in the opponent team
    setDiscarded((prev) => {
      const next = new Set(prev);

      const confirmedSpecies = set.species;
      const confirmedItem = (set.item ?? "").trim();

      for (const s of poolSets) {
        if (s.global_id === set.global_id) continue;

        // discard other variants of same species
        if (s.species === confirmedSpecies) {
          next.add(s.global_id);
          continue;
        }

        // Item clause: discard any other set with same item
        const item = (s.item ?? "").trim();
        if (confirmedItem && item && item === confirmedItem) {
          next.add(s.global_id);
        }
      }

      return next;
    });
  }

  function removeConfirmed(globalId) {
    setConfirmed((prev) => prev.filter((x) => x !== globalId));
  }

  const trainerTitle = trainer?.display_name ?? trainer?.name_en ?? "";

  const total = poolSets.length;
  const confirmedCount = confirmed.length;
  const discardedCount = discarded.size;
  const shownCount = visiblePool.length;

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <div className="brandTitle">Battle Subway Helper (B2/W2)</div>
          <div className="muted">
            By{" "}
            <a
              href="https://github.com/diegodzv"
              target="_blank"
              rel="noopener noreferrer"
              className="authorLink"
            >
              @diegodzv
            </a>
          </div>
        </div>

        <div className="searchBox">
          <input
            className="searchInput"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Search trainer / Buscar entrenador (e.g. "clerk", "oficinista")...'
          />
          {isSearching ? <div className="spinner" title="Searching..." /> : null}

          {suggestions.length > 0 ? (
            <div className="dropdown">
              {suggestions.map((s) => (
                <button
                  key={s.trainer_id}
                  className="dropdownItem"
                  onClick={() => {
                    loadTrainer(s.trainer_id);
                    setSuggestions([]);
                  }}
                >
                  <div className="dropdownName">{s.display_name ?? s.name_en}</div>
                  <div className="dropdownMeta muted">
                    {s.name_es ? (
                      <>
                        <span className="mono">{s.name_en}</span> · {s.section}
                      </>
                    ) : (
                      <>{s.section}</>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button className="ghostBtn" onClick={resetAll}>
          Reset
        </button>
      </header>

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
                <div>
                  <div className="h1">{trainerTitle}</div>
                  <div className="muted">
                    {trainer.name_es ? (
                      <>
                        <span className="mono">{trainer.name_en}</span> · {trainer.section} · pool{" "}
                        <span className="mono">{trainer.pool_id}</span> ·{" "}
                        <span className="mono">{trainer.pool_size}</span> sets
                      </>
                    ) : (
                      <>
                        {trainer.section} · pool <span className="mono">{trainer.pool_id}</span> ·{" "}
                        <span className="mono">{trainer.pool_size}</span> sets
                      </>
                    )}
                  </div>
                </div>

                <div className="topControls">
                  <div className="togglesRow">
                    <label className="toggle" title="Show / hide discarded sets">
                      <input
                        type="checkbox"
                        checked={showDiscarded}
                        onChange={(e) => setShowDiscarded(e.target.checked)}
                      />
                      <span>Show discarded</span>
                    </label>

                    <label className="toggle" title="Show / hide stats inside pool tiles">
                      <input
                        type="checkbox"
                        checked={showStatsInPool}
                        onChange={(e) => setShowStatsInPool(e.target.checked)}
                      />
                      <span>Show stats in pool</span>
                    </label>
                  </div>

                  <div className="counts muted">
                    shown <span className="mono">{shownCount}</span> · confirmed{" "}
                    <span className="mono">{confirmedCount}</span> · discarded{" "}
                    <span className="mono">{discardedCount}</span> · total{" "}
                    <span className="mono">{total}</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panelTitle">
                <div className="h2">Seen ({confirmed.length}/4)</div>
                <div className="muted">Confirm sets to fill slots 1–4</div>
              </div>

              <div className="seenGrid">
                {confirmedSets.map((s, idx) => (
                  <SeenSlot key={idx} set={s} index={idx} onRemove={removeConfirmed} />
                ))}
              </div>

              <div className="muted" style={{ marginTop: 10 }}>
                Tip: confirming a set auto-discards other variants of the same species, and also
                applies Item Clause (same item can’t appear twice).
              </div>
            </section>

            <section className="panel">
              <div className="panelTitle">
                <div className="h2">Pool</div>
                <div className="muted">Use ✕ to discard and ✓ to confirm.</div>
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

      <footer className="footer muted">
        Pool sorted by Pokédex, then global_id. Confirming auto-discards other variants of the same
        species + Item Clause.
      </footer>
    </div>
  );
}
