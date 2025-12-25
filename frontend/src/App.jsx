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
  if (!url) return <span className="itemIconFallback" title="Sin icono">◻</span>;
  return <img className="itemIcon" src={url} alt={alt} loading="lazy" />;
}

function TypeBadge({ type }) {
  if (!type) return <span className="typeBadge type-unknown">???</span>;
  return <span className={`typeBadge type-${type}`}>{type.toUpperCase()}</span>;
}

function StatBar({ label, value, max = 250 }) {
  // value en Lv50 suele estar 50..200 aprox (HP puede subir más).
  const v = typeof value === "number" ? value : 0;
  const pct = Math.max(0, Math.min(100, Math.round((v / max) * 100)));

  // Color por “tier” (no depende de tipo)
  let tier = "low";
  if (v >= 170) tier = "high";
  else if (v >= 120) tier = "mid";

  return (
    <div className="statBarRow">
      <div className="statBarTop">
        <span className="muted">{label}</span>
        <span className="mono">{typeof value === "number" ? value : "-"}</span>
      </div>
      <div className="statBarTrack">
        <div
          className={`statBarFill statBar-${tier}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SetCard({ set, onClick, selected, tag, tone = "default" }) {
  const spe = set?.stats_lv50?.Spe ?? "-";
  return (
    <button
      className={`card ${selected ? "cardSelected" : ""} ${
        tone === "seen" ? "cardSeen" : ""
      }`}
      onClick={onClick}
      title={`${set.species} (#${set.global_id})`}
    >
      <div className="cardTop">
        <Sprite url={set.sprite_url_pokeapi} alt={set.species} />
        <div className="cardTitle">
          <div className="name">{set.species}</div>
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
        <div className="muted">Hueco vacío</div>
      </div>
    );
  }

  const movesMeta = Array.isArray(set.moves_meta) ? set.moves_meta : null;
  const movesFallback = Array.isArray(set.moves) ? set.moves : [];

  return (
    <div className="teamPanel">
      <div className="teamHeader">
        <div className="teamHeaderLeft">
          <div className="teamSlotIndex mono">#{index + 1}</div>
          <Sprite url={set.sprite_url_pokeapi} alt={set.species} />
          <div>
            <div className="h2">{set.species}</div>
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
          title="Quitar de vistos"
        >
          Quitar ✕
        </button>
      </div>

      <div className="box">
        <div className="h3">Stats (Lv 50)</div>
        <div className="statBars">
          <StatBar label="HP" value={set.stats_lv50?.HP} max={260} />
          <StatBar label="Atk" value={set.stats_lv50?.Atk} max={220} />
          <StatBar label="Def" value={set.stats_lv50?.Def} max={220} />
          <StatBar label="SpA" value={set.stats_lv50?.SpA} max={220} />
          <StatBar label="SpD" value={set.stats_lv50?.SpD} max={220} />
          <StatBar label="Spe" value={set.stats_lv50?.Spe} max={220} />
        </div>
      </div>

      <div className="box">
        <div className="h3">Movimientos</div>
        <ul className="moves">
          {movesMeta
            ? movesMeta.map((m) => (
                <li key={m.slug ?? m.name} className="moveRow">
                  <TypeBadge type={m.type} />
                  <span className="mono">{m.name}</span>
                </li>
              ))
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
      alert("No pude cargar el entrenador.");
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

  // ✅ Pool ordenado por pokédex, luego global_id
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

  // 4 slots (vistos en orden)
  const teamSets = useMemo(() => {
    const byId = new Map(poolSets.map((s) => [s.global_id, s]));
    const slots = [null, null, null, null];
    for (let i = 0; i < Math.min(4, seen.length); i++) {
      slots[i] = byId.get(seen[i]) ?? null;
    }
    return slots;
  }, [poolSets, seen]);

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <div className="brandTitle">Metro Batalla (B2/W2)</div>
          <div className="muted">Set 4/5 · selector + filtro 4v4</div>
        </div>

        <div className="searchBox">
          <input
            className="searchInput"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Busca entrenador (ej: "battle girl", "scientist")...'
          />
          {isSearching ? <div className="spinner" title="Buscando..." /> : null}

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
                  <div className="dropdownName">{s.name_en}</div>
                  <div className="dropdownMeta muted">{s.section}</div>
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
            <div className="emptyTitle">Selecciona un entrenador</div>
            <div className="muted">
              Escribe arriba para autocompletar y elige uno. Luego marca Pokémon
              según te los enseñe.
            </div>
          </div>
        ) : (
          <div className="grid gridTwoCols">
            <section className="panel">
              <div className="panelTitle">
                <div>
                  <div className="h1">{trainer.name_en}</div>
                  <div className="muted">
                    {trainer.section} · pool{" "}
                    <span className="mono">{trainer.pool_id}</span> ·{" "}
                    <span className="mono">{trainer.pool_size}</span> sets
                  </div>
                </div>
              </div>

              <div className="subTitle">Pool (por Pokédex)</div>
              <div className="cards poolOneCol">
                {poolSortedDex.map((s) => (
                  <SetCard
                    key={s.global_id}
                    set={s}
                    selected={selectedSet?.global_id === s.global_id}
                    tag={seenSet.has(s.global_id) ? "Visto" : ""}
                    tone={seenSet.has(s.global_id) ? "seen" : "default"}
                    onClick={() => setSelectedSet(s)}
                  />
                ))}
              </div>
            </section>

            <aside className="side">
              <section className="panel">
                <div className="panelTitle">
                  <div className="h2">Vistos ({seen.length}/4)</div>
                  {isFiltering ? <div className="muted">calculando…</div> : null}
                </div>

                {seen.length === 0 ? (
                  <div className="muted">
                    Marca los Pokémon que vaya sacando el rival.
                  </div>
                ) : (
                  <div className="seenChips">
                    {seen.map((gid) => (
                      <button
                        key={gid}
                        className="chip"
                        onClick={() => unmarkSeen(gid)}
                        title="Quitar"
                      >
                        <span className="mono">#{gid}</span> ✕
                      </button>
                    ))}
                  </div>
                )}

                <div className="box">
                  <div className="statRow">
                    <span className="muted">Equipos posibles</span>
                    <span className="mono">
                      {filterInfo?.num_possible_teams ?? "-"}
                    </span>
                  </div>
                  <div className="statRow">
                    <span className="muted">Restantes posibles</span>
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
                    onClick={() =>
                      selectedSet && markSeen(selectedSet.global_id)
                    }
                    disabled={
                      !selectedSet ||
                      seenSet.has(selectedSet.global_id) ||
                      seen.length >= 4
                    }
                    title={
                      !selectedSet
                        ? "Selecciona uno en el pool"
                        : seenSet.has(selectedSet.global_id)
                        ? "Ya está visto"
                        : seen.length >= 4
                        ? "Ya tienes 4 vistos"
                        : "Marcar seleccionado como visto"
                    }
                  >
                    Marcar seleccionado como visto
                  </button>
                </div>
              </section>

              <section className="panel">
                <div className="panelTitle">
                  <div className="h2">Equipo detectado</div>
                  <div className="muted">1–4 (izquierda → derecha)</div>
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
                  <div className="h2">Posibles restantes</div>
                </div>

                {!filterInfo ? (
                  <div className="muted">Selecciona un entrenador para empezar.</div>
                ) : remainingSets.length === 0 && seen.length > 0 ? (
                  <div className="muted">
                    No quedan posibilidades (¿marcaste un ID que no está en el pool?).
                  </div>
                ) : (
                  <div className="cards compact">
                    {remainingSets.map((s) => (
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
        Pool ordenado por Pokédex. Items y tipos de movimientos en modo visual.
      </footer>
    </div>
  );
}
