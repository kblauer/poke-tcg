// The Idle Adventure's decisions in battle (README: Idle Adventure), all settings, so nothing waits on the player:
// - the energy rule (Battle.chooseMove): the slots in turn, the basic move while the next one's energy builds;
// - auto-heal (agreed with the user): a Potion-class item when the active Pokémon is at half its HP or less, the one
//   wasting least; a status cure when it has a status (the specific cure before Full Heal); a Revive by the settings'
//   policy (the last one standing, any fainted, boss battles, the lead; none, never);
// - auto-catch (agreed): only moves that can't Knock Out the wild Pokémon (on the highest roll with a critical hit),
//   Sleep and Paralysis first; once none is safe, the best ball owned;
// - a trainer's items (the game's AI_SwitchOrUseItem, simplified): a healing item at a quarter of its HP or less, a
//   status cure for a status.
import { MEDICINE, statusUseless, type Battle, type Battler, type StatusKind } from './battle.js';
import { BALLS } from './catch.js';
import { moveData } from './data.js';
import { energyCost } from './mon.js';

export type Action = { kind: 'move'; move: string } | { kind: 'item'; item: string; target: number } | { kind: 'ball'; item: string };

const healAmount = (item: string, maxHp: number) => {
  const h = MEDICINE[item]?.heal;
  return h === 'full' ? maxHp : (h ?? 0);
};

/** The healing item wasting least for the HP missing: the biggest that doesn't overheal, else the smallest. */
function bestHeal(items: string[], missing: number, maxHp: number): string | null {
  const heals = items.filter((i) => healAmount(i, maxHp) > 0 && !MEDICINE[i]?.cures).sort((a, b) => healAmount(a, maxHp) - healAmount(b, maxHp));
  if (!heals.length) return items.find((i) => i === 'full-restore') ?? null;
  const fits = heals.filter((i) => healAmount(i, maxHp) <= missing);
  return fits.at(-1) ?? heals[0]!;
}

/** The cure for a status: its own cure first, then Full Heal, then Full Restore. */
function bestCure(items: string[], status: StatusKind): string | null {
  const own = items.find((i) => {
    const c = MEDICINE[i]?.cures;
    return Array.isArray(c) && c.includes(status) && !MEDICINE[i]?.heal;
  });
  return own ?? items.find((i) => MEDICINE[i]?.cures === 'all' && !MEDICINE[i]?.heal) ?? items.find((i) => i === 'full-restore') ?? null;
}

const owned = (b: Battle) => Object.keys(b.bag).filter((k) => (b.bag[k] ?? 0) > 0);

/** The player's auto-heal item for the tick, if any. */
function autoHeal(b: Battle, me: Battler): Action | null {
  const items = owned(b);
  if (!items.length) return null;
  // Revives, by the settings' policy (agreed with the user; none ticked, never): the last one standing, any fainted, a
  // boss battle's last one standing, or the party's lead.
  const policy = b.setup.settings.revives ?? ['last'];
  const others = b.party.filter((p) => p !== me && !p.fainted);
  const lead = b.party[0]!;
  const downed =
    (policy.includes('lead') && lead.fainted && lead) ||
    ((policy.includes('any') || (!others.length && (policy.includes('last') || (policy.includes('boss') && b.setup.boss)))) && b.party.find((p) => p.fainted)) ||
    null;
  if (downed) {
    const revive = items.find((i) => MEDICINE[i]?.revive === 'half') ?? items.find((i) => MEDICINE[i]?.revive === 'full');
    if (revive) return { kind: 'item', item: revive, target: downed.index };
  }
  if (me.status) {
    const cure = bestCure(items, me.status);
    if (cure) return { kind: 'item', item: cure, target: me.index };
  }
  if (me.hp <= Math.floor(me.maxHp / 2)) {
    const heal = bestHeal(items, me.maxHp - me.hp, me.maxHp);
    if (heal) return { kind: 'item', item: heal, target: me.index };
  }
  return null;
}

/** The most a move could do to the target: the highest roll with a critical hit (Weakness included), or its fixed damage. */
export function maxDamage(b: Battle, user: Battler, target: Battler, key: string): number {
  const m = moveData(key);
  if (m.power === 0) return 0;
  if (b.immune(user, target, b.moveType(user, m))) return 0;
  switch (m.effect) {
    case 'false_swipe':
      return Math.max(0, target.hp - 1);
    case 'dragon_rage':
      return 40;
    case 'sonicboom':
      return 20;
    case 'level_damage':
      return user.level;
    case 'psywave':
      return Math.floor((user.level * 150) / 100);
    case 'super_fang':
      return Math.max(1, Math.floor(target.hp / 2));
    case 'ohko':
    case 'endeavor':
    case 'counter':
    case 'mirror_coat':
    case 'bide':
    case 'explosion':
      return target.hp;
  }
  const power = m.effect === 'flail' ? 200 : m.effect === 'magnitude' ? 150 : m.effect === 'eruption' ? 150 : m.effect === 'low_kick' ? 120 : m.power;
  const hits = m.effect === 'multi_hit' ? 5 : m.effect === 'double_hit' || m.effect === 'twineedle' ? 2 : m.effect === 'triple_kick' ? 3 : 1;
  const { damage } = b.baseDamage(user, target, m, { power: m.effect === 'triple_kick' ? 30 : power, type: b.moveType(user, m), crit: true, effect: m.effect });
  return damage * hits * (m.effect === 'rollout' ? 16 : 1);
}

/** Status moves auto-catch likes: putting the target to sleep, then paralyzing it. */
const CATCH_STATUS: Record<string, number> = { sleep: 2, yawn: 1, paralyze: 1 };

/** Auto-catch's action for the tick: a safe move (Sleep, Paralysis, then the strongest safe hit), else the best ball. */
function autoCatch(b: Battle, me: Battler): Action | null {
  const target = b.active[1];
  const ball = BALLS.map(([k]) => k).find((k) => (b.bag[k] ?? 0) > 0);
  if (!ball) return null;
  if (me.v.charging || me.v.rampage || me.v.rollout || me.v.uproar || me.v.bide || me.v.recharging) return null;
  const usable = [...me.slots.filter((k) => energyCost(k) <= me.energy), me.basic].filter((k) => b.selectable(me, k));
  if (!target.status) {
    const status = usable.filter((k) => CATCH_STATUS[moveData(k).effect] && !statusUseless(b, me, k)).sort((x, y) => CATCH_STATUS[moveData(y).effect]! - CATCH_STATUS[moveData(x).effect]!)[0];
    if (status) return spend(me, status);
  }
  const safe = usable.filter((k) => moveData(k).power > 0 && maxDamage(b, me, target, k) < target.hp).sort((x, y) => maxDamage(b, me, target, y) - maxDamage(b, me, target, x))[0];
  // Still worth hitting while the target is above a quarter of its HP; below that, the ball (the HP its moves can leave is as low as it goes safely).
  if (safe && target.hp > Math.ceil(target.maxHp / 4) && maxDamage(b, me, target, safe) > 0) return spend(me, safe);
  return { kind: 'ball', item: ball };
}

/** A move chosen outside the energy rule (auto-catch) still costs its energy. */
function spend(me: Battler, key: string): Action {
  if (key !== me.basic) me.energy -= energyCost(key);
  return { kind: 'move', move: key };
}

/** The player's action for the tick: auto-heal, then auto-catch on a wild Pokémon it should catch, then the energy rule. */
export function choosePlayerAction(b: Battle): Action {
  const me = b.active[0];
  const locked = me.v.charging || me.v.rampage || me.v.rollout || me.v.uproar || me.v.bide || me.v.recharging;
  if (!locked && b.setup.settings.autoHeal) {
    const heal = autoHeal(b, me);
    if (heal) return heal;
  }
  if (!locked && b.setup.kind === 'wild' && b.setup.settings.tryCatch) {
    const c = autoCatch(b, me);
    if (c) return c;
  }
  return { kind: 'move', move: b.chooseMove(me) };
}

/** A trainer's item for the tick, if it would use one: healing at a quarter of its HP or less, a cure for a status. */
export function chooseFoeItem(b: Battle, me: Battler): string | null {
  if (!b.foeItems.length || me.v.charging || me.v.rampage || me.v.recharging) return null;
  if (me.hp <= Math.floor(me.maxHp / 4)) {
    const heal = bestHeal(b.foeItems, me.maxHp - me.hp, me.maxHp);
    if (heal) return heal;
  }
  if (me.status) return bestCure(b.foeItems, me.status);
  return null;
}
