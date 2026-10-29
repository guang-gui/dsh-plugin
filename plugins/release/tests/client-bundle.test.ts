import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('Harness client bundle', () => {
  it('loads through the real closure factory and registers matching panel/sidebar pairs', () => {
    const entries: Array<{ name: string; id?: string; key?: string; label?: string }> = [];
    const require = createRequire(import.meta.url);
    let plugin: { apply(ctx: unknown): void } | undefined;
    runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
      window: { __ModuleLoader__: { load(def: { id: string; factory(require: unknown): typeof plugin }) {
        expect(def.id).toBe('dsh-plugin-release'); plugin = def.factory(require);
      } } },
    });
    plugin!.apply({ effect(fn: () => void) { fn(); }, slots: {
      inject(_name: string, fn: () => void) { fn(); },
      register(options: typeof entries[number]) { entries.push(options); return () => {}; },
    } });
    for (const id of ['release']) {
      expect(entries.some((e) => e.name === 'main' && e.key === id)).toBe(true);
      expect(entries.some((e) => e.name === 'sidebar.panellist' && e.id === id)).toBe(true);
    }
    expect(entries.filter((e) => e.name === 'sidebar.panellist')).toEqual([
      expect.objectContaining({ id: 'release', label: '发版' }),
    ]);
    expect(entries.some((e) => e.key === 'release-settings')).toBe(false);
  });
});
