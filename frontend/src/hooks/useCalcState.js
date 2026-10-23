import { useEffect, useState } from "react";

// Only your team builds are persisted; the rival list, boosts, status, HP and field reset every session
const TEAM_KEY = "bsh.calc.team.v1";
export const MAX_TEAM = 6;

const STAT_IDS = ["hp", "atk", "def", "spa", "spd", "spe"];
const statTable = (v) => Object.fromEntries(STAT_IDS.map((k) => [k, v]));

export function newTeamMember(species, ability) {
  return {
    species,
    nature: "Hardy",
    ability: ability ?? "",
    item: "",
    moves: ["", "", "", ""],
    evs: statTable(0),
    ivs: statTable(31),
  };
}

export function freshBattle(ability = "") {
  return { ability, boosts: statTable(0), status: "", hpPct: 100, itemOff: false, crits: [false, false, false, false] };
}

const emptySide = () => ({
  isReflect: false,
  isLightScreen: false,
  isTailwind: false,
  isSR: false,
  spikes: 0,
  isSeeded: false,
  isHelpingHand: false,
  isFriendGuard: false,
});

const initialField = () => ({
  gameType: "Singles",
  weather: "",
  isGravity: false,
  isMagicRoom: false,
  isWonderRoom: false,
  sides: { mine: emptySide(), enemy: emptySide() },
});

function loadTeam() {
  try {
    const raw = JSON.parse(localStorage.getItem(TEAM_KEY) ?? "null");
    if (!raw || !Array.isArray(raw.team)) return { team: [], active: 0 };
    const team = raw.team.slice(0, MAX_TEAM).map((m) => ({ ...newTeamMember(m.species), ...m }));
    const active = Math.min(Math.max(0, raw.active | 0), Math.max(0, team.length - 1));
    return { team, active };
  } catch {
    return { team: [], active: 0 };
  }
}

export function useCalcState() {
  const [{ team, active }, setTeamState] = useState(loadTeam);
  const [myBattle, setMyBattle] = useState(() => freshBattle());
  // Rival list: each entry keeps its own battle state, so switching rivals doesn't lose boosts etc.
  const [{ enemies, enemyActive }, setEnemyState] = useState({ enemies: [], enemyActive: 0 });
  const [field, setField] = useState(initialField);
  const [selected, setSelected] = useState({ side: "mine", index: 0 });

  useEffect(() => {
    try {
      localStorage.setItem(TEAM_KEY, JSON.stringify({ team, active }));
    } catch {
      // storage unavailable (private mode, blocked site data): the team just isn't remembered
    }
  }, [team, active]);

  const myMon = team[active] ?? null;

  function switchActive(index) {
    setTeamState((prev) => ({ ...prev, active: index }));
    setMyBattle(freshBattle());
  }

  function addMember(species, ability) {
    setTeamState((prev) => {
      if (prev.team.length >= MAX_TEAM) return prev;
      const next = [...prev.team, newTeamMember(species, ability)];
      return { team: next, active: next.length - 1 };
    });
    setMyBattle(freshBattle());
  }

  // Replacing the species keeps nothing of the old build except the EV/IV spread
  function replaceSpecies(species, ability) {
    setTeamState((prev) => {
      const next = [...prev.team];
      const old = next[prev.active];
      next[prev.active] = { ...newTeamMember(species, ability), evs: old.evs, ivs: old.ivs };
      return { ...prev, team: next };
    });
    setMyBattle(freshBattle());
  }

  function updateMyMon(patch) {
    setTeamState((prev) => {
      const next = [...prev.team];
      next[prev.active] = { ...next[prev.active], ...patch };
      return { ...prev, team: next };
    });
  }

  function removeActive() {
    setTeamState((prev) => {
      const next = prev.team.filter((_, i) => i !== prev.active);
      return { team: next, active: Math.max(0, Math.min(prev.active, next.length - 1)) };
    });
    setMyBattle(freshBattle());
  }

  const enemy = enemies[enemyActive] ?? null;

  // Focuses the set if it's already in the list; otherwise appends it (or replaces the active one when full)
  function addEnemy(setId, ability) {
    setEnemyState((prev) => {
      const existing = prev.enemies.findIndex((e) => e.setId === setId);
      if (existing >= 0) return { ...prev, enemyActive: existing };
      const entry = { setId, battle: freshBattle(ability) };
      if (prev.enemies.length >= MAX_TEAM) {
        const next = [...prev.enemies];
        next[prev.enemyActive] = entry;
        return { ...prev, enemies: next };
      }
      return { enemies: [...prev.enemies, entry], enemyActive: prev.enemies.length };
    });
  }

  function switchEnemy(index) {
    setEnemyState((prev) => ({ ...prev, enemyActive: index }));
  }

  function removeActiveEnemy() {
    setEnemyState((prev) => {
      const next = prev.enemies.filter((_, i) => i !== prev.enemyActive);
      return { enemies: next, enemyActive: Math.max(0, Math.min(prev.enemyActive, next.length - 1)) };
    });
  }

  // Same signature as a useState setter, applied to the active rival's battle state
  function setEnemyBattle(update) {
    setEnemyState((prev) => {
      const cur = prev.enemies[prev.enemyActive];
      if (!cur) return prev;
      const battle = typeof update === "function" ? update(cur.battle) : update;
      const next = [...prev.enemies];
      next[prev.enemyActive] = { ...cur, battle };
      return { ...prev, enemies: next };
    });
  }

  return {
    team,
    active,
    myMon,
    myBattle,
    setMyBattle,
    switchActive,
    addMember,
    replaceSpecies,
    updateMyMon,
    removeActive,
    enemies,
    enemyActive,
    enemySetId: enemy?.setId ?? null,
    enemyBattle: enemy?.battle ?? freshBattle(),
    setEnemyBattle,
    addEnemy,
    switchEnemy,
    removeActiveEnemy,
    field,
    setField,
    selected,
    setSelected,
  };
}
