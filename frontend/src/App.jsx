import { useEffect, useMemo, useRef, useState } from "react";
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
  return "stat-gDark";
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function StatRow({ label, value, max = 200, compact = false, boosted = false }) {
  const v = typeof value === "number" ? value : 0;

  const basePct = Math.round(clamp01(v / max) * 100);
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
  if (!moveEntry) return "— / —";
  if (moveEntry.damage_class === "status") return "— / —";
  const bp = typeof moveEntry.power === "number" ? String(moveEntry.power) : "—";
  const acc = typeof moveEntry.accuracy === "number" ? String(moveEntry.accuracy) : "—";
  return `${bp} / ${acc}`;
}

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

const NATURES = [
  "Hardy","Lonely","Brave","Adamant","Naughty",
  "Bold","Docile","Relaxed","Impish","Lax",
  "Timid","Hasty","Serious","Jolly","Naive",
  "Modest","Mild","Quiet","Bashful","Rash",
  "Calm","Gentle","Sassy","Careful","Quirky",
];

// nature multipliers for non-HP stats
const NATURE_MODS = {
  Hardy:  { up: null, down: null },
  Docile: { up: null, down: null },
  Serious:{ up: null, down: null },
  Bashful:{ up: null, down: null },
  Quirky: { up: null, down: null },

  Lonely: { up: "atk", down: "def" },
  Brave:  { up: "atk", down: "spe" },
  Adamant:{ up: "atk", down: "spa" },
  Naughty:{ up: "atk", down: "spd" },

  Bold:   { up: "def", down: "atk" },
  Relaxed:{ up: "def", down: "spe" },
  Impish: { up: "def", down: "spa" },
  Lax:    { up: "def", down: "spd" },

  Timid:  { up: "spe", down: "atk" },
  Hasty:  { up: "spe", down: "def" },
  Jolly:  { up: "spe", down: "spa" },
  Naive:  { up: "spe", down: "spd" },

  Modest: { up: "spa", down: "atk" },
  Mild:   { up: "spa", down: "def" },
  Quiet:  { up: "spa", down: "spe" },
  Rash:   { up: "spa", down: "spd" },

  Calm:   { up: "spd", down: "atk" },
  Gentle: { up: "spd", down: "def" },
  Sassy:  { up: "spd", down: "spe" },
  Careful:{ up: "spd", down: "spa" },
};

function clampInt(n, lo, hi) {
  const x = Number.isFinite(n) ? n : 0;
  return Math.max(lo, Math.min(hi, Math.trunc(x)));
}

function evTotal(evs) {
  return EV_KEYS.reduce((acc, k) => acc + (typeof evs?.[k] === "number" ? evs[k] : 0), 0);
}

function normalizeKey(s) {
  return (s ?? "").toString().trim().toLowerCase();
}

function findMoveSlugFromText(text, moveDex) {
  if (!moveDex || typeof moveDex !== "object") return null;
  const t = normalizeKey(text);
  if (!t) return null;

  if (Object.prototype.hasOwnProperty.call(moveDex, t)) return t;

  const hy = t.replace(/\s+/g, "-");
  if (Object.prototype.hasOwnProperty.call(moveDex, hy)) return hy;

  for (const slug of Object.keys(moveDex)) {
    const pn = prettyMoveNameFromSlug(slug);
    if (pn && normalizeKey(pn) === t) return slug;
  }
  return null;
}

function natureMultiplier(nature, statKey) {
  const n = (nature ?? "").trim();
  const cfg = NATURE_MODS[n] ?? { up: null, down: null };
  if (!cfg.up || !cfg.down) return 1.0;
  if (statKey === cfg.up) return 1.1;
  if (statKey === cfg.down) return 0.9;
  return 1.0;
}

function calcFinalStatsLv50(
  baseStats,
  evs,
  nature,
  ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }
) {
  const level = 50;
  const out = {};

  const base = baseStats ?? {};
  const E = evs ?? {};
  const I = ivs ?? {};

  {
    const b = Number(base.hp ?? 0);
    const ev = Number(E.hp ?? 0);
    const iv = Number(I.hp ?? 31);
    const v = Math.floor(((2 * b + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
    out.hp = v;
  }

  for (const k of ["atk", "def", "spa", "spd", "spe"]) {
    const b = Number(base[k] ?? 0);
    const ev = Number(E[k] ?? 0);
    const iv = Number(I[k] ?? 31);

    const pre = Math.floor(((2 * b + iv + Math.floor(ev / 4)) * level) / 100) + 5;
    const mult = natureMultiplier(nature, k);
    out[k] = Math.floor(pre * mult);
  }

  return out;
}

function MoveAutocompleteInput({ value, onChangeText, onPickSlug, moveDex, placeholder }) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounced = useDebouncedValue(value, 80);
  const boxRef = useRef(null);

  const suggestions = useMemo(() => {
    if (!moveDex || typeof moveDex !== "object") return [];
    const qRaw = normalizeKey(debounced);
    if (!qRaw) return [];

    const q = qRaw.replace(/\s+/g, " ").trim();     // keep spaces
    const qHy = q.replace(/\s+/g, "-");            // also try hyphen
    const out = [];

    const keys = Object.keys(moveDex);
    for (const slug of keys) {
      const pretty = normalizeKey(prettyMoveNameFromSlug(slug)); // "dragon pulse"
      const slugNorm = normalizeKey(slug);                       // "dragon-pulse"

      const hit =
        slugNorm.includes(q) ||
        slugNorm.includes(qHy) ||
        pretty.includes(q);

      if (hit) out.push(slug);
      if (out.length >= 12) break;
    }
    return out;
  }, [debounced, moveDex]);

  useEffect(() => {
    function onDocClick(e) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const show = (focused || open) && suggestions.length > 0;

  return (
    <div className="miniAutocomplete" ref={boxRef}>
      <input
        className="myInput myInputSmall myMoveNameInput"
        value={value}
        onChange={(e) => {
          onChangeText(e.target.value);
          setOpen(true);
        }}
        placeholder={placeholder}
        onFocus={() => {
          setFocused(true);
          setOpen(true);
        }}
        onBlur={() => setFocused(false)}
        autoComplete="off"
      />

      {show ? (
        <div className="dropdown dropdownAbove moveDropdown">
          {suggestions.map((slug) => {
            const entry = moveDex?.[slug] ?? null;
            const label = prettyMoveNameFromSlug(slug) ?? slug;
            const type = entry?.type ?? null;
            const bpacc = formatBPAcc(entry);

            return (
              <button
                key={slug}
                className="dropdownItem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPickSlug(slug, label);
                  setOpen(false);
                }}
                title={slug}
              >
                <div className="dropdownName" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <TypeBadge type={type} />
                  <span className="mono">{label}</span>
                </div>
                <div className="dropdownMeta muted">
                  <span className="mono">{bpacc}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
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

      <div className="muted slotHint">This is your team. It won’t affect the enemy tab.</div>
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
    () => calcFinalStatsLv50(baseStats, evs, mon?.nature ?? "Hardy", mon?.ivs ?? { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }),
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
      t = evTotal(current);
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
        {/* Controls box (Ability / Item / Nature) */}
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

        {/* Moves box (same layout as enemy, but editable move name) */}
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

        {/* Stats box (collapsible) */}
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
                {EV_KEYS.map((k) => (
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

                    <div className="statBarTrack" aria-label={`${EV_LABEL[k]} ${finalStats?.[k] ?? "-"}`}>
                      <div
                        className={`statBarFill ${getTierClass(typeof finalStats?.[k] === "number" ? finalStats[k] : 0)}`}
                        style={{
                          width: `${Math.round(clamp01((typeof finalStats?.[k] === "number" ? finalStats[k] : 0) / 200) * 100)}%`,
                        }}
                      />
                    </div>

                    <div className="mono myStatFinal">{finalStats?.[k] ?? "-"}</div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MyTeamTab({ myTeam, setMyTeam, moveDex }) {
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

export default function App() {
  const [activeTab, setActiveTab] = useState("enemy"); // "enemy" | "myteam"
  const [myTeam, setMyTeam] = useState([null, null, null, null]);

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 150);
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [trainer, setTrainer] = useState(null);

  const [confirmed, setConfirmed] = useState([]);
  const [discarded, setDiscarded] = useState(() => new Set());
  const [showDiscarded, setShowDiscarded] = useState(false);

  const [showStatsInPool, setShowStatsInPool] = useState(false);

  const [pokemonFilter, setPokemonFilter] = useState("");
  const debouncedPokemonFilter = useDebouncedValue(pokemonFilter, 80);

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

  const setById = useMemo(() => {
    const m = new Map();
    for (const s of poolSets) m.set(s.global_id, s);
    return m;
  }, [poolSets]);

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

  const visiblePoolBase = useMemo(() => {
    const confirmedSet = new Set(confirmed);
    return poolSortedDex.filter((s) => {
      if (confirmedSet.has(s.global_id)) return false;
      const isDisc = discarded.has(s.global_id);
      if (isDisc && !showDiscarded) return false;
      return true;
    });
  }, [poolSortedDex, confirmed, discarded, showDiscarded]);

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

    setPokemonFilter("");
    setConfirmed((prev) => [...prev, set.global_id]);

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

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
          <button className="ghostBtn" onClick={resetAll} title="Reset enemy trainer state">
            Reset Enemy
          </button>
        </div>

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
                <div className="dropdown dropdownAbove">
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
          <MyTeamTab myTeam={myTeam} setMyTeam={setMyTeam} moveDex={moveDex} />
        </main>
      ) : (
        <EnemyTrainerTab
          trainer={trainer}
          confirmed={confirmed}
          discarded={discarded}
          showDiscarded={showDiscarded}
          setShowDiscarded={setShowDiscarded}
          showStatsInPool={showStatsInPool}
          setShowStatsInPool={setShowStatsInPool}
          pokemonFilter={pokemonFilter}
          setPokemonFilter={setPokemonFilter}
          debouncedPokemonFilter={debouncedPokemonFilter}
          moveDex={moveDex}
          poolSets={poolSets}
          visiblePool={visiblePool}
          confirmedSets={confirmedSets}
          toggleDiscard={toggleDiscard}
          confirmSet={confirmSet}
          removeConfirmed={removeConfirmed}
        />
      )}
    </div>
  );
}
