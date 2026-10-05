import { useEffect, useState } from 'react';

import type { EffectsConfig } from '../lib/effects';
import player from '../lib/player';

/**
 * Live effects settings for the Burn strip.
 *
 * The effects config is not part of `PlayerState`, and `getEffectsConfig()`
 * returns a fresh object every call, so it cannot be a `useSyncExternalStore`
 * snapshot directly. Subscribing to `stateChange` (which the player emits on
 * every `setEffectsConfig`) and storing the config in component state keeps the
 * readout honest without depending on an engine change.
 */
export default function useEffectsConfig(): EffectsConfig {
  const [config, setConfig] = useState<EffectsConfig>(() =>
    player.getEffectsConfig(),
  );

  useEffect(() => {
    const update = () => setConfig(player.getEffectsConfig());
    player.on('stateChange', update);
    return () => {
      player.off('stateChange', update);
    };
  }, []);

  return config;
}
