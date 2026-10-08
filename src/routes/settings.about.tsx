import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, useLoaderData } from '@tanstack/react-router';

import * as Setting from '../components/Setting';
import ExternalButton from '../elements/ExternalButton';
import ExternalLink from '../elements/ExternalLink';
import Flexbox from '../elements/Flexbox';
import Heart from '../elements/Heart';

export const Route = createFileRoute('/settings/about')({
  component: ViewSettingsAbout,
});

function ViewSettingsAbout() {
  const { version, tauriVersion, appStorageDir } = useLoaderData({
    from: '/settings',
  });

  const { t } = useLingui();

  return (
    <>
      <Setting.Section>
        <Setting.Title>
          <Trans>About Slowburn</Trans>
        </Setting.Title>
        <Setting.Description>
          Slowburn {version}
          {' - '}
          <ExternalLink href="https://museeks.io" type="url">
            museeks.io
          </ExternalLink>
          {' - '}
          <ExternalLink
            href={`https://github.com/martpie/museeks/releases/tag/${version}`}
            type="url"
          >{t`release notes`}</ExternalLink>
        </Setting.Description>
      </Setting.Section>
      <Setting.Section>
        <Setting.Title>
          <Trans>Contributors</Trans>
        </Setting.Title>
        <Setting.Description>
          <Trans>
            Made with <Heart /> by Pierre de la Martinière (
            <ExternalLink href="https://martpie.io" type="url">
              martpie.io
            </ExternalLink>
            ) and a bunch of{' '}
            <ExternalLink
              href="https://github.com/martpie/museeks/graphs/contributors"
              type="url"
            >
              great people
            </ExternalLink>
          </Trans>
          .
        </Setting.Description>
      </Setting.Section>
      <Setting.Section>
        <Setting.Title>
          <Trans>Report issue / Ask for a feature</Trans>
        </Setting.Title>
        <Setting.Description>
          <Trans>
            Bugs happen. Please, do not hesitate to report them or to ask for
            features you would like to see, using the{' '}
            <ExternalLink
              href="http://github.com/martpie/Museeks/issues"
              type="url"
            >
              issue tracker
            </ExternalLink>
            .
          </Trans>
        </Setting.Description>
      </Setting.Section>
      <Setting.Section>
        <Setting.Title>
          <Trans>Internals</Trans>
        </Setting.Title>
        <Setting.Description>Tauri {tauriVersion}</Setting.Description>
        <Flexbox gap={4}>
          <ExternalButton href={appStorageDir} type="filedir">
            {t`Open storage directory`}
          </ExternalButton>
        </Flexbox>
      </Setting.Section>
    </>
  );
}
