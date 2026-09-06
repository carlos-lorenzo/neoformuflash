/*
 * Link styled as a button for the marketing surface.
 *
 * The app's buttons are <button>s (components/ui/button.tsx); the marketing
 * CTAs navigate, so they are <a>s wearing the exact same token classes — same
 * accent fill, same hairline secondary, same 44px target (§7, AC 6). One
 * variant string, kept beside the Button source so a token change lands in
 * both places.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { cn } from '@/lib/cn';

type CtaLinkProps = {
  href: Route;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
  children: React.ReactNode;
};

const BASE =
  'inline-flex h-11 items-center justify-center gap-2 rounded-md px-3 text-ui-base font-medium transition-colors duration-instant ease-out';

const VARIANTS = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'border border-subtle bg-transparent text-primary hover:border-strong hover:bg-raised',
  ghost: 'bg-transparent text-secondary hover:bg-raised hover:text-primary',
} as const;

export function CtaLink({ href, variant = 'primary', className, children }: CtaLinkProps) {
  return (
    <Link href={href} className={cn(BASE, VARIANTS[variant], className)}>
      {children}
    </Link>
  );
}
