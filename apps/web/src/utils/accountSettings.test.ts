import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module keeps the account's values and the unsent changes in module state, so each test loads it afresh; its timer
// is the browser's (`window.setTimeout`), which Node stands in for here.
type Module = typeof import('./accountSettings');
let settings: Module;

/** A setting's store as the Settings page's hooks make them: a value in the browser, replaced when the account's is applied. */
function store(initial: string | null) {
  const state = { value: initial, applied: [] as (string | null)[] };
  return {
    state,
    read: () => state.value,
    apply: (value: string | null) => {
      state.value = value;
      state.applied.push(value);
    },
  };
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.resetModules();
  settings = await import('./accountSettings');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('account settings', () => {
  it("the account's value replaces the browser's, whichever arrives first", () => {
    const theme = store('slate');
    settings.registerSetting('theme', theme);
    const save = vi.fn();
    settings.connectAccountSettings({ theme: 'red', font: 'pixel' }, save);
    expect(theme.state.applied).toEqual(['red']);
    // A store registered once the account's values are in (a lazily loaded page's).
    const font = store(null);
    settings.registerSetting('font', font);
    expect(font.state.applied).toEqual(['pixel']);
    vi.runAllTimers();
    expect(save).not.toHaveBeenCalled();
  });

  it('applies nothing when the browser already has the account\'s value', () => {
    const theme = store('red');
    settings.registerSetting('theme', theme);
    const save = vi.fn();
    settings.connectAccountSettings({ theme: 'red' }, save);
    vi.runAllTimers();
    expect(theme.state.applied).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it("saves the browser's value to an account that has none for it, and nothing for a setting left at its default", () => {
    settings.registerSetting('theme', store('blue'));
    settings.registerSetting('font', store(null));
    const save = vi.fn();
    settings.connectAccountSettings({}, save);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ theme: 'blue' });
  });

  it('a setting changed before the account\'s values arrived keeps the change, and sends it', () => {
    const theme = store('slate');
    settings.registerSetting('theme', theme);
    theme.state.value = 'gold';
    settings.saveSetting('theme', 'gold');
    const save = vi.fn();
    settings.connectAccountSettings({ theme: 'red' }, save);
    expect(theme.state.applied).toEqual([]);
    expect(save).toHaveBeenCalledWith({ theme: 'gold' });
  });

  it('sends changes together, a moment after the last one', () => {
    const save = vi.fn();
    settings.connectAccountSettings({}, save);
    settings.saveSetting('theme', 'red');
    vi.advanceTimersByTime(500);
    settings.saveSetting('font', 'pixel');
    settings.saveSetting('theme', null);
    vi.advanceTimersByTime(500);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ theme: null, font: 'pixel' });
    vi.runAllTimers();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('signing out sends what was waiting, and later changes wait for the next sign-in', () => {
    const save = vi.fn();
    const disconnect = settings.connectAccountSettings({}, save);
    settings.saveSetting('theme', 'red');
    disconnect();
    expect(save).toHaveBeenCalledWith({ theme: 'red' });
    settings.saveSetting('font', 'pixel');
    vi.runAllTimers();
    expect(save).toHaveBeenCalledTimes(1);
    const next = vi.fn();
    settings.connectAccountSettings({}, next);
    expect(next).toHaveBeenCalledWith({ font: 'pixel' });
  });

  it('a store taken away is no longer applied to', () => {
    const theme = store('slate');
    const remove = settings.registerSetting('theme', theme);
    remove();
    settings.connectAccountSettings({ theme: 'red' }, vi.fn());
    expect(theme.state.applied).toEqual([]);
  });
});
