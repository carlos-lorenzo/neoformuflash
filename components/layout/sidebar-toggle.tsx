'use client';

// Client: writes the collapsed preference and re-renders the server shell.

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { setSidebarCollapsed } from '@/app/actions/preferences';

export function SidebarToggle({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations('nav');
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-expanded={!collapsed}
      aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
      onClick={() => {
        startTransition(async () => {
          await setSidebarCollapsed(!collapsed);
          // Manually removed the reload since it didn't make any sense. 
          // Even though a cookie is being set to save the user preference
          // Makes site unresponsive
          // If you're reading this and believe the change should be revoked, do so but argument it
          //window.location.reload();
        });
      }}
      className="duration-instant flex h-8 w-full items-center justify-center rounded-sm text-tertiary transition-colors ease-out hover:bg-inset hover:text-primary"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="size-4 icon-inline"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
        <path d="M6 2.5v11" />
      </svg>
    </button>
  );
}
