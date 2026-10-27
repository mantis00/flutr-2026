"use client";

import { useEffect } from "react";

const MESSAGE = "You have unsaved changes. Leave without saving?";

/**
 * Ask before discarding unsaved work.
 *
 * Exported so controls that change state without a navigation — tab switches,
 * wizard steps — can prompt with the same wording as the hook.
 */
export function confirmDiscardUnsavedChanges(): boolean {
  return window.confirm(MESSAGE);
}

export interface LeavingClick {
  /** `MouseEvent.button` — only a primary click navigates. */
  button: number;
  /** Any of ctrl/meta/shift/alt, which open the link elsewhere. */
  modifierKey: boolean;
  defaultPrevented: boolean;
  /** Whether the click landed inside an `a[href]`. */
  isLink: boolean;
  /** The link's `target` attribute. */
  linkTarget?: string | null;
  href?: string | null;
}

/**
 * Whether a click is about to take the user away from their unsaved work.
 *
 * Split out from the hook so the branches are testable without a DOM.
 */
export function isLeavingClick(click: LeavingClick): boolean {
  if (click.defaultPrevented || click.button !== 0 || click.modifierKey) return false;
  if (!click.isLink) return false;
  // A new tab or window leaves this page — and its form — intact.
  if (click.linkTarget && click.linkTarget !== "_self") return false;
  // Same-page jumps don't unmount anything.
  if (click.href?.startsWith("#")) return false;

  return true;
}

/**
 * Warn before unsaved work is lost.
 *
 * Covers the browser's own `beforeunload` prompt for reloads, closes, and
 * typed-in URLs, plus a capture-phase click guard for in-app links, which are
 * client-side and never fire `beforeunload`.
 *
 * Controls that swap content without navigating — Radix tabs, for one — are
 * not clicks this can judge, since they also respond to arrow keys. Those own
 * their guard via `confirmDiscardUnsavedChanges()` in their change handler.
 *
 * ponytail: browser Back/Forward is not covered — `popstate` fires after the
 * entry has already changed and isn't cancelable, and the App Router has no
 * navigation-blocking API. Blocking it needs a sentinel history entry, which
 * leaves the Back button one press out of step for the rest of the session.
 */
export function useUnsavedChangesWarning(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Chrome still needs returnValue set to show its prompt.
      event.returnValue = "";
    }

    function handleClick(event: MouseEvent) {
      const anchor = (event.target as HTMLElement | null)?.closest("a[href]") ?? null;

      const leaving = isLeavingClick({
        button: event.button,
        modifierKey: event.ctrlKey || event.metaKey || event.shiftKey || event.altKey,
        defaultPrevented: event.defaultPrevented,
        isLink: !!anchor,
        linkTarget: anchor?.getAttribute("target"),
        href: anchor?.getAttribute("href"),
      });

      if (!leaving || confirmDiscardUnsavedChanges()) return;

      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    // Capture phase, so this runs before Link handles the click.
    document.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [enabled]);
}
