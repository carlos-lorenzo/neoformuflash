import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/session';
import { getApiKeyStatus } from '@/lib/db/ai-keys';

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const res = await getApiKeyStatus(user.id);
  if (!res.ok) {
    return NextResponse.json({ error: res.code }, { status: 500 });
  }

  return NextResponse.json(res.value);
}