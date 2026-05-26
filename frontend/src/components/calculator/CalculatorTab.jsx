import { useEffect, useMemo, useState } from "react";
import { calcDamageFromRequest } from "../../utils/damageCalc";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { Sprite } from "../common/Sprite";
import { ItemIcon } from "../common/ItemIcon";
import { TypeBadge } from "../common/TypeBadge";
import {
  clampInt,
  findMoveSlugFromText,
  formatBPAcc,
  prettyMoveNameFromSlug,
  setDisplayName,
} from "../../utils/poke";

import { calcFinalStatsLv50 } from "../myteam/stats";

const BOOST_KEYS = [
  { key: "atk", label: "Atk" },
  { key: "def", label: "Def" },
  { key: "spa", label: "SpA" },
  { key: "spd", label: "SpD" },
  { key: "spe", label: "Spe" },
];

function defaultBoosts() {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

function BoostSelect({ value, onChange }) {
  return (
    <select
      className="mySelect myInputSmall mono"
      value={value ?? 0}
      onChange={(e) => onChange(clampInt(parseInt(e.target.value, 10), -6, 6))}
      style={{ width: "100%" }}
    >
      {Array.from({ length: 13 }, (_, i) => i - 6).map((v) => (
        <option key={v} value={v}>{v >= 0 ? `+${v}` : String(v)}</option>
      ))}
    </select>
  );
}

function MoveDamageRow({ sideLabel, moveSlug, moveEntry, damage, isCrit, onToggleCrit, onClick }) {
  const label = prettyMoveNameFromSlug(moveSlug) ?? moveSlug;
  const type = moveEntry?.type ?? null;
  const bpacc = formatBPAcc(moveEntry);

  const rangeText = damage
    ? `${damage.min_damage}-${damage.max_damage} (${damage.min_percent_maxhp}-${damage.max_percent_maxhp}%)`
    : "—";

  return (
    <div
      className="miniBox"
      style={{ display: "grid", gap: 8, cursor: moveSlug ? "pointer" : "default" }}
      onClick={moveSlug ? onClick : undefined}
      title={moveSlug ? "Click for details" : ""}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
          <TypeBadge type={type} />
          <div className="mono" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {sideLabel}: {label}
          </div>
        </div>

        {/* Compact: POWER/ACC inline just left of Crit */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flex: "0 0 auto" }}>
          <span className="mono muted" style={{ whiteSpace: "nowrap" }}>
            {bpacc}
          </span>

          <label className="toggle" style={{ padding: "6px 10px" }} title="Critical hit">
            <input
              type="checkbox"
              checked={!!isCrit}
              onChange={(e) => onToggleCrit(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
            <span>Crit</span>
          </label>
        </div>
      </div>

      {/* Second row now only for damage range */}
      <div className="muted" style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
        <span className="mono">{rangeText}</span>
      </div>
    </div>
  );
}

function buildCalcPokemonFromMyMon(mon, boosts, currentHp) {
  if (!mon) return null;

  const evs = mon?.evs ?? {};
  const ivs = mon?.ivs ?? { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
  const baseStats = mon?.base_stats ?? {};
  const final = calcFinalStatsLv50(baseStats, evs, mon?.nature ?? "Hardy", ivs);

  return {
    name: mon?.name_en ?? mon?.slug ?? "My Pokémon",
    level: 50,
    types: Array.isArray(mon?.types) ? mon.types : [],
    ability: (mon?.ability ?? "").trim() || null,
    item: (mon?.item ?? "").trim() || null,
    stats: { hp: final.hp, atk: final.atk, def: final.def, spa: final.spa, spd: final.spd, spe: final.spe },
    boosts: boosts ?? defaultBoosts(),
    current_hp: typeof currentHp === "number" ? currentHp : final.hp,
  };
}

function buildCalcPokemonFromEnemySet(set, boosts, currentHp) {
  if (!set) return null;
  const stats50 = set?.stats_lv50 ?? {};
  const maxHp = Number(stats50?.HP ?? 1);

  return {
    subway_global_id: set.global_id,
    name: setDisplayName(set),
    level: 50,
    types: Array.isArray(set?.types) ? set.types : [],
    ability: (set?.ability ?? set?.ability_name ?? "").trim() || null,
    item: (set?.item ?? "").trim() || null,
    stats: {
      hp: Number(stats50?.HP ?? 0),
      atk: Number(stats50?.Atk ?? 0),
      def: Number(stats50?.Def ?? 0),
      spa: Number(stats50?.SpA ?? 0),
      spd: Number(stats50?.SpD ?? 0),
      spe: Number(stats50?.Spe ?? 0),
    },
    boosts: boosts ?? defaultBoosts(),
    current_hp: typeof currentHp === "number" ? currentHp : maxHp,
  };
}

function StatsBoxWithControls({ title, stats, boosts, onBoostsChange, curHp, onCurHpChange, maxHp }) {
  const safeMax = Math.max(1, Number(maxHp ?? 1));
  const safeCur = clampInt(Number(curHp ?? safeMax), 0, safeMax);

  return (
    <div className="miniBox">
      <div className="h3">{title}</div>
      <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
        {/* header row */}
        <div style={{ display: "grid", gridTemplateColumns: "40px 46px 1fr", gap: 8 }}>
          <div />
          <div className="muted mono" style={{ fontSize: "0.78rem", textAlign: "right" }}>Stat</div>
          <div className="muted mono" style={{ fontSize: "0.78rem" }}>Stage / HP</div>
        </div>

        {/* HP row */}
        <div style={{ display: "grid", gridTemplateColumns: "40px 46px 1fr", gap: 8, alignItems: "center" }}>
          <div className="muted mono" style={{ fontSize: "0.88rem" }}>HP</div>
          <div className="mono" style={{ fontSize: "0.88rem", textAlign: "right" }}>{stats?.hp ?? 0}</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              className="myInput myInputSmall mono"
              type="number"
              min={0}
              max={safeMax}
              step={1}
              value={safeCur}
              onChange={(e) => onCurHpChange(clampInt(parseInt(e.target.value, 10), 0, safeMax))}
              style={{ width: 68 }}
            />
            <span className="mono muted" style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>/{safeMax}</span>
          </div>
        </div>

        {/* Boost rows */}
        {BOOST_KEYS.map(({ key }) => {
          const lbl = key === "atk" ? "Atk" : key === "def" ? "Def" : key === "spa" ? "SpA" : key === "spd" ? "SpD" : "Spe";
          return (
            <div key={key} style={{ display: "grid", gridTemplateColumns: "40px 46px 1fr", gap: 8, alignItems: "center" }}>
              <div className="muted mono" style={{ fontSize: "0.88rem" }}>{lbl}</div>
              <div className="mono" style={{ fontSize: "0.88rem", textAlign: "right" }}>{stats?.[key] ?? 0}</div>
              <BoostSelect
                value={boosts?.[key] ?? 0}
                onChange={(v) => onBoostsChange({ ...(boosts ?? defaultBoosts()), [key]: v })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalculatorTab({ trainer, confirmedSets, myTeam, moveDex }) {
  const [format, setFormat] = useState("singles");
  const [weather, setWeather] = useState("none");
  const [wonderRoom, setWonderRoom] = useState(false);
  const [gravity, setGravity] = useState(false);

  const [reflectMy, setReflectMy] = useState(false);
  const [screenMy, setScreenMy] = useState(false);
  const [reflectEn, setReflectEn] = useState(false);
  const [screenEn, setScreenEn] = useState(false);

  const [helpingHandMy, setHelpingHandMy] = useState(false);
  const [friendGuardEn, setFriendGuardEn] = useState(false);

  const [myBurned, setMyBurned] = useState(false);
  const [enBurned, setEnBurned] = useState(false);

  const [selectedMyIdx, setSelectedMyIdx] = useState(0);
  const [selectedEnemyId, setSelectedEnemyId] = useState(null); // global_id from confirmedSets
  const [enemyTempSet, setEnemyTempSet] = useState(null);

  const [myBoosts, setMyBoosts] = useState(defaultBoosts());
  const [enBoosts, setEnBoosts] = useState(defaultBoosts());

  const selectedMyMon = myTeam?.[selectedMyIdx] ?? null;

  const selectedEnemySet = useMemo(() => {
    const s = (confirmedSets ?? []).find((x) => x && x.global_id === selectedEnemyId) ?? null;
    return s || enemyTempSet;
  }, [confirmedSets, selectedEnemyId, enemyTempSet]);

  const myFinalStats = useMemo(() => {
    if (!selectedMyMon) return null;
    return calcFinalStatsLv50(
      selectedMyMon.base_stats ?? {},
      selectedMyMon.evs ?? {},
      selectedMyMon.nature ?? "Hardy",
      selectedMyMon.ivs ?? { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }
    );
  }, [selectedMyMon]);

  const enemyMaxHp = Number(selectedEnemySet?.stats_lv50?.HP ?? 0) || 0;

  const [myCurHp, setMyCurHp] = useState(null);
  const [enCurHp, setEnCurHp] = useState(null);

  // keep current hp synced when mon changes (default full)
  useEffect(() => {
    if (!myFinalStats?.hp) return;
    setMyCurHp(myFinalStats.hp);
  }, [myFinalStats?.hp]);

  useEffect(() => {
    if (!enemyMaxHp) return;
    setEnCurHp(enemyMaxHp);
  }, [enemyMaxHp]);

  // Enemy pool-limited search
  const [enemyQuery, setEnemyQuery] = useState("");
  const debEnemyQuery = useDebouncedValue(enemyQuery, 100);
  const [enemySuggestions, setEnemySuggestions] = useState([]);

  useEffect(() => {
    const q = (debEnemyQuery ?? "").trim().toLowerCase();
    if (!q || !trainer?.sets) {
      setEnemySuggestions([]);
      return;
    }
    setEnemySuggestions(
      trainer.sets
        .filter((s) => setDisplayName(s).toLowerCase().includes(q) || (s.species ?? "").toLowerCase().includes(q))
        .slice(0, 12)
        .map((s) => ({ display: setDisplayName(s), global_id: s.global_id, dex_number: s.dex_number }))
    );
  }, [trainer, debEnemyQuery]);

  function pickEnemyGlobalId(globalId) {
    const set = trainer?.sets?.find((s) => s.global_id === globalId) ?? null;
    if (set) {
      setEnemyTempSet(set);
      setSelectedEnemyId(null);
      setEnemyQuery("");
      setEnemySuggestions([]);
    }
  }

  // Determine move slugs for each side
  const myMoveSlugs = useMemo(() => {
    if (!selectedMyMon) return [null, null, null, null];
    const out = [0, 1, 2, 3].map(
      (i) => selectedMyMon?.move_slugs?.[i] ?? findMoveSlugFromText(selectedMyMon?.moves?.[i], moveDex)
    );
    return out;
  }, [selectedMyMon, moveDex]);

  const enemyMoveSlugs = useMemo(() => {
    const set = selectedEnemySet;
    if (!set) return [null, null, null, null];
    const meta = Array.isArray(set.moves_meta) ? set.moves_meta : [];
    const out = [0, 1, 2, 3].map((i) => meta?.[i]?.slug ?? null);
    return out;
  }, [selectedEnemySet]);

  // Crit flags per move (8 total: 4 my + 4 enemy)
  const [myCrit, setMyCrit] = useState([false, false, false, false]);
  const [enCrit, setEnCrit] = useState([false, false, false, false]);

  // Detail selection
  const [selectedMoveDetail, setSelectedMoveDetail] = useState(null); // { side: 'my'|'en', i, resp, slug }

  const field = useMemo(
    () => ({ format, weather, wonder_room: wonderRoom, gravity }),
    [format, weather, wonderRoom, gravity]
  );

  const atkSideMy = useMemo(
    () => ({
      reflect: reflectMy,
      light_screen: screenMy,
      helping_hand: format === "doubles" ? helpingHandMy : false,
      friend_guard: false,
      burned: myBurned,
    }),
    [reflectMy, screenMy, helpingHandMy, format, myBurned]
  );

  const defSideMy = useMemo(
    () => ({
      reflect: reflectMy,
      light_screen: screenMy,
      helping_hand: false,
      friend_guard: false,
    }),
    [reflectMy, screenMy]
  );

  const atkSideEn = useMemo(
    () => ({
      reflect: reflectEn,
      light_screen: screenEn,
      helping_hand: false,
      friend_guard: false,
      burned: enBurned,
    }),
    [reflectEn, screenEn, enBurned]
  );

  const defSideEn = useMemo(
    () => ({
      reflect: reflectEn,
      light_screen: screenEn,
      helping_hand: false,
      friend_guard: format === "doubles" ? friendGuardEn : false,
    }),
    [reflectEn, screenEn, friendGuardEn, format]
  );

  const myCalcMon = useMemo(
    () => (selectedMyMon && myFinalStats ? buildCalcPokemonFromMyMon(selectedMyMon, myBoosts, myCurHp) : null),
    [selectedMyMon, myFinalStats, myBoosts, myCurHp]
  );

  const enCalcMon = useMemo(
    () => (selectedEnemySet ? buildCalcPokemonFromEnemySet(selectedEnemySet, enBoosts, enCurHp) : null),
    [selectedEnemySet, enBoosts, enCurHp]
  );

  const [myDamage, setMyDamage] = useState([null, null, null, null]);
  const [enDamage, setEnDamage] = useState([null, null, null, null]);

  useEffect(() => {
    if (!myCalcMon || !enCalcMon || !moveDex) {
      setMyDamage([null, null, null, null]);
      setEnDamage([null, null, null, null]);
      return;
    }

    setMyDamage(
      myMoveSlugs.map((slug, i) =>
        slug
          ? calcDamageFromRequest({ attacker: myCalcMon, defender: enCalcMon, move_slug: slug, is_crit: !!myCrit[i], field, atk_side: atkSideMy, def_side: defSideEn }, moveDex)
          : null
      )
    );
    setEnDamage(
      enemyMoveSlugs.map((slug, i) =>
        slug
          ? calcDamageFromRequest({ attacker: enCalcMon, defender: myCalcMon, move_slug: slug, is_crit: !!enCrit[i], field, atk_side: atkSideEn, def_side: defSideMy }, moveDex)
          : null
      )
    );
  }, [
    myCalcMon,
    enCalcMon,
    moveDex,
    myMoveSlugs.join("|"),
    enemyMoveSlugs.join("|"),
    JSON.stringify(myCrit),
    JSON.stringify(enCrit),
    JSON.stringify(field),
    JSON.stringify(atkSideMy),
    JSON.stringify(defSideEn),
    JSON.stringify(atkSideEn),
    JSON.stringify(defSideMy),
  ]);

  const enemySeen = (confirmedSets ?? []).filter(Boolean);

  // Keep selected detail in sync: if the selected move has updated damage, refresh resp reference.
  useEffect(() => {
    if (!selectedMoveDetail?.slug) return;
    const side = selectedMoveDetail.side;
    const idx = selectedMoveDetail.i;
    const nextResp = side === "my" ? myDamage?.[idx] : enDamage?.[idx];
    if (nextResp && nextResp !== selectedMoveDetail.resp) {
      setSelectedMoveDetail((p) => (p ? { ...p, resp: nextResp } : p));
    }
  }, [myDamage, enDamage, selectedMoveDetail]);

  return (
    <div className="layoutNew">
      {!trainer ? (
        <div className="empty">
          <div className="emptyTitle">Select a trainer first</div>
          <div className="muted">Calculator is limited to the selected trainer’s pool.</div>
        </div>
      ) : (
        <>
          {/* Top summary */}
          <section className="panel">
            <div className="panelTitle">
              <div className="h2">Calculator</div>
              <div className="muted">Gen 5 · Level 50 · Random roll (85–100)</div>
            </div>

            {!myCalcMon || !enCalcMon ? (
              <div className="muted">Pick one Pokémon on each side to see damage ranges.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div className="muted" style={{ display: "grid", gap: 8 }}>
                  <div className="h3">Moves → Damage range</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ display: "grid", gap: 10 }}>
                    {[0, 1, 2, 3].map((i) => {
                      const slug = myMoveSlugs[i];
                      const entry = slug && moveDex ? moveDex[slug] : null;
                      return (
                        <MoveDamageRow
                          key={`my-${i}`}
                          sideLabel="My"
                          moveSlug={slug ?? ""}
                          moveEntry={entry}
                          damage={myDamage[i]}
                          isCrit={myCrit[i]}
                          onToggleCrit={(v) =>
                            setMyCrit((prev) => {
                              const next = [...prev];
                              next[i] = v;
                              return next;
                            })
                          }
                          onClick={() => setSelectedMoveDetail({ side: "my", i, resp: myDamage[i], slug })}
                        />
                      );
                    })}
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    {[0, 1, 2, 3].map((i) => {
                      const slug = enemyMoveSlugs[i];
                      const entry = slug && moveDex ? moveDex[slug] : null;
                      return (
                        <MoveDamageRow
                          key={`en-${i}`}
                          sideLabel="Enemy"
                          moveSlug={slug ?? ""}
                          moveEntry={entry}
                          damage={enDamage[i]}
                          isCrit={enCrit[i]}
                          onToggleCrit={(v) =>
                            setEnCrit((prev) => {
                              const next = [...prev];
                              next[i] = v;
                              return next;
                            })
                          }
                          onClick={() => setSelectedMoveDetail({ side: "en", i, resp: enDamage[i], slug })}
                        />
                      );
                    })}
                  </div>
                </div>

                {selectedMoveDetail?.slug ? (
                  <div className="miniBox">
                    <div className="h3">Selected move</div>

                    <div className="muted mono" style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span>{selectedMoveDetail.side === "my" ? "My" : "Enemy"}</span>
                      <span className="muted">·</span>
                      <span>{prettyMoveNameFromSlug(selectedMoveDetail.slug) ?? selectedMoveDetail.slug}</span>

                      {moveDex?.[selectedMoveDetail.slug]?.type ? (
                        <>
                          <span className="muted">·</span>
                          <TypeBadge type={moveDex[selectedMoveDetail.slug].type} />
                        </>
                      ) : null}

                      <span className="muted">·</span>
                      <span>{formatBPAcc(moveDex?.[selectedMoveDetail.slug])}</span>
                    </div>

                    {selectedMoveDetail?.resp ? (
                      <div className="muted mono" style={{ marginTop: 8 }}>
                        Damage: {selectedMoveDetail.resp.min_damage}-{selectedMoveDetail.resp.max_damage} (
                        {selectedMoveDetail.resp.min_percent_maxhp}-{selectedMoveDetail.resp.max_percent_maxhp}%)
                        {" · "}
                        {selectedMoveDetail.resp.guaranteed_ohko_on_remaining
                          ? "GUARANTEED OHKO (remaining HP)"
                          : selectedMoveDetail.resp.possible_ohko_on_remaining
                          ? "POSSIBLE OHKO (remaining HP)"
                          : "not an OHKO (remaining HP)"}
                      </div>
                    ) : (
                      <div className="muted mono" style={{ marginTop: 8 }}>
                        No damage data (missing move / not calculated yet).
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </section>

          {/* 3 columns */}
          <section className="panel">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 360px 1fr",
                gap: 18,
                alignItems: "stretch", // <-- iguala altura de columnas dentro del panel
              }}
            >
              {/* Left: My */}
              <div style={{ display: "grid", gap: 12, height: "100%", alignContent: "start" }}>
                <div className="h2">My side</div>

                <div className="miniBox">
                  <div className="h3">Team</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 10 }}>
                    {myTeam.map((m, idx) => (
                      <button
                        key={idx}
                        className="tileBtn"
                        style={{
                          width: "100%",
                          height: 72,
                          borderRadius: 14,
                          opacity: m ? 1 : 0.55,
                          outline: idx === selectedMyIdx ? "2px solid rgba(213, 184, 255, 0.6)" : "none",
                        }}
                        onClick={() => setSelectedMyIdx(idx)}
                        title={m ? (m.name_en ?? m.slug) : "Empty slot"}
                        type="button"
                      >
                        {m ? <Sprite url={m.sprite_url} alt={m.name_en ?? m.slug} /> : <div className="spriteFallback">?</div>}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedMyMon && myFinalStats ? (
                  <>
                    <div className="miniBox">
                      <div className="h3">Info</div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                        <Sprite url={selectedMyMon.sprite_url} alt={selectedMyMon.name_en ?? selectedMyMon.slug} />
                        <div style={{ minWidth: 0 }}>
                          <div className="h2" style={{ margin: 0 }}>
                            {selectedMyMon.name_en ?? selectedMyMon.slug}
                          </div>
                          <div className="muted" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            {(selectedMyMon.types ?? []).map((t) => (
                              <TypeBadge key={t} type={t} />
                            ))}
                            {(selectedMyMon.ability ?? "").trim() ? <span className="mono">· {selectedMyMon.ability}</span> : null}
                            {(selectedMyMon.item ?? "").trim() ? <span className="mono">· {selectedMyMon.item}</span> : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* HP & Boosts removed; integrated into Stats */}
                    <StatsBoxWithControls
                      title="Stats (Lv 50)"
                      stats={{
                        hp: myFinalStats.hp,
                        atk: myFinalStats.atk,
                        def: myFinalStats.def,
                        spa: myFinalStats.spa,
                        spd: myFinalStats.spd,
                        spe: myFinalStats.spe,
                      }}
                      boosts={myBoosts}
                      onBoostsChange={setMyBoosts}
                      curHp={myCurHp}
                      onCurHpChange={setMyCurHp}
                      maxHp={myFinalStats.hp}
                    />
                  </>
                ) : (
                  <div className="muted">Pick a Pokémon from your team slots.</div>
                )}
              </div>

              {/* Center: Field */}
              <div style={{ display: "grid", gap: 12, height: "100%", alignContent: "start" }}>
                <div className="h2" style={{ textAlign: "center" }}>
                  Field
                </div>

                <div className="miniBox">
                  <div className="h3">Format</div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 10 }}>
                    <button className={`tabBtn ${format === "singles" ? "tabBtnActive" : ""}`} onClick={() => setFormat("singles")} type="button">
                      Singles
                    </button>
                    <button className={`tabBtn ${format === "doubles" ? "tabBtnActive" : ""}`} onClick={() => setFormat("doubles")} type="button">
                      Doubles
                    </button>
                  </div>
                </div>

                <div className="miniBox">
                  <div className="h3">Weather</div>
                  <select
                    className="mySelect myInputSmall"
                    value={weather}
                    onChange={(e) => setWeather(e.target.value)}
                    style={{ marginTop: 10 }}
                  >
                    <option value="none">None</option>
                    <option value="sun">Sun</option>
                    <option value="rain">Rain</option>
                    <option value="sand">Sand</option>
                    <option value="hail">Hail</option>
                  </select>

                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    <label className="toggle" title="Wonder Room">
                      <input type="checkbox" checked={wonderRoom} onChange={(e) => setWonderRoom(e.target.checked)} />
                      <span>Wonder Room</span>
                    </label>
                    <label className="toggle" title="Gravity">
                      <input type="checkbox" checked={gravity} onChange={(e) => setGravity(e.target.checked)} />
                      <span>Gravity</span>
                    </label>
                  </div>
                </div>

                <div className="miniBox">
                  <div className="h3" style={{ textAlign: "center" }}>
                    Side Conditions
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, marginTop: 10, alignItems: "start" }}>
                    <div style={{ display: "grid", gap: 10 }}>
                      <label className="toggle" title="My Pokémon has Burn (halves physical output, negated by Guts)">
                        <input type="checkbox" checked={myBurned} onChange={(e) => setMyBurned(e.target.checked)} />
                        <span>Burned</span>
                      </label>
                      <label className="toggle" title="My side has Reflect (halves enemy physical, bypassed by crits)">
                        <input type="checkbox" checked={reflectMy} onChange={(e) => setReflectMy(e.target.checked)} />
                        <span>Reflect</span>
                      </label>
                      <label className="toggle" title="My side has Light Screen (halves enemy special, bypassed by crits)">
                        <input type="checkbox" checked={screenMy} onChange={(e) => setScreenMy(e.target.checked)} />
                        <span>Light Screen</span>
                      </label>
                      {format === "doubles" ? (
                        <label className="toggle" title="Doubles only: partner used Helping Hand">
                          <input type="checkbox" checked={helpingHandMy} onChange={(e) => setHelpingHandMy(e.target.checked)} />
                          <span>Helping Hand</span>
                        </label>
                      ) : null}
                    </div>

                    <div className="muted mono" style={{ textAlign: "center", paddingTop: 6 }}>
                      My · En
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                      <label className="toggle" title="Enemy Pokémon has Burn (halves its physical output, negated by Guts)">
                        <input type="checkbox" checked={enBurned} onChange={(e) => setEnBurned(e.target.checked)} />
                        <span>Burned</span>
                      </label>
                      <label className="toggle" title="Enemy side has Reflect (halves my physical, bypassed by crits)">
                        <input type="checkbox" checked={reflectEn} onChange={(e) => setReflectEn(e.target.checked)} />
                        <span>Reflect</span>
                      </label>
                      <label className="toggle" title="Enemy side has Light Screen (halves my special, bypassed by crits)">
                        <input type="checkbox" checked={screenEn} onChange={(e) => setScreenEn(e.target.checked)} />
                        <span>Light Screen</span>
                      </label>
                      {format === "doubles" ? (
                        <label className="toggle" title="Doubles only: enemy partner has Friend Guard">
                          <input type="checkbox" checked={friendGuardEn} onChange={(e) => setFriendGuardEn(e.target.checked)} />
                          <span>Friend Guard</span>
                        </label>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Enemy */}
              <div style={{ display: "grid", gap: 12, height: "100%", alignContent: "start" }}>
                <div className="h2" style={{ textAlign: "right" }}>
                  Enemy side
                </div>

                <div className="miniBox">
                  <div className="h3">Seen (click to select)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 10 }}>
                    {enemySeen.map((s) => (
                      <button
                        key={s.global_id}
                        className="tileBtn"
                        style={{
                          width: "100%",
                          height: 72,
                          borderRadius: 14,
                          outline: s.global_id === selectedEnemyId ? "2px solid rgba(213, 184, 255, 0.6)" : "none",
                        }}
                        onClick={() => {
                          setSelectedEnemyId(s.global_id);
                          setEnemyTempSet(null);
                        }}
                        title={setDisplayName(s)}
                        type="button"
                      >
                        <Sprite url={s.sprite_url_pokeapi} alt={setDisplayName(s)} />
                      </button>
                    ))}
                    {Array.from({ length: Math.max(0, 4 - enemySeen.length) }, (_, i) => (
                      <div
                        key={`ph-${i}`}
                        className="spriteFallback"
                        style={{ height: 72, borderRadius: 14, display: "grid", placeItems: "center" }}
                      >
                        ?
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div className="muted" style={{ fontWeight: 800 }}>
                      Pick from trainer pool
                    </div>
                    <input
                      className="slotSearchInput"
                      value={enemyQuery}
                      onChange={(e) => setEnemyQuery(e.target.value)}
                      placeholder='Type a pool set, e.g. "Hydreigon-3"...'
                      autoComplete="off"
                      style={{ marginTop: 8 }}
                    />
                    {enemySuggestions.length > 0 ? (
                      <div className="dropdown dropdownAbove">
                        {enemySuggestions.map((s) => (
                          <button key={s.global_id} className="dropdownItem" onClick={() => pickEnemyGlobalId(s.global_id)}>
                            <div className="dropdownName">{s.display}</div>
                            <div className="dropdownMeta muted">
                              <span className="mono">#{s.global_id}</span> · Dex <span className="mono">{s.dex_number ?? "?"}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                {selectedEnemySet ? (
                  <>
                    <div className="miniBox">
                      <div className="h3">Info</div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                        <Sprite url={selectedEnemySet.sprite_url_pokeapi} alt={setDisplayName(selectedEnemySet)} />
                        <div style={{ minWidth: 0 }}>
                          <div className="h2" style={{ margin: 0, textAlign: "right" }}>
                            {setDisplayName(selectedEnemySet)}
                          </div>
                          <div className="muted" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
                            {(selectedEnemySet.types ?? []).map((t) => (
                              <TypeBadge key={t} type={t} />
                            ))}
                            {(selectedEnemySet.ability ?? "").trim() ? <span className="mono">· {selectedEnemySet.ability}</span> : null}
                            {(selectedEnemySet.item ?? "").trim() ? <span className="mono">· {selectedEnemySet.item}</span> : null}
                          </div>
                        </div>
                      </div>

                      <div className="itemLine" style={{ justifyContent: "flex-end" }}>
                        <ItemIcon url={selectedEnemySet.item_sprite_url} alt={selectedEnemySet.item} />
                        <span className="itemName">{selectedEnemySet.item}</span>
                      </div>
                    </div>

                    {/* HP & Boosts removed; integrated into Stats */}
                    <StatsBoxWithControls
                      title="Stats (Lv 50)"
                      stats={{
                        hp: Number(selectedEnemySet.stats_lv50?.HP ?? 0),
                        atk: Number(selectedEnemySet.stats_lv50?.Atk ?? 0),
                        def: Number(selectedEnemySet.stats_lv50?.Def ?? 0),
                        spa: Number(selectedEnemySet.stats_lv50?.SpA ?? 0),
                        spd: Number(selectedEnemySet.stats_lv50?.SpD ?? 0),
                        spe: Number(selectedEnemySet.stats_lv50?.Spe ?? 0),
                      }}
                      boosts={enBoosts}
                      onBoostsChange={setEnBoosts}
                      curHp={enCurHp}
                      onCurHpChange={setEnCurHp}
                      maxHp={enemyMaxHp}
                    />
                  </>
                ) : (
                  <div className="muted" style={{ textAlign: "right" }}>
                    Select an enemy Pokémon (seen or pool pick).
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
