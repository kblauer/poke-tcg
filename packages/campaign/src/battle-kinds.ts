// The kinds of encounter and of battle. In a file of its own, importing nothing but types: the site's layout asks
// `isBattleKind` (useRun), while run.ts imports every run type's maps and boss decks (a file is bundled whole with
// whatever it imports; apps/web/scripts/check-dist.mjs checks the site's first load holds none of them).

import type { BossKind } from './bosses.js';

/** Battles: a trainer, an Ace Trainer (elite, can be declined), a gym's Gym Trainer, or a boss. */
export type BattleKind = 'battle' | 'elite' | 'gymTrainer' | BossKind;
export type EncounterKind = BattleKind | 'shop' | 'gift' | 'trade' | 'event' | 'center';

const BATTLE_KINDS: readonly string[] = ['battle', 'elite', 'gymTrainer', 'gymLeader', 'eliteFour', 'champion'];
export const isBattleKind = (kind: string): kind is BattleKind => BATTLE_KINDS.includes(kind);
const BOSS_KINDS: readonly string[] = ['gymLeader', 'eliteFour', 'champion'];
/** Bosses are fought again after a loss, and give a better reward. */
export const isBossKind = (kind: string): kind is BossKind => BOSS_KINDS.includes(kind);
