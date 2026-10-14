import { prisma, type Card } from '@poke-tcg/db';
import type { Attack, CardDef, CardLibrary, EnergyType, Stage } from '@poke-tcg/game-engine';

const ENERGY_TYPES = new Set<EnergyType>(['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal', 'colorless']);
const STAGES: Record<string, Stage> = { Basic: 'basic', Baby: 'basic', Stage1: 'stage1', Stage2: 'stage2' };

/** Shape of the TCGdex fields kept in Card.data (see packages/db/prisma/tcgdex.ts). */
export interface CardData {
  attacks?: { name: string; cost: string[] | null; damage: string | number | null; effect: string | null }[] | null;
}

function energyType(tcgdexType: string): EnergyType {
  const type = tcgdexType.toLowerCase() as EnergyType;
  if (!ENERGY_TYPES.has(type)) throw new Error(`Unknown energy type: ${tcgdexType}`);
  return type;
}

/** Leading number of a printed damage value: "30+" → 30, "20×" → 20, null/"" → 0. */
export function baseDamage(damage: string | number | null): number {
  if (typeof damage === 'number') return damage;
  return Number.parseInt(damage ?? '', 10) || 0;
}

/** Converts a catalog row into the engine's card definition. */
export function toCardDef(card: Card): CardDef {
  const imageUrl = card.imageUrl;
  if (card.kind === 'POKEMON') {
    const stage = card.stage && STAGES[card.stage];
    const [type] = card.types;
    if (!stage || !type || card.hp == null) throw new Error(`Card ${card.id} is missing stage, type or HP`);
    const attacks: Attack[] = ((card.data as CardData).attacks ?? []).map((a) => ({
      name: a.name,
      cost: (a.cost ?? []).map(energyType),
      damage: baseDamage(a.damage),
      text: a.effect,
    }));
    return { id: card.id, kind: 'pokemon', name: card.name, imageUrl, type: energyType(type), hp: card.hp, stage, evolvesFrom: card.evolveFrom, attacks };
  }
  if (card.kind === 'ENERGY') {
    // Basic energy cards are named "<Type> Energy".
    const type = energyType(card.name.replace(/ Energy$/, ''));
    if (type === 'colorless') throw new Error(`Card ${card.id} is not a basic energy`);
    return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: type };
  }
  throw new Error(`Card ${card.id}: ${card.kind} cards are not supported by the engine yet`);
}

/** Loads the definitions for the given card ids from the catalog. */
export async function loadCardLibrary(ids: Iterable<string>): Promise<CardLibrary> {
  const unique = [...new Set(ids)];
  const rows = await prisma.card.findMany({ where: { id: { in: unique } } });
  const missing = unique.filter((id) => !rows.some((r) => r.id === id));
  if (missing.length) throw new Error(`Cards not found in catalog: ${missing.join(', ')}`);
  return Object.fromEntries(rows.map((r) => [r.id, toCardDef(r)]));
}
