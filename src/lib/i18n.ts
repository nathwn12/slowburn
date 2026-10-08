import { i18n } from '@lingui/core';

import { messages } from '../translations/en.po';

export async function loadTranslation() {
  i18n.load('en', messages);
  i18n.activate('en');
}
