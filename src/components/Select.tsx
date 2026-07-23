"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectProps = {
  options: SelectOption[];
  /** Controlled value. Omit for uncontrolled (use defaultValue). */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Renders a hidden input so the value submits with a surrounding <form>. */
  name?: string;
  /** Shown when nothing is selected and no option matches the current value. */
  placeholder?: string;
  disabled?: boolean;
  /** Best-effort: kept for parity; native validation lives server-side. */
  required?: boolean;
  className?: string;
  "aria-label"?: string;
};

/**
 * The app's own combobox — a native <select> can't be styled consistently
 * across browsers, so this replaces every one. Focus stays on the trigger
 * button (WAI-ARIA "select-only combobox" pattern); the listbox is portalled to
 * <body> and positioned with fixed coordinates so it never clips inside a panel,
 * modal, or the quick-picker overlay. Supports keyboard (arrows, Home/End,
 * type-ahead, Enter/Escape), mouse, and controlled or uncontrolled use.
 */
export function Select({
  options,
  value,
  defaultValue,
  onChange,
  name,
  placeholder,
  disabled,
  required,
  className,
  "aria-label": ariaLabel,
}: SelectProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const selected = isControlled ? value : internal;

  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [flip, setFlip] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ str: "", at: 0 });
  const listId = useId();

  const selectedIdx = options.findIndex((o) => o.value === selected);
  const selectedOption = selectedIdx >= 0 ? options[selectedIdx] : null;

  const commit = useCallback(
    (next: string) => {
      if (!isControlled) setInternal(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );

  const position = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect(r);
    // Flip above when there isn't room below for a reasonable menu.
    const below = window.innerHeight - r.bottom;
    setFlip(below < 240 && r.top > below);
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    position();
    setActiveIdx(selectedIdx >= 0 ? selectedIdx : 0);
    setOpen(true);
  }, [disabled, position, selectedIdx]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Reposition while open; close on outside pointer / resize / scroll-away.
  useLayoutEffect(() => {
    if (!open) return;
    position();
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const onScrollResize = () => position();
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("resize", onScrollResize);
    window.addEventListener("scroll", onScrollResize, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("resize", onScrollResize);
      window.removeEventListener("scroll", onScrollResize, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open, position]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open) return;
    const node = menuRef.current?.querySelector<HTMLElement>(
      `[data-idx="${activeIdx}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [open, activeIdx]);

  const step = useCallback(
    (dir: 1 | -1) => {
      setActiveIdx((i) => {
        let next = i;
        for (let n = 0; n < options.length; n++) {
          next = (next + dir + options.length) % options.length;
          if (!options[next]?.disabled) return next;
        }
        return i;
      });
    },
    [options],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;

    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    // Menu open — these keys belong to the select; don't let a parent form
    // submit (Enter) or a parent overlay close (Escape).
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        e.stopPropagation();
        if (!options[activeIdx]?.disabled) {
          commit(options[activeIdx].value);
          close();
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        step(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        step(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIdx(options.findIndex((o) => !o.disabled));
        break;
      case "End":
        e.preventDefault();
        setActiveIdx(
          options.length - 1 - [...options].reverse().findIndex((o) => !o.disabled),
        );
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        // Type-ahead: jump to the next option whose label starts with the typed
        // run of characters.
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const now = Date.now();
          const ta = typeahead.current;
          ta.str = now - ta.at > 800 ? e.key : ta.str + e.key;
          ta.at = now;
          const q = ta.str.toLowerCase();
          const hit = options.findIndex(
            (o) => !o.disabled && o.label.toLowerCase().startsWith(q),
          );
          if (hit >= 0) setActiveIdx(hit);
        }
    }
  }

  const label = selectedOption?.label ?? placeholder ?? "Select…";
  const showingPlaceholder = !selectedOption;

  return (
    <>
      {name && <input type="hidden" name={name} value={selected} required={required} />}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        data-placeholder={showingPlaceholder}
        disabled={disabled}
        className={`field select-trigger${className ? ` ${className}` : ""}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="select-value">{label}</span>
        <svg
          className="select-caret"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className="select-menu"
            style={{
              left: rect.left,
              width: rect.width,
              ...(flip
                ? { bottom: window.innerHeight - rect.top + 4 }
                : { top: rect.bottom + 4 }),
            }}
          >
            {options.map((o, i) => (
              <div
                key={o.value || `opt-${i}`}
                role="option"
                aria-selected={o.value === selected}
                data-idx={i}
                data-active={i === activeIdx}
                data-disabled={o.disabled || undefined}
                className="select-option"
                onMouseEnter={() => !o.disabled && setActiveIdx(i)}
                onMouseDown={(e) => {
                  // Keep focus on the trigger; prevent the button's blur.
                  e.preventDefault();
                }}
                onClick={() => {
                  if (o.disabled) return;
                  commit(o.value);
                  close();
                }}
              >
                <span className="select-value">{o.label}</span>
                <svg
                  className="select-check"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M5 12l5 5L20 6"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
