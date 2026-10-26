// What End turn reminds the player they could still do this turn (StatusBar asks before ending it).
import { lookupCard, stadiumError, type PlayerView } from '@poke-tcg/game-engine';
import type { EndTurnReminder } from '../components/StatusBar';

/**
 * The reminders for the player's turn: an Energy card in hand and none attached yet; a Stadium they can still
 * use (Lucky Stadium); Pokémon Powers they can use right now (`powers`, from usePower: each with why it can't
 * be used, or null).
 */
export function endTurnReminders(view: PlayerView, powers: { pokemon: string; name: string; error: string | null }[]): EndTurnReminder[] {
  const reminders: EndTurnReminder[] = [];
  if (!view.energyAttachedThisTurn && view.self.hand.some((c) => lookupCard(view.cards, c.defId).kind === 'energy')) {
    reminders.push({ kind: 'energy', text: "Attach an Energy card: you haven't this turn, and you have one in your hand." });
  }
  if (view.stadium && stadiumError(view.stadium.card, view.stadiumUsedTurn, view.turn, { me: view.self, cards: view.cards, oppLostZone: view.opponent.lostZone ?? [] }) === null) {
    reminders.push({ kind: 'stadium', text: `Use ${lookupCard(view.cards, view.stadium.card.defId).name}.` });
  }
  const usable = powers.filter((p) => p.error === null).map((p) => `${p.pokemon}'s ${p.name}`);
  if (usable.length) reminders.push({ kind: 'powers', text: `Use ${[...new Set(usable)].join(', ')}.` });
  return reminders;
}
