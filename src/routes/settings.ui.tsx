import { t as tMacro } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { debounce } from 'lodash-es';
import { useMemo } from 'react';

import SettingsAPI, { DEFAULT_MAIN_COLOR } from '../api/SettingsAPI';
import * as Setting from '../components/Setting';
import CheckboxSetting from '../components/SettingCheckbox';
import Button from '../elements/Button';
import type { Config, DefaultView } from '../generated/typings';
import useInvalidate, { useInvalidateCallback } from '../hooks/useInvalidate';
import SettingsBridge from '../lib/bridge-settings';
import { configQuery } from '../lib/queries';
import { themes } from '../lib/themes';
import { logAndNotifyError } from '../lib/utils';

export const Route = createFileRoute('/settings/ui')({
  component: ViewSettingsUI,
});

function ViewSettingsUI() {
  const config = useSuspenseQuery(configQuery).data;
  const { t } = useLingui();

  const invalidate = useInvalidate();

  const selectTheme = (themeID: string) => {
    SettingsAPI.setTheme(themeID).then(invalidate).catch(logAndNotifyError);
  };

  const setUIMainColorThrottled = useMemo(() => {
    return debounce((value: string) => {
      SettingsAPI.setUIMainColor(value)
        .then(invalidate)
        .catch(logAndNotifyError);
    }, 250);
  }, [invalidate]);

  return (
    <>
      <Setting.Section>
        <Setting.Title>{t`Theme`}</Setting.Title>
        <Setting.Description>{t`Change the appearance of the interface`}</Setting.Description>
        <div {...stylex.props(styles.gallery)}>
          <label
            {...stylex.props(
              styles.card,
              config.theme === '__system' && styles.cardActive,
            )}
          >
            <input
              type="radio"
              name="theme"
              checked={config.theme === '__system'}
              onChange={() => selectTheme('__system')}
              {...stylex.props(styles.radio)}
            />
            <span
              aria-hidden
              {...stylex.props(styles.swatchRow)}
              style={{
                background: 'linear-gradient(90deg, white 50%, black 50%)',
              }}
            />
            {t`System (default)`}
          </label>
          {GALLERY_THEMES.map((theme) => (
            <label
              key={theme._id}
              {...stylex.props(
                styles.card,
                config.theme === theme._id && styles.cardActive,
              )}
            >
              <input
                type="radio"
                name="theme"
                checked={config.theme === theme._id}
                onChange={() => selectTheme(theme._id)}
                {...stylex.props(styles.radio)}
              />
              <span aria-hidden {...stylex.props(styles.swatchRow)}>
                <span
                  {...stylex.props(styles.swatch)}
                  style={{ backgroundColor: theme.variables['--background'] }}
                />
                <span
                  {...stylex.props(styles.swatch)}
                  style={{ backgroundColor: theme.variables['--surface'] }}
                />
                <span
                  {...stylex.props(styles.swatch)}
                  style={{ backgroundColor: theme.variables['--accent'] }}
                />
              </span>
              {getTranslatedThemeName(theme.name)}
            </label>
          ))}
        </div>
      </Setting.Section>
      <Setting.Section>
        <CheckboxSetting
          title={t`Tint accent from cover art`}
          description={t`Use the current track's artwork as the accent color`}
          value={config.ui_art_tint}
          onChange={useInvalidateCallback(SettingsAPI.setArtTint)}
        />
      </Setting.Section>
      <Setting.Section>
        <Setting.Select
          label={t`Mode`}
          description={t`Minimal hides the ledger and the queue column; Mini stacks the player above the queue`}
          value={config.ui_mode}
          onChange={(e) =>
            SettingsAPI.setUIMode(e.currentTarget.value as Config['ui_mode'])
              .then(invalidate)
              .catch(logAndNotifyError)
          }
        >
          <option value="minimal">
            <Trans>Minimal</Trans>
          </option>
          <option value="full">
            <Trans>Full (default)</Trans>
          </option>
          <option value="mini">
            <Trans>Mini</Trans>
          </option>
        </Setting.Select>
      </Setting.Section>
      <Setting.Section>
        <Setting.ColorSelector
          label={t`Accent color`}
          value={config.ui_accent_color ?? DEFAULT_MAIN_COLOR}
          onChange={(e) => {
            const value = e.currentTarget.value;
            SettingsAPI.applyUIMainColorToUI(value);
            setUIMainColorThrottled(value);
          }}
        />
        <div {...stylex.props(styles.accentRow)}>
          <Button
            type="button"
            bSize="small"
            onClick={() => {
              SettingsAPI.setUIMainColor(DEFAULT_MAIN_COLOR)
                .then(invalidate)
                .catch(logAndNotifyError);
              SettingsAPI.applyUIMainColorToUI(DEFAULT_MAIN_COLOR);
            }}
          >{t`Reset`}</Button>
        </div>
      </Setting.Section>
      <Setting.Section>
        <Setting.Select
          label={t`Tracks density`}
          description={t`Change the tracks spacing`}
          value={config.track_view_density}
          onChange={(e) =>
            SettingsAPI.setTracksDensity(
              e.currentTarget.value as Config['track_view_density'],
            )
              .then(invalidate)
              .catch(logAndNotifyError)
          }
        >
          <option value="normal">
            <Trans>Normal (default)</Trans>
          </option>
          <option value="compact">
            <Trans>Compact</Trans>
          </option>
        </Setting.Select>
      </Setting.Section>
      <Setting.Section>
        <Setting.Select
          label={t`Default view`}
          value={config.default_view}
          description={t`Change the default view when starting the application`}
          onChange={(e) =>
            SettingsBridge.setDefaultView(e.currentTarget.value as DefaultView)
              .then(invalidate)
              .catch(logAndNotifyError)
          }
        >
          <option value="Library">
            <Trans>Library (default)</Trans>
          </option>
          <option value="Artists">
            <Trans>Artists</Trans>
          </option>
          <option value="Playlists">
            <Trans>Playlists</Trans>
          </option>
        </Setting.Select>
      </Setting.Section>
      <Setting.Section>
        <CheckboxSetting
          title={t`Display Notifications`}
          description={t`Send notifications when the playing track changes`}
          value={config.notifications}
          onChange={useInvalidateCallback(
            SettingsAPI.toggleDisplayNotifications,
          )}
        />
      </Setting.Section>
      <Setting.Section>
        <CheckboxSetting
          title={t`Sleep mode blocker`}
          description={t`Prevent the computer from going into sleep mode when playing`}
          value={config.sleepblocker}
          onChange={useInvalidateCallback((value: boolean) =>
            SettingsBridge.toggleSleepBlocker(value),
          )}
        />
      </Setting.Section>
    </>
  );
}

/**
 * Gallery order: System (__system) stays first as the default, then flavors.
 */
const GALLERY_ORDER = ['light', 'dark', 'dark-warm', 'amoled'];

const GALLERY_THEMES = Object.values(themes).sort(
  (a, b) => GALLERY_ORDER.indexOf(a._id) - GALLERY_ORDER.indexOf(b._id),
);

/**
 * Get the theme name in the current language
 */
export function getTranslatedThemeName(themeName: string) {
  switch (themeName) {
    case 'Light':
      return tMacro`Light`;
    case 'Dark':
      return tMacro`Dark`;
    case 'Dark Warm':
      return tMacro`Dark Warm`;
    case 'AMOLED':
      return tMacro`AMOLED`;
  }

  return themeName;
}

const styles = stylex.create({
  accentRow: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
  gallery: {
    display: 'flex',
    flexWrap: 'wrap',
    rowGap: 'var(--space-2)',
    columnGap: 'var(--space-2)',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    rowGap: 'var(--space-1)',
    columnGap: 'var(--space-1)',
    paddingTop: 'var(--space-2)',
    paddingBottom: 'var(--space-2)',
    paddingLeft: 'var(--space-3)',
    paddingRight: 'var(--space-3)',
    minWidth: '96px',
    minHeight: 'var(--row)',
    backgroundColor: 'var(--surface)',
    color: 'var(--text-dim)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--control-border)',
      ':hover': 'var(--accent)',
      ':focus-visible': 'var(--accent)',
    },
    borderRadius: 'var(--radius)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-medium)',
    cursor: 'pointer',
    boxSizing: 'border-box',
  },
  cardActive: {
    borderColor: 'var(--accent)',
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--accent-text)',
  },
  radio: {
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    accentColor: 'var(--accent)',
  },
  swatchRow: {
    display: 'flex',
    width: '100%',
    height: 'var(--space-5)',
    borderRadius: 'var(--radius-sm)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--control-border)',
    overflow: 'hidden',
  },
  swatch: {
    width: '33.3333%',
  },
});
