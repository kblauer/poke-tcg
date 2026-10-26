// The Idle Adventure's decisions in battle (README: Idle Adventure), all settings, so nothing waits on the player:
// - the cooldown rule (Battle.chooseMove): the strongest slot move off cooldown, the basic move while they all cool down;
// - auto-heal (agreed with the user): a Potion-class item when the active Pokémon is at half its HP or less, the one
//   wasting least; a status cure when it has a status (the specific cure before Full Heal); a Revive by the settings'
//   policy (the last one standing, any fainted, boss battles, the lead; none, never);
// - auto-catch (the user's, 2026-10-25): the basic move once, again only while the wild Pokémon is above 60% of its HP,
//   then the best ball owned every turn (a basic move that could Knock it Out is skipped for the ball);
// - a trainer's items (the game's AI_SwitchOrUseItem, simplified): a healing item at a quarter of its HP or less, a
//   status cure for a status.
import { MEDICINE, type Battle, type Battler, type StatusKind } from './battle.js';
import { BALLS } from './catch.js';
import { moveData } from './data.js';

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

/** How much HP the wild Pokémon may still have for auto-catch's second basic hit: above 60% of it (the user's). */
export const CATCH_SECOND_HIT = 0.6;

/**
 * Auto-catch's action for the tick (the user's, 2026-10-25): its basic move the first turn, again the next only if the
 * wild Pokémon is still above CATCH_SECOND_HIT of its HP, then the best ball owned every turn; a basic move that could
 * Knock it Out (on the highest roll with a critical hit) or can't be used is skipped for the ball. Out of balls, the
 * battle goes on as any other.
 */
function autoCatch(b: Battle, me: Battler): Action | null {
  const target = b.active[1];
  const ball = BALLS.map(([k]) => k).find((k) => (b.bag[k] ?? 0) > 0);
  if (!ball) return null;
  if (me.v.charging || me.v.rampage || me.v.rollout || me.v.uproar || me.v.bide || me.v.recharging) return null;
  const hit = b.catchHits === 0 || (b.catchHits === 1 && target.hp > target.maxHp * CATCH_SECOND_HIT);
  if (hit && b.selectable(me, me.basic) && maxDamage(b, me, target, me.basic) < target.hp) {
    b.catchHits += 1;
    return { kind: 'move', move: me.basic };
  }
  // No more hits once the balls start.
  b.catchHits = 2;
  return { kind: 'ball', item: ball };
}

/** The player's action for the tick: auto-heal, then auto-catch on a wild Pokémon it should catch, then the cooldown rule. */
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
