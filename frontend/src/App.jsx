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
  if (!url) return <span className="itemIconFallback" title="No icon">◻</span>;
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

function StatRow({ label, value, max = 200 }) {
  const v = typeof value === "number" ? value : 0;

  // Base fill is capped at max (200).
  const basePct = Math.round(clamp01(v / max) * 100);

  // Overflow: for v > max, overlay from left with (v-max)/max, capped at 100%.
  // Example: v=220 -> overflowPct=10; v=210 -> 5; v=400 -> 100
  const overflowPct = v > max ? Math.round(clamp01((v - max) / max) * 100) : 0;

  const tierClass = getTierClass(v);

  return (
    <div className="statLine">
      <div className="statLabel muted">{label}</div>

      <div className="statTrackWrap">
        <div className="statBarTrack" aria-label={`${label} ${v}`}>
          <div
            className={`statBarFill ${tierClass}`}
            style={{ width: `${basePct}%` }}
          />
          {overflowPct > 0 ? (
            <div
              className="statOverflow"
              style={{ width: `${overflowPct}%` }}
              title={`Overflow +${v - max}`}
            />
          ) : null}
        </div>
      </div>

      <div className="statValue mono">
        {typeof value === "number" ? value : "-"}
      </div>
    </div>
  );
}

function setDisplayName(set) {
  if (!set) return "";
  const v = typeof set.variant_index === "number" ? set.variant_index : null;
  return v ? `${set.species}-${v}` : set.species;
}

/**
 * Turn a PokeAPI slug into a nice label:
 *  - "high-jump-kick" -> "High Jump Kick"
 *  - "soft-boiled" -> "Soft Boiled"
 *  - "smelling-salts" -> "Smelling Salts"
 */
function prettyMoveNameFromSlug(slug) {
  if (!slug || typeof slug !== "string") return null;
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function SetCard({ set, onClick, selected, tag, tone = "default" }) {
  const spe = set?.stats_lv50?.Spe ?? "-";
  const display = setDisplayName(set);

  return (
    <button
      className={`card ${selected ? "cardSelected" : ""} ${
        tone === "seen" ? "cardSeen" : ""
      }`}
      onClick={onClick}
      title={`${display} (#${set.global_id})`}
    >
      <div className="cardTop">
        <Sprite url={set.sprite_url_pokeapi} alt={display} />
        <div className="cardTitle">
          <div className="name">{display}</div>
          <div className="meta muted">
            <span className="mono">
              #{set.global_id} · Dex {set.dex_number ?? "?"}
            </span>{" "}
            · Spe <span className="mono">{spe}</span>
          </div>
        </div>
      </div>

      {tag ? <div className="tag">{tag}</div> : null}
    </button>
  );
}

function DetailPanel({ set, index, onRemoveSeen }) {
  if (!set) {
    return (
      <div className="teamSlotEmpty">
        <div className="teamSlotIndex mono">#{index + 1}</div>
        <div className="muted">Empty slot</div>
      </div>
    );
  }

  const display = setDisplayName(set);
  const movesMeta = Array.isArray(set.moves_meta) ? set.moves_meta : null;
  const movesFallback = Array.isArray(set.moves) ? set.moves : [];

  return (
    <div className="teamPanel">
      <div className="teamHeader">
        <div className="teamHeaderLeft">
          <div className="teamSlotIndex mono">#{index + 1}</div>
          <Sprite url={set.sprite_url_pokeapi} alt={display} />
          <div>
            <div className="h2">{display}</div>
            <div className="muted">
              <span className="mono">
                #{set.global_id} · Dex {set.dex_number ?? "?"}
              </span>{" "}
              · {set.nature}
            </div>

            <div className="itemLine">
              <ItemIcon url={set.item_sprite_url} alt={set.item} />
              <span className="itemName">{set.item}</span>
            </div>
          </div>
        </div>

        <button
          className="chip chipDanger"
          onClick={() => onRemoveSeen(set.global_id)}
          title="Remove from seen"
        >
          Remove ✕
        </button>
      </div>

      <div className="box">
        <div className="h3">Stats (Lv 50)</div>
        <div className="statTable">
          <StatRow label="HP" value={set.stats_lv50?.HP} max={200} />
          <StatRow label="Atk" value={set.stats_lv50?.Atk} max={200} />
          <StatRow label="Def" value={set.stats_lv50?.Def} max={200} />
          <StatRow label="SpA" value={set.stats_lv50?.SpA} max={200} />
          <StatRow label="SpD" value={set.stats_lv50?.SpD} max={200} />
          <StatRow label="Spe" value={set.stats_lv50?.Spe} max={200} />
        </div>
      </div>

      <div className="box">
        <div className="h3">Moves</div>
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
            : movesFallback.map((m) => (
                <li key={m} className="moveRow">
                  <TypeBadge type={null} />
                  <span className="mono">{m}</span>
                </li>
              ))}
        </ul>
      </div>

      <div className="box">
        <div className="h3">EVs</div>
        <div className="mono">{set.evs}</div>
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
  const [selectedSet, setSelectedSet] = useState(null);

  const [seen, setSeen] = useState([]);
  const [filterInfo, setFilterInfo] = useState(null);
  const [isFiltering, setIsFiltering] = useState(false);

  const poolId = trainer?.pool_id ?? null;

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
        const res = await fetch(
          `/trainers/search?q=${encodeURIComponent(nq)}&limit=20`
        );
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
    setSelectedSet(null);
    setSeen([]);
    setFilterInfo(null);

    const res = await fetch(`/trainers/${trainerId}`);
    if (!res.ok) {
      alert("Could not load trainer.");
      return;
    }
    const data = await res.json();
    setTrainer(data);
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!poolId) return;
      setIsFiltering(true);
      try {
        const res = await fetch(`/pools/${poolId}/filter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seen_global_ids: seen }),
        });
        if (!res.ok) throw new Error(`filter failed: ${res.status}`);
        const data = await res.json();
        if (!cancelled) setFilterInfo(data);
      } catch {
        if (!cancelled) setFilterInfo(null);
      } finally {
        if (!cancelled) setIsFiltering(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [poolId, seen]);

  const seenSet = useMemo(() => new Set(seen), [seen]);

  const poolSets = trainer?.sets ?? [];
  const remainingSets = filterInfo?.possible_remaining_sets ?? [];

  // Pool sorted by Pokédex number, then global_id
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

  // Possible remaining sorted exactly like Pool: dex_number, then global_id
  const remainingSortedDex = useMemo(() => {
    const copy = [...remainingSets];
    copy.sort((a, b) => {
      const da = typeof a.dex_number === "number" ? a.dex_number : 999999;
      const db = typeof b.dex_number === "number" ? b.dex_number : 999999;
      if (da !== db) return da - db;
      return (a.global_id ?? 0) - (b.global_id ?? 0);
    });
    return copy;
  }, [remainingSets]);

  function markSeen(globalId) {
    if (seenSet.has(globalId)) return;
    if (seen.length >= 4) return;
    setSeen((prev) => [...prev, globalId]);
  }

  function unmarkSeen(globalId) {
    setSeen((prev) => prev.filter((x) => x !== globalId));
  }

  function resetAll() {
    setTrainer(null);
    setSelectedSet(null);
    setSeen([]);
    setFilterInfo(null);
    setQ("");
    setSuggestions([]);
  }

  // 4 slots (seen order)
  const teamSets = useMemo(() => {
    const byId = new Map(poolSets.map((s) => [s.global_id, s]));
    const slots = [null, null, null, null];
    for (let i = 0; i < Math.min(4, seen.length); i++) {
      slots[i] = byId.get(seen[i]) ?? null;
    }
    return slots;
  }, [poolSets, seen]);

  const trainerTitle = trainer?.display_name ?? trainer?.name_en ?? "";

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <div className="brandTitle">Battle Subway (B2/W2)</div>
          <div className="muted">Super Set 4/5 · selector + 4v4 filter</div>
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
            <div className="muted">
              Type above to autocomplete and pick one. Then mark Pokémon as you see them.
            </div>
          </div>
        ) : (
          <div className="grid gridTwoCols">
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
              </div>

              <div className="subTitle">Pool (by Pokédex)</div>
              <div className="cards poolOneCol">
                {poolSortedDex.map((s) => (
                  <SetCard
                    key={s.global_id}
                    set={s}
                    selected={selectedSet?.global_id === s.global_id}
                    tag={seenSet.has(s.global_id) ? "Seen" : ""}
                    tone={seenSet.has(s.global_id) ? "seen" : "default"}
                    onClick={() => setSelectedSet(s)}
                  />
                ))}
              </div>
            </section>

            <aside className="side">
              <section className="panel">
                <div className="panelTitle">
                  <div className="h2">Seen ({seen.length}/4)</div>
                  {isFiltering ? <div className="muted">calculating…</div> : null}
                </div>

                {seen.length === 0 ? (
                  <div className="muted">
                    Mark the Pokémon as the opponent reveals them.
                  </div>
                ) : (
                  <div className="seenChips">
                    {seen.map((gid) => (
                      <button
                        key={gid}
                        className="chip"
                        onClick={() => unmarkSeen(gid)}
                        title="Remove"
                      >
                        <span className="mono">#{gid}</span> ✕
                      </button>
                    ))}
                  </div>
                )}

                <div className="box">
                  <div className="statRow">
                    <span className="muted">Possible teams</span>
                    <span className="mono">
                      {filterInfo?.num_possible_teams ?? "-"}
                    </span>
                  </div>
                  <div className="statRow">
                    <span className="muted">Possible remaining</span>
                    <span className="mono">
                      {filterInfo
                        ? filterInfo.possible_remaining_global_ids.length
                        : "-"}
                    </span>
                  </div>
                </div>

                <div className="actionsRow">
                  <button
                    className="primaryBtn"
                    onClick={() => selectedSet && markSeen(selectedSet.global_id)}
                    disabled={
                      !selectedSet ||
                      seenSet.has(selectedSet.global_id) ||
                      seen.length >= 4
                    }
                    title={
                      !selectedSet
                        ? "Select a Pokémon from the pool"
                        : seenSet.has(selectedSet.global_id)
                        ? "Already marked as seen"
                        : seen.length >= 4
                        ? "You already have 4 seen"
                        : "Mark selected Pokémon as seen"
                    }
                  >
                    Mark selected as seen
                  </button>
                </div>
              </section>

              <section className="panel">
                <div className="panelTitle">
                  <div className="h2">Detected team</div>
                  <div className="muted">1–4 (left → right)</div>
                </div>

                <div className="teamRow">
                  {teamSets.map((s, idx) => (
                    <DetailPanel
                      key={idx}
                      set={s}
                      index={idx}
                      onRemoveSeen={unmarkSeen}
                    />
                  ))}
                </div>
              </section>

              <section className="panel">
                <div className="panelTitle">
                  <div className="h2">Possible remaining</div>
                </div>

                {!filterInfo ? (
                  <div className="muted">Select a trainer to begin.</div>
                ) : remainingSortedDex.length === 0 && seen.length > 0 ? (
                  <div className="muted">
                    No possibilities left (did you mark an ID that is not in the
                    pool?).
                  </div>
                ) : (
                  <div className="cards compact">
                    {remainingSortedDex.map((s) => (
                      <SetCard
                        key={s.global_id}
                        set={s}
                        selected={selectedSet?.global_id === s.global_id}
                        onClick={() => setSelectedSet(s)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </div>
        )}
      </main>

      <footer className="footer muted">
        Pool sorted by Pokédex. Items and move types shown visually.
      </footer>
    </div>
  );
}
