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
          <div className="statOverflow" style={{ width: `${overflowPct}%` }} title={`Overflow +${v - max}`} />
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

function formatBPAcc(moveEntry) {
  // Status or unknown -> dashes
  if (!moveEntry) return "— / —";
  if (moveEntry.damage_class === "status") return "— / —";
  const bp = typeof moveEntry.power === "number" ? String(moveEntry.power) : "—";
  const acc = typeof moveEntry.accuracy === "number" ? String(moveEntry.accuracy) : "—";
  return `${bp} / ${acc}`;
}

/**
 * Subtitle below trainer title:
 * - Keep big title in Spanish (trainer.display_name)
 * - Here: show EN + other languages (de/fr/it/ja/ko) if available via trainer.names
 * - No "section" (removes "Super Set 5")
 */
function TrainerNamesLine({ trainer }) {
  if (!trainer) return null;
  const names = trainer?.names && typeof trainer.names === "object" ? trainer.names : null;
  const order = ["en", "de", "fr", "it", "ja", "ko"];
  const parts = [];

  if (names) {
    for (const lang of order) {
      const val = names?.[lang];
      if (typeof val === "string" && val.trim()) parts.push({ lang, val: val.trim() });
    }
  }

  // Fallback: at least show English if we can
  if (parts.length === 0) {
    const en = (trainer?.name_en ?? "").trim();
    if (en) parts.push({ lang: "en", val: en });
  }

  if (parts.length === 0) return null;

  return (
    <div className="trainerNamesLine muted">
      {parts.map((p, idx) => (
        <span key={`${p.lang}-${p.val}`} className="trainerNamePart">
          <span className="langTag mono">{p.lang.toUpperCase()}</span>
          <span className="mono trainerNameVal">{p.val}</span>
          {idx < parts.length - 1 ? <span className="sep">·</span> : null}
        </span>
      ))}
    </div>
  );
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

        {/* Optional stats in pool */}
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

/* ---------------- My Team (Gen5) ---------------- */

const EV_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
const EV_LABEL = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };

function clampInt(n, lo, hi) {
  const x = Number.isFinite(n) ? n : 0;
  return Math.max(lo, Math.min(hi, Math.trunc(x)));
}

function evTotal(evs) {
  return EV_KEYS.reduce((acc, k) => acc + (typeof evs?.[k] === "number" ? evs[k] : 0), 0);
}

function normalizeMoveText(s) {
  return (s ?? "").toString();
}

function MyTeamSlotEmpty({ index, query, setQuery, suggestions, onPick, onClear }) {
  return (
    <div className="mySlot mySlotEmpty">
      <div className="mySlotTop">
        <div className="teamSlotIndex mono">#{index + 1}</div>
        <div className="muted" style={{ fontWeight: 800 }}>
          Pick a Pokémon
        </div>
        {query ? (
          <button className="slotClearBtn" onClick={onClear} title="Clear">
            Clear ✕
          </button>
        ) : null}
      </div>

      <div className="searchBox" style={{ marginTop: 8 }}>
        <input
          className="slotSearchInput"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Type a Pokémon (Gen 1–5) e.g. "Gyarados", "Hydreigon"...'
        />
        {suggestions.length > 0 ? (
          <div className="dropdown">
            {suggestions.map((s) => (
              <button key={s.dex} className="dropdownItem" onClick={() => onPick(s.dex)}>
                <div className="dropdownName">{s.name_en}</div>
                <div className="dropdownMeta muted">
                  <span className="mono">#{s.dex}</span>
                  {Array.isArray(s.types) && s.types.length ? (
                    <>
                      {" "}
                      ·{" "}
                      <span className="mono">
                        {s.types.map((t) => t.toUpperCase()).join("/")}
                      </span>
                    </>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="muted slotHint">This is your team. It won’t affect the enemy tab.</div>
    </div>
  );
}

function MyTeamSlotFilled({ index, mon, onRemove, onUpdate }) {
  const name = mon?.name_en ?? mon?.slug ?? `#${mon?.dex ?? "?"}`;
  const types = Array.isArray(mon?.types) ? mon.types : [];
  const abilities = Array.isArray(mon?.abilities) ? mon.abilities : [];

  const evs = mon?.evs ?? {};
  const total = evTotal(evs);
  const totalPct = Math.round((Math.min(510, total) / 510) * 100);

  function setEv(key, valueRaw) {
    const current = { ...(mon.evs ?? {}) };
    const nextVal = clampInt(parseInt(valueRaw, 10), 0, 252);

    current[key] = nextVal;

    // cap total 510 by reducing the changed stat if needed
    let t = evTotal(current);
    if (t > 510) {
      const overflow = t - 510;
      current[key] = Math.max(0, current[key] - overflow);
      t = evTotal(current);
    }

    onUpdate({
      ...mon,
      evs: current,
    });
  }

  return (
    <div className="mySlot">
      <div className="seenSlotHeader">
        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
          <div className="teamSlotIndex mono">#{index + 1}</div>
          <Sprite url={mon?.sprite_url} alt={name} />
          <div style={{ minWidth: 0 }}>
            <div className="h2" style={{ margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {name}
            </div>
            <div className="muted" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="mono">#{mon?.dex}</span>
              {types.map((t) => (
                <TypeBadge key={t} type={t} />
              ))}
            </div>
          </div>
        </div>

        <button className="chip chipDanger" onClick={onRemove} title="Remove from My Team">
          Remove ✕
        </button>
      </div>

      <div className="mySlotBody">
        <div className="miniBox">
          <div className="h3">Set</div>

          <div className="myFormGrid">
            <label className="myField">
              <div className="muted myLabel">Ability</div>
              <select
                className="mySelect"
                value={mon?.ability ?? ""}
                onChange={(e) => onUpdate({ ...mon, ability: e.target.value })}
              >
                <option value="">(choose)</option>
                {abilities.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                    {a.is_hidden ? " (hidden)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="myField">
              <div className="muted myLabel">Item</div>
              <input
                className="myInput"
                value={mon?.item ?? ""}
                onChange={(e) => onUpdate({ ...mon, item: e.target.value })}
                placeholder='e.g. "Choice Scarf"'
              />
            </label>
          </div>

          <div style={{ marginTop: 10 }}>
            <div className="muted myLabel">Moves (free text)</div>
            <div className="myMovesGrid">
              {[0, 1, 2, 3].map((i) => (
                <input
                  key={i}
                  className="myInput"
                  value={mon?.moves?.[i] ?? ""}
                  onChange={(e) => {
                    const next = Array.isArray(mon.moves) ? [...mon.moves] : ["", "", "", ""];
                    next[i] = normalizeMoveText(e.target.value);
                    onUpdate({ ...mon, moves: next });
                  }}
                  placeholder={`Move ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="miniBox">
          <div className="h3">Base stats + EVs</div>

          <div className="evHeaderRow">
            <div className="muted mono">EV total</div>
            <div className="mono">{Math.min(510, total)} / 510</div>
          </div>
          <div className="evBarTrack" title="EV total (max 510)">
            <div className="evBarFill" style={{ width: `${totalPct}%` }} />
          </div>

          <div className="evGrid">
            {EV_KEYS.map((k) => (
              <div key={k} className="evRow">
                <div className="mono evKey">{EV_LABEL[k]}</div>
                <div className="muted mono evBase">{mon?.base_stats?.[k] ?? "-"}</div>
                <input
                  className="evInput mono"
                  type="number"
                  min={0}
                  max={252}
                  step={4}
                  value={typeof evs?.[k] === "number" ? evs[k] : 0}
                  onChange={(e) => setEv(k, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="muted" style={{ marginTop: 8, fontSize: "0.86rem" }}>
            EVs are capped at 510 automatically. (We’ll refine UI later.)
          </div>
        </div>
      </div>
    </div>
  );
}

function MyTeamTab({ myTeam, setMyTeam }) {
  const [slotQueries, setSlotQueries] = useState(["", "", "", ""]);
  const [slotSuggestions, setSlotSuggestions] = useState([[], [], [], []]);

  // debounced per slot
  const debounced = [
    useDebouncedValue(slotQueries[0], 120),
    useDebouncedValue(slotQueries[1], 120),
    useDebouncedValue(slotQueries[2], 120),
    useDebouncedValue(slotQueries[3], 120),
  ];

  useEffect(() => {
    let cancelled = false;

    async function runSlot(i) {
      const q = (debounced[i] ?? "").trim();
      if (!q) {
        if (!cancelled) {
          setSlotSuggestions((prev) => {
            const next = [...prev];
            next[i] = [];
            return next;
          });
        }
        return;
      }

      try {
        const res = await fetch(`/pokedex/gen5/search?q=${encodeURIComponent(q)}&limit=12`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setSlotSuggestions((prev) => {
            const next = [...prev];
            next[i] = Array.isArray(data) ? data : [];
            return next;
          });
        }
      } catch {
        if (!cancelled) {
          setSlotSuggestions((prev) => {
            const next = [...prev];
            next[i] = [];
            return next;
          });
        }
      }
    }

    for (let i = 0; i < 4; i++) runSlot(i);

    return () => {
      cancelled = true;
    };
  }, [debounced[0], debounced[1], debounced[2], debounced[3]]);

  async function pickPokemon(slotIndex, dex) {
    try {
      const res = await fetch(`/pokedex/gen5/${dex}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const entry = await res.json();

      const mon = {
        dex: entry.dex,
        slug: entry.slug,
        name_en: entry.name_en,
        name_es: entry.name_es,
        types: entry.types ?? [],
        abilities: entry.abilities ?? [],
        base_stats: entry.base_stats ?? {},
        sprite_url: entry.sprite_url ?? null,
        ability: "",
        item: "",
        moves: ["", "", "", ""],
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      };

      setMyTeam((prev) => {
        const next = [...prev];
        next[slotIndex] = mon;
        return next;
      });

      setSlotQueries((prev) => {
        const next = [...prev];
        next[slotIndex] = "";
        return next;
      });

      setSlotSuggestions((prev) => {
        const next = [...prev];
        next[slotIndex] = [];
        return next;
      });
    } catch {
      alert("Could not load pokedex entry.");
    }
  }

  function removePokemon(slotIndex) {
    setMyTeam((prev) => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
  }

  function updatePokemon(slotIndex, mon) {
    setMyTeam((prev) => {
      const next = [...prev];
      next[slotIndex] = mon;
      return next;
    });
  }

  return (
    <div className="layoutNew">
      <section className="panel">
        <div className="panelTitle">
          <div className="h2">My Team</div>
          <div className="muted">Build your own 4-Pokémon team (Gen 5 format)</div>
        </div>

        <div className="myTeamGrid">
          {myTeam.map((mon, idx) =>
            mon ? (
              <MyTeamSlotFilled
                key={idx}
                index={idx}
                mon={mon}
                onRemove={() => removePokemon(idx)}
                onUpdate={(m) => updatePokemon(idx, m)}
              />
            ) : (
              <MyTeamSlotEmpty
                key={idx}
                index={idx}
                query={slotQueries[idx]}
                setQuery={(v) =>
                  setSlotQueries((prev) => {
                    const next = [...prev];
                    next[idx] = v;
                    return next;
                  })
                }
                suggestions={slotSuggestions[idx]}
                onPick={(dex) => pickPokemon(idx, dex)}
                onClear={() =>
                  setSlotQueries((prev) => {
                    const next = [...prev];
                    next[idx] = "";
                    return next;
                  })
                }
              />
            )
          )}
        </div>
      </section>
    </div>
  );
}

/* ---------------- Enemy Trainer tab (tu app actual) ---------------- */

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
            <div
              className="h2"
              style={{ margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {display}
            </div>
            <div className="muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              <span className="mono">#{set.global_id}</span> · Dex <span className="mono">{set.dex_number ?? "?"}</span> ·{" "}
              <span className="mono">{set.nature}</span>
            </div>

            {/* Item in seen Pokémon */}
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

function EnemyTrainerTab(props) {
  const {
    q,
    setQ,
    debouncedQ,
    suggestions,
    setSuggestions,
    isSearching,
    setIsSearching,
    trainer,
    setTrainer,
    confirmed,
    setConfirmed,
    discarded,
    setDiscarded,
    showDiscarded,
    setShowDiscarded,
    showStatsInPool,
    setShowStatsInPool,
    pokemonFilter,
    setPokemonFilter,
    debouncedPokemonFilter,
    moveDex,
    poolSets,
    setById,
    poolSortedDex,
    visiblePoolBase,
    visiblePool,
    confirmedSets,
    loadTrainer,
    resetAll,
    toggleDiscard,
    confirmSet,
    removeConfirmed,
  } = props;

  const trainerTitle = trainer?.display_name ?? trainer?.name_en ?? "";
  const total = poolSets.length;
  const confirmedCount = confirmed.length;
  const discardedCount = discarded.size;
  const shownCount = visiblePool.length;

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

export default function App() {
  // Tabs
  const [activeTab, setActiveTab] = useState("enemy"); // "enemy" | "myteam"

  // My Team state (persist across tab switches)
  const [myTeam, setMyTeam] = useState([null, null, null, null]);

  // Enemy Trainer state (tu app actual)
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 150);
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [trainer, setTrainer] = useState(null);

  const [confirmed, setConfirmed] = useState([]);
  const [discarded, setDiscarded] = useState(() => new Set());
  const [showDiscarded, setShowDiscarded] = useState(false);

  // toggle stats in pool
  const [showStatsInPool, setShowStatsInPool] = useState(false);

  // Pokémon filter (from empty slots)
  const [pokemonFilter, setPokemonFilter] = useState("");
  const debouncedPokemonFilter = useDebouncedValue(pokemonFilter, 80);

  // move dex
  const [moveDex, setMoveDex] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function tryFetch(url) {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }

    async function loadMoveDex() {
      try {
        const data = await tryFetch("/moves/cache");
        const moves = data?.moves && typeof data.moves === "object" ? data.moves : null;
        if (moves && !cancelled) {
          setMoveDex(moves);
          return;
        }
        console.warn("moves/cache returned no 'moves' object.");
        if (!cancelled) setMoveDex({});
      } catch (e) {
        console.warn("Could not load move dex from backend /moves/cache", e);
        if (!cancelled) setMoveDex({});
      }
    }

    loadMoveDex();
    return () => {
      cancelled = true;
    };
  }, []);

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
  const visiblePoolBase = useMemo(() => {
    const confirmedSet = new Set(confirmed);
    return poolSortedDex.filter((s) => {
      if (confirmedSet.has(s.global_id)) return false;
      const isDisc = discarded.has(s.global_id);
      if (isDisc && !showDiscarded) return false;
      return true;
    });
  }, [poolSortedDex, confirmed, discarded, showDiscarded]);

  // apply Pokémon filter on top of the normal view
  const visiblePool = useMemo(() => {
    const nq = debouncedPokemonFilter.trim().toLowerCase();
    if (!nq) return visiblePoolBase;

    return visiblePoolBase.filter((s) => {
      const display = setDisplayName(s).toLowerCase();
      const species = (s.species ?? "").toLowerCase();
      return display.includes(nq) || species.includes(nq);
    });
  }, [visiblePoolBase, debouncedPokemonFilter]);

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
    setPokemonFilter("");

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
    setPokemonFilter("");
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

    // reset the pool filter after confirming
    setPokemonFilter("");
    setConfirmed((prev) => [...prev, set.global_id]);

    // Auto-discard rules:
    //  - same species, other variants
    //  - item clause: same item cannot appear twice in the opponent team
    setDiscarded((prev) => {
      const next = new Set(prev);
      const confirmedSpecies = set.species;
      const confirmedItem = (set.item ?? "").trim();

      for (const s of poolSets) {
        if (s.global_id === set.global_id) continue;

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

  return (
    <div className="page">
      <header className={`header ${trainer && activeTab === "enemy" ? "headerWithTrainer" : ""}`}>
        <div className="brand">
          <div className="brandTitle">Battle Subway Helper (B2/W2)</div>
          <div className="muted">
            By{" "}
            <a href="https://github.com/diegodzv" target="_blank" rel="noopener noreferrer" className="authorLink">
              @diegodzv
            </a>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabsBar" role="tablist" aria-label="App tabs">
          <button
            className={`tabBtn ${activeTab === "myteam" ? "tabBtnActive" : ""}`}
            onClick={() => setActiveTab("myteam")}
            role="tab"
            aria-selected={activeTab === "myteam"}
          >
            My Team
          </button>
          <button
            className={`tabBtn ${activeTab === "enemy" ? "tabBtnActive" : ""}`}
            onClick={() => setActiveTab("enemy")}
            role="tab"
            aria-selected={activeTab === "enemy"}
          >
            Enemy Trainer
          </button>
        </div>

        {/* Right area */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
          <button className="ghostBtn" onClick={resetAll} title="Reset enemy trainer state">
            Reset Enemy
          </button>
        </div>

        {/* Enemy header extra row */}
        {activeTab === "enemy" ? (
          <>
            <div className="searchBox" style={{ gridColumn: "1 / -1" }}>
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

            {trainer ? (
              <div className="trainerBar">
                <div className="trainerBarLeft">
                  <div className="h1">{trainerTitle}</div>
                  <TrainerNamesLine trainer={trainer} />
                </div>

                <div className="trainerBarRight">
                  <div className="togglesRow">
                    <label className="toggle" title="Show / hide discarded sets">
                      <input type="checkbox" checked={showDiscarded} onChange={(e) => setShowDiscarded(e.target.checked)} />
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
                    shown <span className="mono">{visiblePool.length}</span> · confirmed{" "}
                    <span className="mono">{confirmed.length}</span> · discarded{" "}
                    <span className="mono">{discarded.size}</span> · total <span className="mono">{poolSets.length}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </header>

      {activeTab === "myteam" ? (
        <main className="content">
          <MyTeamTab myTeam={myTeam} setMyTeam={setMyTeam} />
        </main>
      ) : (
        <EnemyTrainerTab
          q={q}
          setQ={setQ}
          debouncedQ={debouncedQ}
          suggestions={suggestions}
          setSuggestions={setSuggestions}
          isSearching={isSearching}
          setIsSearching={setIsSearching}
          trainer={trainer}
          setTrainer={setTrainer}
          confirmed={confirmed}
          setConfirmed={setConfirmed}
          discarded={discarded}
          setDiscarded={setDiscarded}
          showDiscarded={showDiscarded}
          setShowDiscarded={setShowDiscarded}
          showStatsInPool={showStatsInPool}
          setShowStatsInPool={setShowStatsInPool}
          pokemonFilter={pokemonFilter}
          setPokemonFilter={setPokemonFilter}
          debouncedPokemonFilter={debouncedPokemonFilter}
          moveDex={moveDex}
          poolSets={poolSets}
          setById={setById}
          poolSortedDex={poolSortedDex}
          visiblePoolBase={visiblePoolBase}
          visiblePool={visiblePool}
          confirmedSets={confirmedSets}
          loadTrainer={loadTrainer}
          resetAll={resetAll}
          toggleDiscard={toggleDiscard}
          confirmSet={confirmSet}
          removeConfirmed={removeConfirmed}
        />
      )}
    </div>
  );
}
