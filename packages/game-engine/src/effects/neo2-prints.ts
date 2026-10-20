// Neo Discovery (neo2) prints of the same card: 21–35 are the non-holo prints of the holo rares 2–17 (20 Espeon and
// 32 Umbreon are different cards). Their attacks and powers are the holos'.

/** The non-holo prints of the holo rares (the same cards). */
const NON_HOLO: Record<string, string> = {
  'neo2-21': 'neo2-2',
  'neo2-22': 'neo2-3',
  'neo2-23': 'neo2-4',
  'neo2-24': 'neo2-5',
  'neo2-25': 'neo2-6',
  'neo2-26': 'neo2-7',
  'neo2-27': 'neo2-8',
  'neo2-28': 'neo2-9',
  'neo2-29': 'neo2-10',
  'neo2-30': 'neo2-11',
  'neo2-31': 'neo2-12',
  'neo2-33': 'neo2-14',
  'neo2-34': 'neo2-15',
  'neo2-35': 'neo2-16',
  'neo2-36': 'neo2-17',
};

/** `holo`'s entries again under the ids of their non-holo prints. */
export const withNonHolo = <T>(holo: Record<string, T>): Record<string, T> => ({
  ...holo,
  ...Object.fromEntries(Object.entries(NON_HOLO).flatMap(([copy, of]) => (holo[of] ? [[copy, holo[of]]] : []))),
});
