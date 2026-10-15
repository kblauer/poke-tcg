import { prisma, type Card } from '@poke-tcg/db';
import { attackEffect, type Attack, type CardDef, type CardLibrary, type EnergyType, type PokemonCardDef, type Stage } from '@poke-tcg/game-engine';

const ENERGY_TYPES = new Set<EnergyType>(['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal', 'colorless']);
const STAGES: Record<string, Stage> = { Basic: 'basic', Baby: 'basic', Stage1: 'stage1', Stage2: 'stage2' };

/** Shape of the TCGdex fields kept in Card.data (see packages/db/prisma/tcgdex.ts). */
export interface CardData {
  /** WOTC values are all "×2" (or "x2"). */
  weaknesses?: { type: string; value: string | null }[] | null;
  /** WOTC values are all "-30". */
  resistances?: { type: string; value: string | null }[] | null;
  /** Retreat cost (number of energy); null for Pokémon that retreat for free. */
  retreat?: number | null;
  attacks?: { name: string; cost: string[] | null; damage: string | number | null; effect: string | null }[] | null;
  /** Printings that exist; `holo` marks holofoil cards (rarity alone doesn't, e.g. Base Set holos are "Rare"). */
  variants?: { holo?: boolean; normal?: boolean; reverse?: boolean; firstEdition?: boolean } | null;
}

/** Whether the card was printed as a holofoil. */
export const isHolo = (card: Pick<Card, 'data'>) => (card.data as CardData).variants?.holo === true;

/**
 * Cards with galaxy foil over the whole face except the art. TCGdex has no flag for it: these are
 * the reverse-only printings, minus Scizor (basep-33), which is reverse-only but silver foil.
 */
const GALAXY_FOIL = new Set(['basep-34', 'basep-35', 'si1-1', 'si1-4', 'si1-7', 'si1-11', 'si1-14', 'si1-17']);
export const isGalaxyFoil = (card: Pick<Card, 'id'>) => GALAXY_FOIL.has(card.id);

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

/** First weakness as type and multiplier ("×2" → 2). */
function weakness(data: CardData): PokemonCardDef['weakness'] {
  const [w] = data.weaknesses ?? [];
  if (!w) return null;
  return { type: energyType(w.type), multiplier: Number.parseInt((w.value ?? '').replace(/^[×x]/, ''), 10) || 2 };
}

/** First resistance as type and amount ("-30" → 30). */
function resistance(data: CardData): PokemonCardDef['resistance'] {
  const [r] = data.resistances ?? [];
  if (!r) return null;
  return { type: energyType(r.type), amount: Math.abs(Number.parseInt(r.value ?? '', 10)) || 30 };
}

/** Converts a catalog row into the engine's card definition. */
export function toCardDef(card: Card): CardDef {
  const imageUrl = card.imageUrl;
  if (card.kind === 'POKEMON') {
    const stage = card.stage && STAGES[card.stage];
    const [type] = card.types;
    if (!stage || !type || card.hp == null) throw new Error(`Card ${card.id} is missing stage, type or HP`);
    const data = card.data as CardData;
    const attacks: Attack[] = (data.attacks ?? []).map((a) => ({
      name: a.name,
      cost: (a.cost ?? []).map(energyType),
      damage: baseDamage(a.damage),
      damageText: a.damage == null || a.damage === '' ? null : String(a.damage),
      // Printed wording where TCGdex's differs (kept with the attack's effect in the engine).
      text: attackEffect(card.id, a.name)?.text ?? a.effect,
    }));
    return { id: card.id, kind: 'pokemon', name: card.name, imageUrl, type: energyType(type), hp: card.hp, stage, evolvesFrom: card.evolveFrom, attacks, weakness: weakness(data), resistance: resistance(data), retreatCost: data.retreat ?? 0, holo: isHolo(card) };
  }
  if (card.kind === 'ENERGY') {
    // Basic energy cards are named "<Type> Energy".
    const type = energyType(card.name.replace(/ Energy$/, ''));
    if (type === 'colorless') throw new Error(`Card ${card.id} is not a basic energy`);
    return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: type, holo: isHolo(card) };
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
