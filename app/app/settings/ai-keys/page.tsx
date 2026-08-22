import { getSessionUser } from '@/lib/supabase/session';
import { getApiKeyStatus, listAiJobs } from '@/lib/db/ai-keys';
import { ApiKeyForm } from '@/components/ai/api-key-form';
import { AiJobList } from '@/components/ai/ai-job-list';
import { redirect } from 'next/navigation';
import { saveApiKeyAction, deleteApiKeyAction, refreshApiKeyAction } from './actions';
import { getTranslations } from 'next-intl/server';

export default async function AiKeysSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const [keysRes, jobsRes] = await Promise.all([
    getApiKeyStatus(user.id),
    listAiJobs(user.id),
  ]);

  const keys = keysRes.ok ? keysRes.value : [];
  const jobs = jobsRes.ok ? jobsRes.value : [];

  // Check pro status for the phase-06 pooled-key hint
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_pro')
    .eq('id', user.id)
    .maybeSingle();

  const isPro = profile?.is_pro ?? false;

  const t = await getTranslations('ai.keys');

  return (
    <div className="container mx-auto px-4 py-8 max-w-measure">
      <header className="mb-8">
        <h1 className="text-read-h1 font-semibold">{t('title')}</h1>
        <p className="text-tertiary mt-1">{t('description')}</p>
      </header>

      <section className="mb-12">
        <h2 className="text-ui-lg font-medium mb-4">{t('storedKeys')}</h2>
        <ApiKeyForm
          existingKeys={keys}
          onSave={saveApiKeyAction}
          onDelete={deleteApiKeyAction}
          onRefresh={refreshApiKeyAction}
          isPro={isPro}
        />
      </section>

      <section>
        <h2 className="text-ui-lg font-medium mb-4">{t('recentActivity')}</h2>
        <AiJobList jobs={jobs} />
      </section>
    </div>
  );
}