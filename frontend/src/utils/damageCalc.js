const TYPE_CHART = {
    normal: { rock: 0.5, ghost: 0, steel: 0.5 },
    fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
    water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
    electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
    grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
    ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
    fighting: { normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, ghost: 0 },
    poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
    ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
    flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
    bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5 },
    rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
    ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5, steel: 0.5 },
    dragon: { dragon: 2, steel: 0.5 },
    dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, steel: 0.5 },
    steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5 },
};

function getStageMultiplier(stage) {
    const s = Math.max(-6, Math.min(6, stage));
    if (s === 0) return 1.0;
    return s > 0 ? (2 + s) / 2 : 2 / (2 + Math.abs(s));
}

// is_burned: attacker has Burn (halves physical, negated by Guts)
// def_side: { reflect, light_screen } — screens on defender's side (bypassed by crits)
export function computeDamage(attacker, defender, move, field, isCrit = false, is_burned = false, def_side = {}) {
    const level = 50;
    const category = move.damage_class.toLowerCase();
    if (category === 'status') return null;

    const atkStatKey = category === 'physical' ? 'atk' : 'spa';
    const defStatKey = category === 'physical' ? 'def' : 'spd';

    // Crits ignore negative atk stages and positive def stages
    let atkStage = attacker.boosts[atkStatKey];
    let defStage = defender.boosts[defStatKey];
    if (isCrit) {
        atkStage = Math.max(0, atkStage);
        defStage = Math.min(0, defStage);
    }

    const A = Math.floor(attacker.stats[atkStatKey] * getStageMultiplier(atkStage));
    const D = Math.floor(defender.stats[defStatKey] * getStageMultiplier(defStage));

    let baseDamage = Math.floor(Math.floor(Math.floor((2 * level / 5 + 2) * move.power * A / D) / 50) + 2);

    const moveType = move.type.toLowerCase();
    let effectiveness = 1.0;
    defender.types.forEach(type => {
        effectiveness *= (TYPE_CHART[moveType]?.[type.toLowerCase()] ?? 1.0);
    });

    let stab = attacker.types.map(t => t.toLowerCase()).includes(moveType) ? 1.5 : 1.0;
    if (attacker.ability?.toLowerCase() === 'adaptability' && stab > 1) stab = 2.0;

    const hasGuts = attacker.ability?.toLowerCase() === 'guts';

    const rolls = Array.from({ length: 16 }, (_, i) => {
        const r = 85 + i;
        let dmg = baseDamage;

        dmg = Math.floor(dmg * (r / 100));
        dmg = Math.floor(dmg * stab);
        dmg = Math.floor(dmg * effectiveness);
        if (isCrit) dmg = Math.floor(dmg * 2.0);

        if ((field.weather === 'sun' && moveType === 'fire') || (field.weather === 'rain' && moveType === 'water')) dmg = Math.floor(dmg * 1.5);
        if ((field.weather === 'sun' && moveType === 'water') || (field.weather === 'rain' && moveType === 'fire')) dmg = Math.floor(dmg * 0.5);

        // Burn halves physical damage (Guts negates the penalty)
        if (is_burned && category === 'physical' && !hasGuts) dmg = Math.floor(dmg * 0.5);

        // Screens halve damage; crits bypass screens in Gen 5
        if (!isCrit && category === 'physical' && def_side?.reflect) dmg = Math.floor(dmg * 0.5);
        if (!isCrit && category === 'special' && def_side?.light_screen) dmg = Math.floor(dmg * 0.5);

        return Math.max(1, dmg);
    });

    return {
        min: rolls[0],
        max: rolls[15],
        rolls: rolls,
        effectiveness,
    };
}

// Adapter that takes the same request body shape as the old /calc/damage endpoint
// and returns a response matching the old API format.
export function calcDamageFromRequest(body, moveDex) {
    const { attacker, defender, move_slug, is_crit, field, atk_side, def_side } = body;

    const moveEntry = moveDex?.[move_slug];
    if (!moveEntry || moveEntry.damage_class === 'status' || !moveEntry.power) return null;

    const category = moveEntry.damage_class.toLowerCase();

    // Wonder Room swaps Def/SpD for both sides
    let atkStats = { ...attacker.stats };
    let defStats = { ...defender.stats };
    if (field?.wonder_room) {
        ({ def: atkStats.spd, spd: atkStats.def } = { def: atkStats.def, spd: atkStats.spd });
        ({ def: defStats.spd, spd: defStats.def } = { def: defStats.def, spd: defStats.spd });
    }

    const is_burned = !!(atk_side?.burned);

    const result = computeDamage(
        { ...attacker, stats: atkStats },
        { ...defender, stats: defStats },
        moveEntry,
        field ?? {},
        !!is_crit,
        is_burned,
        def_side ?? {}
    );
    if (!result) return null;

    // Post-roll modifiers: helping hand, friend guard (screens handled inside computeDamage)
    let postMult = 1.0;
    if (atk_side?.helping_hand) postMult *= 1.5;
    if (field?.format === 'doubles' && def_side?.friend_guard) postMult *= 0.75;

    const rolls = postMult === 1.0
        ? result.rolls
        : result.rolls.map(v => Math.max(1, Math.floor(v * postMult)));

    const minDmg = rolls[0] ?? 0;
    const maxDmg = rolls[rolls.length - 1] ?? 0;
    const maxHp = Math.max(1, Number(defender.stats?.hp ?? 1));
    const currentHp = typeof defender.current_hp === 'number' ? defender.current_hp : maxHp;

    return {
        min_damage: minDmg,
        max_damage: maxDmg,
        min_percent_maxhp: Math.round((minDmg / maxHp) * 100),
        max_percent_maxhp: Math.round((maxDmg / maxHp) * 100),
        guaranteed_ohko_on_remaining: minDmg >= currentHp,
        possible_ohko_on_remaining: maxDmg >= currentHp,
    };
}