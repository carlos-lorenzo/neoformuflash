/*
 * Fixture: a file with a t() call whose key comes from a variable, annotated
 * i18n-dynamic-key. This must NOT count as an unresolvable site — the comment
 * is the acknowledged escape hatch.
 */
export function DynamicKey() {
  const t = useTranslations('review');
  return t(choice); // i18n-dynamic-key
}
