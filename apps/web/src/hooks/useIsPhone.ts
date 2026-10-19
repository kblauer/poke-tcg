import { useSyncExternalStore } from 'react';

/** A phone held upright: the battle screen gets its phone layout (components/phone/). Tablets, desktops and phones on their side keep the usual one. */
const PHONE = '(max-width: 767px) and (orientation: portrait)';

const subscribe = (change: () => void) => {
  const query = matchMedia(PHONE);
  query.addEventListener('change', change);
  return () => query.removeEventListener('change', change);
};

/** Whether the screen is a phone in portrait, kept up to date as it turns or resizes. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => matchMedia(PHONE).matches);
}
