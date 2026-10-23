import { useEffect, useState } from "react";

// Only the team builds are persisted; boosts, status, HP and field reset every session
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
  const [enemySetId, setEnemySetId] = useState(null);
  const [enemyBattle, setEnemyBattle] = useState(() => freshBattle());
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

  function selectEnemy(setId, ability) {
    setEnemySetId(setId);
    setEnemyBattle(freshBattle(ability));
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
    enemySetId,
    enemyBattle,
    setEnemyBattle,
    selectEnemy,
    clearEnemy: () => setEnemySetId(null),
    field,
    setField,
    selected,
    setSelected,
  };
}
