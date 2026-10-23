import type { AccountSetting, AccountSettings } from '@poke-tcg/shared';

/**
 * The Settings page's choices kept with the account (ACCOUNT_SETTINGS, `settings` router), so they follow it from browser
 * to browser. Each setting's store still keeps its value in localStorage, which applies at once on a page load; it
 * registers here (`registerSetting`: how to read its stored value and apply another) and reports its changes
 * (`saveSetting`). Once signed in, AccountSettingsSync connects the account's values: those it has replace the
 * browser's (but for a setting changed in this browser before they arrived), and the browser's own ones the account
 * hasn't got are saved to it. Changes are sent a moment later, together.
 */
interface SettingStore {
  /** The browser's stored value, or null when it has none (the default). */
  read: () => string | null;
  /** Takes the account's value, as if picked here (null: the default). */
  apply: (value: string | null) => void;
}

const stores = new Map<AccountSetting, SettingStore>();
/** The account's values, once loaded (null before, or signed out). */
let account: AccountSettings | null = null;
let send: ((values: Partial<Record<AccountSetting, string | null>>) => void) | null = null;
/** Changes not sent yet: made before the account's values arrived, or in the last moment. */
let unsent: Partial<Record<AccountSetting, string | null>> = {};
let timer: number | undefined;

/** How long changes wait (ms) to go together (a slider, a run of clicks). */
const SEND_MS = 600;

function flush() {
  clearTimeout(timer);
  if (!send || !Object.keys(unsent).length) return;
  send(unsent);
  unsent = {};
}

function queue(key: AccountSetting, value: string | null) {
  unsent[key] = value;
  clearTimeout(timer);
  timer = window.setTimeout(flush, SEND_MS);
}

/** Brings one setting in line with the account: its value applied, or the browser's saved to it when it has none. */
function reconcile(key: AccountSetting) {
  const store = stores.get(key);
  if (!store || !account || key in unsent) return;
  const value = account[key];
  if (value !== undefined) {
    if (value !== store.read()) store.apply(value);
  } else {
    const local = store.read();
    if (local !== null) queue(key, local);
  }
}

/** A setting's store: brought in line with the account now if its values are in, else when they arrive. */
export function registerSetting(key: AccountSetting, store: SettingStore): () => void {
  stores.set(key, store);
  reconcile(key);
  return () => void (stores.get(key) === store && stores.delete(key));
}

/** A setting changed in this browser: saved to the account (null: back to the default). */
export function saveSetting(key: AccountSetting, value: string | null) {
  if (account) {
    if (value === null) delete account[key];
    else account[key] = value;
  }
  queue(key, value);
}

/** Signed in: the account's values, and how to save changes to it. Returns the disconnect (signed out). */
export function connectAccountSettings(values: AccountSettings, save: typeof send & {}): () => void {
  account = { ...values };
  send = save;
  for (const key of stores.keys()) reconcile(key);
  flush();
  return () => {
    flush();
    account = null;
    send = null;
  };
}
