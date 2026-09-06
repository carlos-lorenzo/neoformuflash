'use client';

/*
 * Client: both fields are type-ahead comboboxes backed by an API call, and the
 * submit drives a server action through useActionState.
 *
 * Both university and degree are OPTIONAL and INDEPENDENT. The previous version
 * coupled them — a <Select> of 27 Spanish universities, then a second <Select>
 * of that university's degrees — so a student outside the list had to find an
 * "other" option which then hid the degree field entirely. That was the reason
 * people could not finish creating an account.
 */

import { useActionState, useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@neoformuflash/contracts';
import { INSTITUTION_MAX, DEGREE_MAX } from '@neoformuflash/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { submitOnboarding, type OnboardingState } from './actions';
import { cn } from '@/lib/cn';

export type OnboardingFormProps = {
  suggestedName: string;
  locale: Locale;
  labels: {
    displayName: string;
    displayNamePlaceholder: string;
    institution: string;
    institutionPlaceholder: string;
    institutionHint: string;
    degree: string;
    degreePlaceholder: string;
    degreeHint: string;
    noResults: string;
    submit: string;
  };
  className?: string;
};

export function OnboardingForm({ suggestedName, locale, labels, className }: OnboardingFormProps) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    submitOnboarding,
    { errors: {} }
  );

  const [institutionName, setInstitutionName] = useState('');
  const [degreeText, setDegreeText] = useState('');

  /*
   * Suggestions only. Whatever is typed is submitted verbatim; the server
   * resolves it to an existing institution or creates one. A failed lookup
   * returns [] rather than throwing, so the field keeps working offline.
   */
  const searchInstitutions = useCallback(async (query: string): Promise<ComboboxOption[]> => {
    try {
      const response = await fetch(`/api/institutions?q=${encodeURIComponent(query)}`);
      if (!response.ok) return [];
      return (await response.json()) as ComboboxOption[];
    } catch {
      return [];
    }
  }, []);

  /** Translate a catalog key returned by the server action. */
  const message = (key: string | undefined) => (key ? t(key) /* i18n-dynamic-key */ : undefined);

  return (
    <form action={formAction} className={cn('flex flex-col gap-4', className)}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="institutionName" value={institutionName} />
      <input type="hidden" name="degreeText" value={degreeText} />

      <Input
        name="displayName"
        label={labels.displayName}
        placeholder={labels.displayNamePlaceholder}
        defaultValue={suggestedName}
        required
        maxLength={80}
        autoComplete="name"
        error={message(state.errors['displayName'])}
      />

      <Combobox
        label={labels.institution}
        placeholder={labels.institutionPlaceholder}
        hint={labels.institutionHint}
        noResultsLabel={labels.noResults}
        value={institutionName}
        onValueChange={setInstitutionName}
        onSearch={searchInstitutions}
        maxLength={INSTITUTION_MAX}
        error={message(state.errors['institutionName'])}
      />

      {/*
        Degree has no suggestion source on purpose. It is free text on the
        profile, and building suggestions from other users' degrees would be a
        cross-user enumeration surface — see lib/db/institutions.ts.
      */}
      <Input
        label={labels.degree}
        placeholder={labels.degreePlaceholder}
        hint={labels.degreeHint}
        value={degreeText}
        onChange={(event) => setDegreeText(event.target.value)}
        maxLength={DEGREE_MAX}
        autoComplete="off"
        error={message(state.errors['degreeText'])}
      />

      {state.errors['form'] ? (
        <p role="alert" className="text-ui-sm text-danger">
          {message(state.errors['form'])}
        </p>
      ) : null}

      <Button type="submit" variant="primary" loading={pending} className="mt-2 w-full">
        {labels.submit}
      </Button>
    </form>
  );
}
