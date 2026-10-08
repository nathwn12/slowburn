import { Trans, useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ask } from '@tauri-apps/plugin-dialog';

import LibraryAPI from '../api/LibraryAPI';
import SettingsAPI from '../api/SettingsAPI';
import * as Setting from '../components/Setting';
import CheckboxSetting from '../components/SettingCheckbox';
import { useSortPresetLabels } from '../components/TrackListHeader';
import Button from '../elements/Button';
import Flexbox from '../elements/Flexbox';
import useInvalidate, { useInvalidateCallback } from '../hooks/useInvalidate';
import ConfigBridge from '../lib/bridge-config';
import SettingsBridge from '../lib/bridge-settings';
import { configQuery } from '../lib/queries';
import { SORT_PRESETS } from '../lib/sort-presets';
import { logAndNotifyError } from '../lib/utils';

export const Route = createFileRoute('/settings/advanced')({
  component: ViewSettingsAdvanced,
});

function ViewSettingsAdvanced() {
  const config = useSuspenseQuery(configQuery).data;
  const invalidate = useInvalidate();
  const { t } = useLingui();

  const activePreset =
    SORT_PRESETS.find(
      (preset) =>
        JSON.stringify(preset.keys) ===
        JSON.stringify(config.library_sort_keys),
    )?.id ?? 'custom';

  // Translated preset labels, shared with the track-list sort control via the
  // canonical `useSortPresetLabels` hook (which owns the map).
  const presetLabels = useSortPresetLabels();

  return (
    <>
      <Setting.Section>
        <Setting.Title>
          <Trans>Advanced</Trans>
        </Setting.Title>
        <Setting.Description>
          <Trans>Power controls for library sorting and system behavior.</Trans>
        </Setting.Description>
      </Setting.Section>
      <Setting.Section>
        <Setting.Title>
          <Trans>Sort keys</Trans>
        </Setting.Title>
        <Setting.Select
          label={t`Sort preset`}
          description={t`Order used to sort the track list`}
          value={activePreset}
          onChange={(e) => {
            const preset = SORT_PRESETS.find(
              (candidate) => candidate.id === e.currentTarget.value,
            );
            if (preset === undefined) {
              return;
            }
            ConfigBridge.multiSet({ library_sort_keys: preset.keys })
              .then(invalidate)
              .catch(logAndNotifyError);
          }}
        >
          {activePreset === 'custom' && (
            <option value="custom">
              <Trans>Custom (default)</Trans>
            </option>
          )}
          {SORT_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {presetLabels[preset.id] ?? preset.labelKey}
            </option>
          ))}
        </Setting.Select>
      </Setting.Section>
      <Setting.Section>
        <CheckboxSetting
          title={t`Automatically refresh library on startup`}
          value={config.library_autorefresh}
          onChange={useInvalidateCallback(SettingsAPI.toggleLibraryAutorefresh)}
        />
      </Setting.Section>
      <Setting.Section>
        <CheckboxSetting
          title={t`Enable stream server`}
          description={t`Serve audio over HTTP for other devices on this machine`}
          value={config.audio_stream_server}
          onChange={useInvalidateCallback((value: boolean) =>
            ConfigBridge.multiSet({ audio_stream_server: value }),
          )}
        />
      </Setting.Section>
      <Setting.Section>
        <CheckboxSetting
          title={t`Follow playing track`}
          description={t`Automatically follow the currently playing track (only when the app is not focused)`}
          value={config.audio_follow_playing_track}
          onChange={useInvalidateCallback(SettingsAPI.toggleFollowPlayingTrack)}
        />
      </Setting.Section>
      <Setting.Section>
        <CheckboxSetting
          title={t`Show menu bar`}
          description={t`Always show the native application menu bar`}
          value={config.menu_bar_visible}
          onChange={useInvalidateCallback(async (value: boolean) => {
            await ConfigBridge.multiSet({ menu_bar_visible: value });
            if (value) {
              await SettingsBridge.showMenu();
            } else {
              await SettingsBridge.hideMenu();
            }
          })}
        />
      </Setting.Section>
      <Setting.Section>
        <div {...stylex.props(styles.dangerPanel)}>
          <Setting.Title>
            <span {...stylex.props(styles.dangerTitle)}>
              <Trans>Danger zone</Trans>
            </span>
          </Setting.Title>
          <Setting.Description>
            <Trans>Delete all tracks and playlists from Slowburn.</Trans>
          </Setting.Description>
          <Flexbox>
            <Button
              relevancy="danger"
              title={t`Fully reset the library`}
              onClick={useInvalidateCallback(async () => {
                const confirm = await ask(
                  t`All your tracks and playlists will be deleted from Slowburn.`,
                  {
                    title: t`Reset library?`,
                    kind: 'warning',
                    cancelLabel: t`Cancel`,
                    okLabel: t`Reset`,
                  },
                );

                if (confirm) {
                  await LibraryAPI.reset();
                }
              })}
            >
              <Trans>Reset library</Trans>
            </Button>
          </Flexbox>
        </div>
      </Setting.Section>
    </>
  );
}

const styles = stylex.create({
  dangerPanel: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: 'var(--space-2)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--danger-line)',
    borderRadius: 'var(--radius)',
    backgroundColor: 'var(--danger-soft)',
    padding: 'var(--space-3)',
  },
  dangerTitle: {
    color: 'var(--danger-text)',
  },
});
