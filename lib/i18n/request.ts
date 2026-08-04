import { getRequestConfig } from 'next-intl/server';
import { getActiveLocale } from './locale';

/*
 * next-intl's server request config. Note what is NOT here: any routing.
 * The locale never appears in a URL — it is resolved per request from the
 * signed-in profile, then a cookie, then Accept-Language. See lib/i18n/locale.ts.
 */
export default getRequestConfig(async () => {
  const locale = await getActiveLocale();

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
