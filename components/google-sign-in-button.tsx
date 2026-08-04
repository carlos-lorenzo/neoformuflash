'use client';

/*
 * Client: the OAuth redirect must start in the browser so the Supabase client
 * can store the PKCE code verifier in local storage. Kicking it off from the
 * server would leave nothing to exchange the code against at the callback.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function GoogleSignInButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="primary"
      className="w-full"
      loading={pending}
      loadingLabel={label}
      onClick={async () => {
        setPending(true);
        const supabase = createSupabaseBrowserClient();

        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });

        if (error) {
          setPending(false);
          router.push('/login?error=oauth');
        }
      }}
    >
      <GoogleMark />
      {label}
    </Button>
  );
}

/* refs/06-auth: the brand mark sits on the left axis, the label stays centred. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-4 shrink-0" fill="currentColor">
      <path d="M9 7.2v3.5h4.9a4.2 4.2 0 0 1-1.8 2.8l2.9 2.2c1.7-1.6 2.7-3.9 2.7-6.7 0-.6-.05-1.2-.16-1.8H9z" />
      <path d="M4 10.7 3.3 11.2 1 13a9 9 0 0 0 8 5c2.4 0 4.5-.8 6-2.2l-2.9-2.2A5.4 5.4 0 0 1 4 10.7z" />
      <path d="M1 5a9 9 0 0 0 0 8l3-2.3a5.4 5.4 0 0 1 0-3.4z" />
      <path d="M9 3.6c1.3 0 2.5.5 3.5 1.4l2.6-2.6A9 9 0 0 0 1 5l3 2.3A5.4 5.4 0 0 1 9 3.6z" />
    </svg>
  );
}
