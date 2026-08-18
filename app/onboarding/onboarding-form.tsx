'use client';

/*
 * Client: the institution choice drives which degrees are available and whether
 * the free-text "other" field is shown, so this is genuinely interactive.
 */

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@neoformuflash/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { Degree, Institution } from '@/lib/db/institutions';
import { submitOnboarding, type OnboardingState } from './actions';
import { cn } from '@/lib/cn';

/** Sentinel for the "my university isn't listed" option. */
const OTHER = '__other__';

export type OnboardingFormProps = {
  suggestedName: string;
  locale: Locale;
  institutions: Institution[];
  labels: {
    displayName: string;
    displayNamePlaceholder: string;
    institution: string;
    institutionPlaceholder: string;
    institutionOther: string;
    institutionOtherLabel: string;
    institutionOtherHint: string;
    degree: string;
    degreePlaceholder: string;
    degreeEmpty: string;
    submit: string;
  };
  className?: string;
};

export function OnboardingForm({
  suggestedName,
  locale,
  institutions,
  labels,
  className,
}: OnboardingFormProps) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    submitOnboarding,
    { errors: {} }
  );

  const [institutionId, setInstitutionId] = useState('');
  const [degreeId, setDegreeId] = useState('');
  const [degrees, setDegrees] = useState<Degree[]>([]);

  const isOther = institutionId === OTHER;

  /*
   * Clearing the previous institution's degrees belongs in the event handler,
   * not in the effect. Doing it in the effect body triggers a second render
   * pass on every change for state React already had the information to set.
   * The effect is left doing only what it is for: talking to an external system.
   */
  function chooseInstitution(next: string) {
    setInstitutionId(next);
    setDegreeId('');
    setDegrees([]);
  }

  useEffect(() => {
    if (!institutionId || isOther) return;

    let cancelled = false;
    void fetch(`/api/degrees?institutionId=${encodeURIComponent(institutionId)}`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Degree[]) => {
        if (!cancelled) setDegrees(data);
      })
      .catch(() => {
        // A degree is optional, so a failure here must not block signup.
      });

    return () => {
      cancelled = true;
    };
  }, [institutionId, isOther]);

  /** Translate a catalog key returned by the server action. */
  const message = (key: string | undefined) => (key ? t(key) /* i18n-dynamic-key */ : undefined);

  return (
    <form action={formAction} className={cn('flex flex-col gap-4', className)}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="institutionId" value={isOther ? '' : institutionId} />
      <input type="hidden" name="degreeId" value={isOther ? '' : degreeId} />

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

      <Select
        label={labels.institution}
        placeholder={labels.institutionPlaceholder}
        emptyLabel={labels.institutionPlaceholder}
        value={institutionId}
        onValueChange={chooseInstitution}
        error={message(state.errors['institutionId'])}
        options={[
          ...institutions.map((institution) => ({
            value: institution.id,
            label: institution.name,
          })),
          { value: OTHER, label: labels.institutionOther },
        ]}
      />

      {isOther ? (
        <Input
          name="institutionOther"
          label={labels.institutionOtherLabel}
          hint={labels.institutionOtherHint}
          maxLength={120}
          required
          error={message(state.errors['institutionOther'])}
        />
      ) : (
        <Select
          label={labels.degree}
          placeholder={labels.degreePlaceholder}
          emptyLabel={labels.degreeEmpty}
          value={degreeId}
          onValueChange={setDegreeId}
          error={message(state.errors['degreeId'])}
          options={degrees.map((degree) => ({ value: degree.id, label: degree.name }))}
        />
      )}

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
