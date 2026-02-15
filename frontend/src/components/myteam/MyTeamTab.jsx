import { useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { apiGetJson } from "../../api/client";
import { Sprite } from "../common/Sprite";
import { TypeBadge } from "../common/TypeBadge";
import { clamp01, clampInt, findMoveSlugFromText, formatBPAcc, getTierClass } from "../../utils/poke";
import { EV_KEYS, EV_LABEL, NATURES, calcFinalStatsLv50, evTotal } from "./stats";
import { MoveAutocompleteInput } from "./MoveAutocompleteInput";

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

      <div className="searchBox mySearchBox" style={{ marginTop: 8 }}>
        <input
          className="slotSearchInput"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Type a Pokémon (Gen 1–5) e.g. "Gyarados"...'
          autoComplete="off"
        />
        {suggestions.length > 0 ? (
          <div className="dropdown dropdownAbove">
            {suggestions.map((s) => (
              <button key={s.dex} className="dropdownItem" onClick={() => onPick(s.dex)}>
                <div className="dropdownName">{s.name_en}</div>
                <div className="dropdownMeta muted">
                  <span className="mono">#{s.dex}</span>
                  {Array.isArray(s.types) && s.types.length ? (
                    <>
                      {" "}
                      · <span className="mono">{s.types.map((t) => t.toUpperCase()).join("/")}</span>
                    </>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="muted slotHint">This is your team.</div>
    </div>
  );
}

function MyTeamSlotFilled({ index, mon, onRemove, onUpdate, moveDex }) {
  const name = mon?.name_en ?? mon?.slug ?? `#${mon?.dex ?? "?"}`;
  const types = Array.isArray(mon?.types) ? mon.types : [];
  const abilities = Array.isArray(mon?.abilities) ? mon.abilities : [];
  const evs = mon?.evs ?? {};
  const total = evTotal(evs);
  const totalPct = Math.round((Math.min(510, total) / 510) * 100);

  const [statsOpen, setStatsOpen] = useState(true);

  const baseStats = mon?.base_stats ?? {};
  const finalStats = useMemo(
    () =>
      calcFinalStatsLv50(
        baseStats,
        evs,
        mon?.nature ?? "Hardy",
        mon?.ivs ?? { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }
      ),
    [baseStats, evs, mon?.nature, mon?.ivs]
  );

  function setEv(key, valueRaw) {
    const current = { ...(mon.evs ?? {}) };
    const nextVal = clampInt(parseInt(valueRaw, 10), 0, 252);
    current[key] = nextVal;

    let t = evTotal(current);
    if (t > 510) {
      const overflow = t - 510;
      current[key] = Math.max(0, current[key] - overflow);
    }

    onUpdate({ ...mon, evs: current });
  }

  function setIv(key, valueRaw) {
    const current = { ...(mon.ivs ?? { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }) };
    const nextVal = clampInt(parseInt(valueRaw, 10), 0, 31);
    current[key] = nextVal;
    onUpdate({ ...mon, ivs: current });
  }

  const recognizedMoveMeta = (i) => {
    const slug = mon?.move_slugs?.[i] ?? findMoveSlugFromText(mon?.moves?.[i], moveDex);
    if (!slug) return null;
    const entry = moveDex?.[slug] ?? null;
    if (!entry) return null;
    return { slug, entry };
  };

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

      <div className="seenSlotBody">
        <div className="miniBox myControlsBox">
          <div className="myControlsGrid">
            <label className="myField">
              <div className="muted myLabel">Ability</div>
              <select
                className="mySelect myInputSmall"
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
                className="myInput myInputSmall"
                value={mon?.item ?? ""}
                onChange={(e) => onUpdate({ ...mon, item: e.target.value })}
                placeholder='e.g. "Sitrus Berry"'
                autoComplete="off"
              />
            </label>

            <label className="myField">
              <div className="muted myLabel">Nature</div>
              <select
                className="mySelect myInputSmall"
                value={mon?.nature ?? "Hardy"}
                onChange={(e) => onUpdate({ ...mon, nature: e.target.value })}
              >
                {NATURES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="miniBox">
          <div className="movesHeaderRow">
            <div className="h3">Moves</div>
            <div className="muted mono movesHeaderPA">POWER / ACC</div>
          </div>

          <ul className="moves myMovesList">
            {[0, 1, 2, 3].map((i) => {
              const meta = recognizedMoveMeta(i);
              const type = meta?.entry?.type ?? null;
              const bpacc = meta ? formatBPAcc(meta.entry) : "— / —";

              return (
                <li key={i} className="moveRow moveRowSeen myMoveRowEditable">
                  <TypeBadge type={type} />
                  <MoveAutocompleteInput
                    value={mon?.moves?.[i] ?? ""}
                    moveDex={moveDex}
                    placeholder={`Move ${i + 1}`}
                    onChangeText={(txt) => {
                      const nextMoves = Array.isArray(mon.moves) ? [...mon.moves] : ["", "", "", ""];
                      const nextSlugs = Array.isArray(mon.move_slugs) ? [...mon.move_slugs] : [null, null, null, null];
                      nextMoves[i] = txt;
                      nextSlugs[i] = null;
                      onUpdate({ ...mon, moves: nextMoves, move_slugs: nextSlugs });
                    }}
                    onPickSlug={(slug, label) => {
                      const nextMoves = Array.isArray(mon.moves) ? [...mon.moves] : ["", "", "", ""];
                      const nextSlugs = Array.isArray(mon.move_slugs) ? [...mon.move_slugs] : [null, null, null, null];
                      nextMoves[i] = label;
                      nextSlugs[i] = slug;
                      onUpdate({ ...mon, moves: nextMoves, move_slugs: nextSlugs });
                    }}
                  />
                  <span className="mono movePA">{bpacc}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={`miniBox ${statsOpen ? "" : "statsCollapsed"}`}>
          <div className="statsTitleRow">
            <div className="h3">Stats (Lv 50)</div>
            <button
              className="collapseBtn"
              onClick={() => setStatsOpen((v) => !v)}
              aria-expanded={statsOpen}
              title={statsOpen ? "Hide stats" : "Show stats"}
              type="button"
            >
              {statsOpen ? "▾" : "▸"}
            </button>
          </div>

          {statsOpen ? (
            <>
              <div className="evHeaderRow">
                <div className="muted mono">EV total</div>
                <div className="mono">{Math.min(510, total)} / 510</div>
              </div>
              <div className="evBarTrack" title="EV total (max 510)">
                <div className="evBarFill" style={{ width: `${totalPct}%` }} />
              </div>

              <div className="myStatsHeader muted mono">
                <span></span>
                <span>IV</span>
                <span>EV</span>
                <span></span>
                <span>FINAL</span>
              </div>

              <div className="myStatsGrid">
                {EV_KEYS.map((k) => {
                  const v = typeof finalStats?.[k] === "number" ? finalStats[k] : 0;
                  const basePct = Math.round(clamp01(v / 200) * 100);
                  const overflowPct = v > 200 ? Math.round(clamp01((v - 200) / 200) * 100) : 0;
                  const tier = getTierClass(v);

                  return (
                    <div key={k} className="myStatRow">
                      <div className="mono myStatKey">{EV_LABEL[k]}</div>

                      <input
                        className="ivInput mono"
                        type="number"
                        min={0}
                        max={31}
                        step={1}
                        value={typeof mon?.ivs?.[k] === "number" ? mon.ivs[k] : 31}
                        onChange={(e) => setIv(k, e.target.value)}
                      />

                      <input
                        className="evInput mono"
                        type="number"
                        min={0}
                        max={252}
                        step={4}
                        value={typeof evs?.[k] === "number" ? evs[k] : 0}
                        onChange={(e) => setEv(k, e.target.value)}
                      />

                      <div className="statBarTrack" aria-label={`${EV_LABEL[k]} ${v}`}>
                        <div className={`statBarFill ${tier}`} style={{ width: `${basePct}%` }} />
                        {overflowPct > 0 ? (
                          <div className="statOverflow" style={{ width: `${overflowPct}%` }} title={`Overflow +${v - 200}`} />
                        ) : null}
                      </div>

                      <div className="mono myStatFinal">{finalStats?.[k] ?? "-"}</div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function MyTeamTab({ myTeam, setMyTeam, moveDex }) {
  const [slotQueries, setSlotQueries] = useState(["", "", "", ""]);
  const [slotSuggestions, setSlotSuggestions] = useState([[], [], [], []]);

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
        const data = await apiGetJson(`/pokedex/gen5/search?q=${encodeURIComponent(q)}&limit=12`);
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
      const entry = await apiGetJson(`/pokedex/gen5/${dex}`);

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
        nature: "Hardy",

        moves: ["", "", "", ""],
        move_slugs: [null, null, null, null],

        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
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
                moveDex={moveDex}
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
