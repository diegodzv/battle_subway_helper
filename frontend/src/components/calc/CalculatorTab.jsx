import { useMemo, useState } from "react";
import { Sprite } from "../common/Sprite";
import { SearchSelect } from "../common/SearchSelect";
import { BattleBox, ItemBox, MovesBox, StatsBox } from "./CalcBoxes";
import { FieldPanel } from "./FieldPanel";
import { ResultPanel } from "./ResultPanel";
import { MAX_TEAM } from "../../hooks/useCalcState";
import { natureEffectLabel, prettyMoveNameFromSlug, setDisplayName } from "../../utils/poke";
import {
  ABILITY_LIST,
  ITEM_LIST,
  MOVE_LIST,
  NATURE_LIST,
  SPECIES_LIST,
  STATS,
  buildEnemyPokemon,
  buildMyPokemon,
  computeAttack,
  enemyIvs,
  getMove,
  getSpecies,
  hiddenPowerType,
  itemSpriteUrl,
  moveSlug,
  speciesAbilities,
  speciesSpriteUrl,
} from "../../calc/engine";

const SPECIES_OPTIONS = SPECIES_LIST.map((s) => ({ key: s.name, label: s.name, meta: s.types.join(" / ") }));
const MOVE_OPTIONS = MOVE_LIST.map((m) => ({ key: m.name, label: m.name, meta: `${m.type} · ${m.category}` }));
const ITEM_OPTIONS = ITEM_LIST.map((i) => ({ key: i.name, label: i.name }));

// Display info for one move slot; Hidden Power shows its IV-dependent type and 70 BP
function moveInfo(name, label, moveDex, ivs) {
  if (!name) return { name: "", type: null, entry: null };
  const move = getMove(name);
  let entry = moveDex?.[moveSlug(move?.name ?? name)] ?? null;
  let type = entry?.type ?? move?.type?.toLowerCase() ?? null;
  if (move?.name === "Hidden Power") {
    type = hiddenPowerType(ivs).toLowerCase();
    entry = { ...entry, type, power: 70 };
  }
  return { name, label, type, entry };
}

function AbilitySelect({ value, regular, hidden, allowAny, onChange }) {
  const others = allowAny ? ABILITY_LIST.filter((a) => !regular.includes(a.name) && a.name !== hidden) : [];
  return (
    <select className="calcSelect" value={value} onChange={(e) => onChange(e.target.value)} title="Ability">
      {!value || (!regular.includes(value) && value !== hidden && !allowAny) ? <option value={value}>{value || "—"}</option> : null}
      <optgroup label="Species">
        {regular.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </optgroup>
      {allowAny && hidden ? (
        <optgroup label="Dream World">
          <option value={hidden}>{hidden}</option>
        </optgroup>
      ) : null}
      {allowAny ? (
        <optgroup label="All abilities">
          {others.map((a) => (
            <option key={a.name} value={a.name}>
              {a.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}

function results(attacker, defender, moves, crits, ivs, field, attackerKey) {
  return moves.map((m, i) => {
    if (!m.name) return null;
    const r = computeAttack({ attacker, defender, moveName: m.name, crit: crits[i], attackerIvs: ivs, field, attackerKey });
    return r ? { ...r, moveName: m.label ?? m.name } : null;
  });
}

export function CalculatorTab({ calc, setsIndex, moveDex, abilities }) {
  const [adding, setAdding] = useState(false);
  const { myMon, myBattle, enemyBattle, field, selected } = calc;

  const enemySet = calc.enemySetId != null ? setsIndex?.get(calc.enemySetId) ?? null : null;

  const enemyOptions = useMemo(() => {
    const sets = [...(setsIndex?.values() ?? [])];
    sets.sort((a, b) => a.dex_number - b.dex_number || a.global_id - b.global_id);
    return sets.map((s) => ({
      key: s.global_id,
      label: setDisplayName(s),
      meta: `${s.item} · ${s.nature}`,
      search: `${setDisplayName(s)} ${s.species}`,
    }));
  }, [setsIndex]);

  const myPokemon = useMemo(() => (myMon ? buildMyPokemon(myMon, myBattle) : null), [myMon, myBattle]);
  const enemyPokemon = useMemo(() => (enemySet ? buildEnemyPokemon(enemySet, enemyBattle) : null), [enemySet, enemyBattle]);

  const myMoves = useMemo(
    () => (myMon?.moves ?? ["", "", "", ""]).map((n) => moveInfo(n, n, moveDex, myMon?.ivs)),
    [myMon, moveDex]
  );
  const enemyMoves = useMemo(() => {
    const slugs = enemySet?.moves_meta?.map((m) => m.slug) ?? [];
    return [0, 1, 2, 3].map((i) =>
      slugs[i] ? moveInfo(slugs[i], prettyMoveNameFromSlug(slugs[i]), moveDex, enemyIvs()) : moveInfo("")
    );
  }, [enemySet, moveDex]);

  const myResults = useMemo(
    () => results(myPokemon, enemyPokemon, myMoves, myBattle.crits, myMon?.ivs, field, "mine"),
    [myPokemon, enemyPokemon, myMoves, myBattle.crits, myMon, field]
  );
  const enemyResults = useMemo(
    () => results(enemyPokemon, myPokemon, enemyMoves, enemyBattle.crits, enemyIvs(), field, "enemy"),
    [enemyPokemon, myPokemon, enemyMoves, enemyBattle.crits, field]
  );

  function pickSpecies(name) {
    const ability = speciesAbilities(name, abilities).regular[0] ?? getSpecies(name)?.abilities?.[0] ?? "";
    if (adding || !myMon) calc.addMember(name, ability);
    else calc.replaceSpecies(name, ability);
    setAdding(false);
  }

  function pickEnemy(setId) {
    const set = setsIndex.get(setId);
    calc.selectEnemy(setId, speciesAbilities(set?.species, abilities).regular[0] ?? "");
  }

  const patchBattle = (setter) => (p) => setter((b) => ({ ...b, ...p }));
  const setCrit = (setter) => (i, v) => setter((b) => ({ ...b, crits: b.crits.map((c, j) => (j === i ? v : c)) }));
  const setBoost = (setter) => (id, v) => setter((b) => ({ ...b, boosts: { ...b.boosts, [id]: v } }));

  const mySpecies = getSpecies(myMon?.species);
  const myAbilities = speciesAbilities(myMon?.species, abilities);
  const enemyAbilities = speciesAbilities(enemySet?.species, abilities);

  const emptyHint = !myMon
    ? "Add your Pokémon on the left."
    : !enemySet
    ? "Pick a rival set on the right."
    : "Click a move to see its damage.";

  return (
    <main className="content">
      <div className="calcLayout">
        {/* ---------- Your Pokémon ---------- */}
        <section className="panel calcMine">
          <div className="panelTitle">
            <div className="h2">Your Pokémon</div>
          </div>

          <div className="calcTeamBar">
            {calc.team.map((m, i) => (
              <button
                key={i}
                className={`chip ${i === calc.active && !adding ? "calcChipOn" : ""}`}
                onClick={() => {
                  setAdding(false);
                  calc.switchActive(i);
                }}
              >
                {m.species}
              </button>
            ))}
            {calc.team.length < MAX_TEAM ? (
              <button className={`chip ${adding ? "calcChipOn" : ""}`} onClick={() => setAdding((a) => !a)}>
                + Add
              </button>
            ) : null}
          </div>

          {adding || !myMon ? (
            <div className="calcPickBox">
              <SearchSelect
                value=""
                options={SPECIES_OPTIONS}
                onSelect={(o) => pickSpecies(o.key)}
                placeholder="Search Pokémon (any Gen 5 species)..."
                autoFocus={adding}
              />
            </div>
          ) : (
            <div className="seenSlot">
              <div className="seenSlotHeader">
                <div className="calcHeaderMain">
                  <Sprite url={speciesSpriteUrl(mySpecies)} alt={myMon.species} />
                  <div className="calcHeaderFields">
                    <SearchSelect
                      className="calcInput calcSpeciesInput"
                      value={myMon.species}
                      options={SPECIES_OPTIONS}
                      onSelect={(o) => pickSpecies(o.key)}
                      placeholder="Species..."
                    />
                    <select
                      className="calcSelect"
                      value={myMon.nature}
                      onChange={(e) => calc.updateMyMon({ nature: e.target.value })}
                      title="Nature"
                    >
                      {NATURE_LIST.map((n) => (
                        <option key={n.name} value={n.name}>
                          {n.name} · {natureEffectLabel(n.name)}
                        </option>
                      ))}
                    </select>
                    <AbilitySelect
                      value={myMon.ability}
                      regular={myAbilities.regular}
                      hidden={myAbilities.hidden}
                      allowAny
                      onChange={(a) => calc.updateMyMon({ ability: a })}
                    />
                  </div>
                </div>
                <button className="chip chipDanger" onClick={calc.removeActive} title="Remove from your team">
                  Remove ✕
                </button>
              </div>

              <div className="seenSlotBody">
                <ItemBox
                  item={myMon.item}
                  iconUrl={itemSpriteUrl(myMon.item)}
                  itemOff={myBattle.itemOff}
                  onToggleOff={(v) => patchBattle(calc.setMyBattle)({ itemOff: v })}
                  itemOptions={ITEM_OPTIONS}
                  onSelectItem={(item) => calc.updateMyMon({ item })}
                />
                <MovesBox
                  moves={myMoves}
                  selectedIndex={selected.side === "mine" ? selected.index : -1}
                  onSelect={(i) => calc.setSelected({ side: "mine", index: i })}
                  crits={myBattle.crits}
                  onCrit={setCrit(calc.setMyBattle)}
                  moveOptions={MOVE_OPTIONS}
                  onSelectMove={(i, name) => {
                    calc.updateMyMon({ moves: myMon.moves.map((m, j) => (j === i ? name : m)) });
                    calc.setSelected({ side: "mine", index: i });
                  }}
                />
                <StatsBox
                  rows={STATS.map((s) => ({
                    ...s,
                    value: myPokemon?.rawStats?.[s.id] ?? 0,
                    highlight: (myMon.evs[s.id] ?? 0) > 0,
                  }))}
                  boosts={myBattle.boosts}
                  onBoost={setBoost(calc.setMyBattle)}
                  spread={{ evs: myMon.evs, ivs: myMon.ivs }}
                  onSpread={(kind, id, v) => calc.updateMyMon({ [kind]: { ...myMon[kind], [id]: v } })}
                />
                <BattleBox battle={myBattle} onChange={patchBattle(calc.setMyBattle)} />
              </div>
            </div>
          )}
        </section>

        {/* ---------- Field + result ---------- */}
        <div className="calcCenter">
          <FieldPanel field={field} setField={calc.setField} />
          <ResultPanel
            mine={myResults}
            enemy={enemyResults}
            selected={selected}
            onSelect={calc.setSelected}
            emptyHint={emptyHint}
          />
        </div>

        {/* ---------- Rival ---------- */}
        <section className="panel calcEnemy">
          <div className="panelTitle">
            <div className="h2">Rival</div>
          </div>

          <div className="calcPickBox">
            <SearchSelect
              value=""
              options={enemyOptions}
              onSelect={(o) => pickEnemy(o.key)}
              placeholder="Search Subway set (e.g. venusaur-1)..."
            />
          </div>

          {enemySet ? (
            <div className="seenSlot">
              <div className="seenSlotHeader">
                <div className="calcHeaderMain">
                  <Sprite url={enemySet.sprite_url_pokeapi} alt={setDisplayName(enemySet)} />
                  <div className="calcHeaderFields">
                    <div className="h3" style={{ margin: 0 }}>
                      {setDisplayName(enemySet)}
                    </div>
                    <div className="muted">
                      <span className="mono">{enemySet.nature}</span> ·{" "}
                      <span className="mono">{natureEffectLabel(enemySet.nature)}</span>
                    </div>
                    <AbilitySelect
                      value={enemyBattle.ability}
                      regular={enemyAbilities.regular}
                      hidden={null}
                      onChange={(a) => patchBattle(calc.setEnemyBattle)({ ability: a })}
                    />
                  </div>
                </div>
                <button className="chip chipDanger" onClick={calc.clearEnemy} title="Clear rival">
                  Clear ✕
                </button>
              </div>

              <div className="seenSlotBody">
                <ItemBox
                  item={enemySet.item}
                  iconUrl={enemySet.item_sprite_url}
                  itemOff={enemyBattle.itemOff}
                  onToggleOff={(v) => patchBattle(calc.setEnemyBattle)({ itemOff: v })}
                />
                <MovesBox
                  moves={enemyMoves}
                  selectedIndex={selected.side === "enemy" ? selected.index : -1}
                  onSelect={(i) => calc.setSelected({ side: "enemy", index: i })}
                  crits={enemyBattle.crits}
                  onCrit={setCrit(calc.setEnemyBattle)}
                />
                <StatsBox
                  rows={STATS.map((s) => ({
                    ...s,
                    value: enemySet.stats_lv50?.[s.label] ?? 0,
                    highlight: (enemySet.evs_numeric?.[s.label] ?? 0) > 0,
                  }))}
                  boosts={enemyBattle.boosts}
                  onBoost={setBoost(calc.setEnemyBattle)}
                />
                <BattleBox battle={enemyBattle} onChange={patchBattle(calc.setEnemyBattle)} />
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
