'use client';

// Client: owns the global keydown listener, scope stack, g-prefix state,
// and renders the overlay + indicator.

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { isMac } from './platform';
import type { Binding, GSecondKeyMap, Scope } from './types';
import { ShortcutOverlay } from '@/components/shortcut-overlay';
import { Kbd } from '@/components/ui/kbd';

/* ------------------------------------------------------------------ */
/*  Context                                                           */
/* ------------------------------------------------------------------ */

export type ShortcutContextValue = {
  register: (binding: Binding) => void;
  unregister: (id: string) => void;
  pushScope: (scope: Scope) => void;
  popScope: (scope: Scope) => void;
  activeScopes: Scope[];
  gPending: boolean;
  getBindings: () => Binding[];
  openOverlay: () => void;
};

export const ShortcutContext = createContext<ShortcutContextValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Editable-target check                                             */
/* ------------------------------------------------------------------ */

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  ) {
    return true;
  }
  if (target.isContentEditable) return true;
  // Walk up — a contenteditable might contain nested elements.
  return target.closest('[contenteditable="true"]') !== null;
}

/* ------------------------------------------------------------------ */
/*  Key matching helpers                                              */
/* ------------------------------------------------------------------ */

function matchesModifier(event: KeyboardEvent, keys: string): boolean {
  if (!keys.startsWith('mod+')) return false;
  /*
   * The DECLARED key is lowercased as well as the event's.
   *
   * Only the event side used to be normalised, so a binding declared with a
   * capital compared `event.key.toLowerCase()` ("m") against the literal "M"
   * and could never match. Every ⌘M / ⌘⇧M binding in the app was declared with a capital and
   * was therefore dead — silently, because MathEditorField also handles those
   * keys at the ProseMirror level, so math still worked whenever a field had
   * focus and the dead binding had nothing left to prove.
   *
   * Normalising here kills the whole class rather than the eight instances.
   */
  const keyPart = keys.slice(4).toLowerCase(); // e.g. "shift+enter" or "enter"
  const modifierHeld = isMac() ? event.metaKey : event.ctrlKey;

  if (!modifierHeld) return false;

  // Handle shift+modifier combinations
  if (keyPart.startsWith('shift+')) {
    const key = keyPart.slice(6);
    return event.shiftKey && event.key.toLowerCase() === key;
  }

  return event.key.toLowerCase() === keyPart;
}

function matchesBare(event: KeyboardEvent, keys: string): boolean {
  if (keys.startsWith('mod+')) return false;
  if (keys.includes('>')) return false; // g-prefix — handled separately
  return event.key === keys;
}

/* ------------------------------------------------------------------ */
/*  Provider                                                          */
/* ------------------------------------------------------------------ */

export type ShortcutProviderProps = {
  children: ReactNode;
  enabled: boolean;
  gSecondKeyMap: GSecondKeyMap;
};

export function ShortcutProvider({
  children,
  enabled,
  gSecondKeyMap,
}: ShortcutProviderProps) {
  /* ---- state that drives renders ---- */
  const [gPending, setGPending] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [activeScopes, setActiveScopes] = useState<Scope[]>(['global']);

  /* ---- refs for the keydown handler (no re-renders) ---- */
  const bindingsRef = useRef(new Map<string, Binding>());
  const scopeStackRef = useRef<Scope[]>(['global']);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  const gSecondKeyMapRef = useRef(gSecondKeyMap);
  const gPendingRef = useRef(gPending);

  // Keep refs in sync with latest values so the keydown handler
  // always reads current state without needing to re-attach.
  useEffect(() => {
    enabledRef.current = enabled;
    gSecondKeyMapRef.current = gSecondKeyMap;
    gPendingRef.current = gPending;
  });

  /* ---- helpers ---- */
  const clearGPending = useCallback(() => {
    if (gTimerRef.current) clearTimeout(gTimerRef.current);
    gTimerRef.current = null;
    setGPending(false);
  }, []);

  const register = useCallback((binding: Binding) => {
    bindingsRef.current.set(binding.id, binding);
  }, []);

  const unregister = useCallback((id: string) => {
    bindingsRef.current.delete(id);
  }, []);

  const pushScope = useCallback((scope: Scope) => {
    scopeStackRef.current = [...scopeStackRef.current, scope];
    setActiveScopes([...scopeStackRef.current]);
  }, []);

  const popScope = useCallback((scope: Scope) => {
    scopeStackRef.current = scopeStackRef.current.filter((s) => s !== scope);
    setActiveScopes([...scopeStackRef.current]);
  }, []);

  const getBindings = useCallback((): Binding[] => {
    return [...bindingsRef.current.values()];
  }, []);

  const openOverlay = useCallback(() => setOverlayOpen(true), []);

  /* ---- keydown handler (single attachment, reads from refs) ---- */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isModified = event.metaKey || event.ctrlKey || event.altKey;
      const enabled = enabledRef.current;
      const gPending = gPendingRef.current;
      const gSecondKeyMap = gSecondKeyMapRef.current;

      // Criterion 3: suppress bare-letter bindings when focus is in an
      // editable element. This check runs before anything else — it is
      // the single most common way keyboard shortcuts ship broken.
      //
      // `allowInEditable` is the explicit opt-out of that suppression: Escape
      // opts in (specs/shortcuts.md forbids only *bare letters* in editables,
      // and blocking Esc makes an editor impossible to dismiss by keyboard).
      // Record the editable context here and let the dispatch loop below skip
      // non-opted bindings, so an opted-in binding can still fire.
      const editableTarget = isEditableTarget(target) && !isModified;

      // Criterion 5: disabled setting suppresses bare-letter bindings.
      if (!enabled && !isModified) return;

      const key = event.key;

      // ---- g-prefix state machine ----
      if (gPending) {
        // If focus is in an editable between the g press and the second
        // key, the user is now typing — dismiss silently without firing.
        if (!isModified && !editableTarget) {
          const action = gSecondKeyMap[key];
          if (action) {
            event.preventDefault();
            action.onPress();
          }
        }
        clearGPending();
        // Fall through — modified bindings are handled below.
      }

      // ---- modified bindings (⌘K / Ctrl+K) ----
      if (isModified) {
        const bindings = bindingsRef.current;
        for (const binding of bindings.values()) {
          if (binding.requireModified && matchesModifier(event, binding.keys)) {
            event.preventDefault();
            binding.onPress();
            return;
          }
        }
        return; // Modified key with no match — pass through to browser.
      }

      // ---- bare-letter bindings ----
      const bindings = [...bindingsRef.current.values()];
      const mostSpecificScope = scopeStackRef.current.at(-1) ?? 'global';

      // Find the most-specific-scope binding that matches.
      for (let i = bindings.length - 1; i >= 0; i--) {
        const binding = bindings[i];
        if (!binding) continue;
        if (binding.requireModified) continue;
        if (!matchesBare(event, binding.keys)) continue;
        if (binding.scope === 'global' || binding.scope === mostSpecificScope) {
          // Inside an editable, only explicitly opted-in bindings may fire.
          if (editableTarget && !binding.allowInEditable) continue;
          event.preventDefault();
          binding.onPress();
          return;
        }
      }

      // ---- g-prefix: start the window (suppressed inside editables —
      // the user is typing, not navigating) ----
      if (key === 'g' && enabled && !editableTarget) {
        event.preventDefault();
        setGPending(true);
        gTimerRef.current = setTimeout(clearGPending, 1500);
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      if (gTimerRef.current) clearTimeout(gTimerRef.current);
    };
  }, [clearGPending]);

  /* ---- context value (stable reference) ---- */
  const ctx = useMemo<ShortcutContextValue>(
    () => ({
      register,
      unregister,
      pushScope,
      popScope,
      activeScopes,
      gPending,
      getBindings,
      openOverlay,
    }),
    [register, unregister, pushScope, popScope, activeScopes, gPending, getBindings, openOverlay]
  );

  return (
    <ShortcutContext.Provider value={ctx}>
      {children}
      <ShortcutOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} />
      {gPending ? <GPrefixIndicator /> : null}
    </ShortcutContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  G-prefix indicator                                                */
/* ------------------------------------------------------------------ */

function GPrefixIndicator() {
  return (
    <div
      aria-live="polite"
      // Identified explicitly: `[aria-live="polite"]` is not a name, and any
      // screen that grows a second live region (the dashboard's copy-link
      // confirmation did) makes a bare match ambiguous.
      data-g-prefix-indicator=""
      className="duration-fast fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-subtle bg-overlay px-3 py-2 shadow-overlay transition-opacity ease-out"
    >
      <Kbd keys={['g']} />
    </div>
  );
}
