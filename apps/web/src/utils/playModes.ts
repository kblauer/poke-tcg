/**
 * The Play tab's modes, in its menu's order, the one list of them (the Play tab's tiles, the menus' accordion under Play,
 * PlayModes, and which pages light Play): each its page, its name, a line on it, and a scene from the games filling its tile
 * (`public/play/`, by tools/play/play_tiles.py; the user's), with where the tile's crop of it centres (`focus`).
 */
export const PLAY_MODES: readonly { to: '/badge' | '/tower' | '/idle' | '/battle'; label: string; text: string; picture: string; focus: string }[] = [
  {
    to: '/badge',
    label: 'Badge Challenge',
    text: 'Defeat the Gym Leaders and collect all 8 badges! Then, challenge the Elite 4 and become the Champion!',
    // Cerulean Gym's entrance (FireRed): the Gym Guide by its statues.
    picture: '/play/badge.png',
    focus: '50% 75%',
  },
  {
    to: '/tower',
    label: 'Battle Tower',
    text: "Battle trainer after trainer to move up the tower! Keep winning to keep going, one loss and it's over!",
    // HGSS's Battle Tower lobby: its receptionist at her desk, Ethan before it.
    picture: '/play/tower.png',
    focus: '50% 30%',
  },
  {
    to: '/idle',
    label: 'Idle Adventure',
    text: 'Pick a starter and watch your journey across Kanto play itself, from Pallet Town to the Pokémon League!',
    // Route 1 (FireRed): Red setting off up the road from Pallet Town.
    picture: '/play/idle.png',
    focus: '50% 60%',
  },
  {
    to: '/battle',
    label: 'Training',
    text: 'Practice battling or test your deck! Single battles with no pressure and no battle rewards.',
    // The Saffron City Dojo (FireRed): its Karate Master and Black Belts, Red on the mat.
    picture: '/play/training.png',
    focus: '50% 50%',
  },
];

/** The Play tab's pages: its menu, and its modes. */
export const isPlayPath = (path: string) => path === '/' || PLAY_MODES.some((m) => m.to === path);
