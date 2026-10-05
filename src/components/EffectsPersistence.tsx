import { useEffect, useRef } from 'react';

import ConfigBridge from '../lib/bridge-config';
import player from '../lib/player';

/**
 * Persists Slow + Reverb across launches. The config already owns
 * `audio_slow` / `audio_reverb_intensity` / the enabled flags; this restores
 * them into the engine on boot and writes changes back (debounced, and only
 * when they actually changed).
 */
export default function EffectsPersistence() {
  const ready = useRef(false);
  const last = useRef('');

  useEffect(() => {
    player.setEffectsConfig({
      enabled: ConfigBridge.getInitial('audio_effects_enabled'),
      slowEnabled: ConfigBridge.getInitial('audio_slow_enabled'),
      reverbEnabled: ConfigBridge.getInitial('audio_reverb_enabled'),
      slow: ConfigBridge.getInitial('audio_slow'),
      reverbIntensity: ConfigBridge.getInitial('audio_reverb_intensity'),
    });
    ready.current = true;
    last.current = JSON.stringify(player.getEffectsConfig());
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const persist = () => {
      if (!ready.current) return;
      const config = player.getEffectsConfig();
      const snapshot = JSON.stringify(config);
      if (snapshot === last.current) return;
      last.current = snapshot;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void ConfigBridge.multiSet({
          audio_effects_enabled: config.enabled,
          audio_slow_enabled: config.slowEnabled,
          audio_reverb_enabled: config.reverbEnabled,
          audio_slow: config.slow,
          audio_reverb_intensity: config.reverbIntensity,
        }).catch(() => {
          // Persistence is best-effort; a failed write must not break playback.
        });
      }, 500);
    };

    player.on('stateChange', persist);
    return () => {
      player.off('stateChange', persist);
      clearTimeout(timer);
    };
  }, []);

  return null;
}
