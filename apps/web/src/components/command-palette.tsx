"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { buildNavActions, buildNavSections, scoreNavMatch, type NavItem } from "@/lib/navigation";
import { NavIconGlyph } from "@/components/nav-icon";
import { IconArrowRight, IconSearch } from "@/components/icons";

/**
 * Jump anywhere from the keyboard: Ctrl/⌘ K, type a few letters, Enter.
 *
 * The dashboard has forty-odd pages behind a sidebar that scrolls on a laptop; someone on the
 * phone with a customer does not want to hunt for "Purchase attempts". The palette searches the
 * same navigation catalog the sidebar renders (lib/navigation.ts), so it can never offer a page
 * the caller is not allowed to see.
 */

type Row =
  | { kind: "page"; key: string; item: NavItem; section?: string; score: number }
  | { kind: "action"; key: string; label: string; href: string; hint: string; score: number };

const MAX_ROWS = 12;

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

/** The header's search button: shows the shortcut on devices that have a keyboard. */
export function CommandPaletteTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search pages and actions"
      aria-keyshortcuts="Control+K Meta+K"
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-obsidian-800 bg-obsidian-900 px-2.5 text-[13px] text-slate-400 transition-colors hover:border-obsidian-700 hover:text-slate-200"
    >
      <IconSearch size={15} />
      <span className="hidden sm:inline">Search…</span>
      <kbd className="hidden rounded border border-obsidian-700 bg-obsidian-950 px-1.5 font-sans text-[11px] text-slate-500 md:inline">⌘K</kbd>
    </button>
  );
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const rows = useMemo<Row[]>(() => {
    if (!user) return [];
    const sections = buildNavSections(user);
    const actions = buildNavActions(user);
    const q = query.trim();

    const pages: Row[] = sections.flatMap((section) =>
      section.items.map((item) => ({
        kind: "page" as const,
        key: item.href,
        item,
        section: section.title,
        score: scoreNavMatch(q, item, section.title),
      }))
    );
    const acts: Row[] = actions.map((action) => ({
      kind: "action" as const,
      key: `action:${action.id}`,
      label: action.label,
      href: action.href,
      hint: action.hint,
      score: scoreNavMatch(q, { href: action.href, label: action.label, icon: "dashboard", keywords: action.hint }),
    }));

    // No query: actions first (what you probably came to do), then the map in sidebar order.
    // With a query: best match first, ties in sidebar order — a stable sort keeps that.
    const all = q ? [...pages, ...acts] : [...acts, ...pages];
    return all
      .filter((row) => row.score > 0)
      .sort((a, b) => (q ? b.score - a.score : 0))
      .slice(0, q ? MAX_ROWS : 60);
  }, [user, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    // Focus after the dialog paints; focusing an element that is not yet in the tree does nothing.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open || !user) return null;

  const go = (row: Row) => {
    onClose();
    const href = row.kind === "page" ? row.item.href : row.href;
    if (row.kind === "page" && row.item.external) window.open(href, "_blank", "noopener");
    else router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[cursor];
      if (row) go(row);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 p-4 pt-[12vh]" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Go to page"
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-obsidian-700 bg-obsidian-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-obsidian-800 px-4">
          <IconSearch size={18} className="shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Where to? Type a page or an action…"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={rows[cursor] ? `${listId}-${cursor}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full bg-transparent text-[15px] text-white outline-none placeholder:text-slate-500"
          />
          <kbd className="hidden shrink-0 rounded border border-obsidian-700 px-1.5 text-[11px] text-slate-500 sm:inline">Esc</kbd>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">
            Nothing matches &ldquo;{query}&rdquo;. Try a section name like &ldquo;money&rdquo; or &ldquo;network&rdquo;.
          </p>
        ) : (
          <ul id={listId} ref={listRef} role="listbox" className="max-h-[55vh] overflow-y-auto py-2">
            {rows.map((row, i) => {
              const active = i === cursor;
              const base = `flex cursor-pointer items-center gap-3 px-4 py-2 text-sm ${active ? "bg-obsidian-800 text-white" : "text-slate-300"}`;
              return (
                <li
                  key={row.key}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={active}
                  className={base}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(row)}
                >
                  {row.kind === "page" ? (
                    <>
                      <span className={`shrink-0 ${active ? "text-brand-400" : "text-slate-500"}`}>
                        <NavIconGlyph name={row.item.icon} size={17} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{row.item.label}</span>
                      {row.section && <span className="shrink-0 text-xs text-slate-500">{row.section}</span>}
                    </>
                  ) : (
                    <>
                      <span className={`shrink-0 ${active ? "text-brand-400" : "text-slate-500"}`}>
                        <IconArrowRight size={17} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{row.label}</span>
                      <span className="shrink-0 text-xs text-slate-500">{row.hint}</span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center gap-4 border-t border-obsidian-800 px-4 py-2 text-[11px] text-slate-500">
          <span>
            <kbd className="rounded border border-obsidian-700 px-1">↑</kbd> <kbd className="rounded border border-obsidian-700 px-1">↓</kbd> to move
          </span>
          <span>
            <kbd className="rounded border border-obsidian-700 px-1">↵</kbd> to open
          </span>
        </div>
      </div>
    </div>
  );
}
