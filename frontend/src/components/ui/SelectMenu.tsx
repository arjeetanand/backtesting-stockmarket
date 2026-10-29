"use client";

import { Children, isValidElement, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";

type OptionProps = {
  value?: string | number;
  label?: string;
  disabled?: boolean;
  children?: ReactNode;
};

type SelectMenuProps = {
  id?: string;
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

function textContent(children: ReactNode): string {
  return Children.toArray(children).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (isValidElement<{ children?: ReactNode }>(child)) return textContent(child.props.children);
    return "";
  }).join("").trim();
}

function nextEnabledIndex(options: Array<{ disabled: boolean }>, start: number, direction: 1 | -1) {
  for (let index = start; index >= 0 && index < options.length; index += direction) {
    if (!options[index].disabled) return index;
  }
  return -1;
}

export default function SelectMenu({
  id,
  value,
  onChange,
  children,
  className = "",
  disabled = false,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
}: SelectMenuProps) {
  const generatedId = useId();
  const listboxId = `${id ?? generatedId}-options`;
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typeahead = useRef("");
  const typeaheadTimer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const options = Children.toArray(children).flatMap((child) => {
    if (!isValidElement<OptionProps>(child) || child.type !== "option") return [];
    const label = child.props.label ?? textContent(child.props.children);
    const optionValue = child.props.value === undefined ? label : String(child.props.value);
    return [{ value: optionValue, label, disabled: Boolean(child.props.disabled) }];
  });
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = options[selectedIndex];
  const isDisabled = disabled || options.length === 0;

  useEffect(() => {
    if (!open) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const updateMenuPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 8;
      const desiredHeight = Math.min(280, options.length * 38 + 10);
      const below = window.innerHeight - rect.bottom - margin;
      const above = rect.top - margin;
      const placeAbove = below < desiredHeight && above > below;
      const available = Math.max(90, Math.min(280, placeAbove ? above : below));
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - rect.width - margin));
      const top = placeAbove
        ? Math.max(margin, rect.top - Math.min(desiredHeight, available))
        : Math.min(rect.bottom + 4, window.innerHeight - available - margin);
      setMenuPosition({ top, left, width: Math.min(rect.width, window.innerWidth - margin * 2), maxHeight: available });
    };
    updateMenuPosition();
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open || !menuPosition || activeIndex < 0) return;
    document.getElementById(`${listboxId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listboxId, menuPosition, open]);

  useEffect(() => () => window.clearTimeout(typeaheadTimer.current), []);

  function openMenu(startIndex = selectedIndex, direction: 1 | -1 = 1) {
    const enabledIndex = startIndex >= 0 && !options[startIndex]?.disabled
      ? startIndex
      : nextEnabledIndex(options, startIndex < 0 ? 0 : startIndex, direction);
    setActiveIndex(enabledIndex);
    setMenuPosition(null);
    setOpen(true);
  }

  function choose(option: (typeof options)[number]) {
    if (option.disabled || isDisabled) return;
    onChange({ target: { value: option.value } });
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveActive(direction: 1 | -1) {
    const start = activeIndex < 0 ? (direction === 1 ? 0 : options.length - 1) : activeIndex + direction;
    const candidate = nextEnabledIndex(options, start, direction);
    if (candidate >= 0) setActiveIndex(candidate);
  }

  function handleTypeahead(character: string) {
    typeahead.current += character.toLocaleLowerCase();
    window.clearTimeout(typeaheadTimer.current);
    typeaheadTimer.current = window.setTimeout(() => { typeahead.current = ""; }, 600);
    const start = activeIndex >= 0 ? activeIndex + 1 : 0;
    const ordered = [...options.slice(start), ...options.slice(0, start)];
    const match = ordered.find((option) => !option.disabled && option.label.toLocaleLowerCase().startsWith(typeahead.current));
    if (!match) return;
    const index = options.indexOf(match);
    setActiveIndex(index);
    if (!open) choose(match);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key.length === 1 && event.key.trim() && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      if (!open) openMenu();
      handleTypeahead(event.key);
      return;
    }
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openMenu(event.key === "ArrowUp" ? options.length - 1 : selectedIndex, event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const index = event.key === "Home" ? nextEnabledIndex(options, 0, 1) : nextEnabledIndex(options, options.length - 1, -1);
      if (index >= 0) setActiveIndex(index);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (activeIndex >= 0) choose(options[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`bt-select-control${open ? " is-open" : ""}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        className={`bt-select-trigger ${className}`.trim()}
        disabled={isDisabled}
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          if (event.relatedTarget instanceof Node && !rootRef.current?.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <span className="bt-select-value">{selectedOption?.label ?? "Choose an option"}</span>
        <ChevronDown size={15} className="bt-select-chevron" aria-hidden="true" />
      </button>
      {open && menuPosition && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          className="bt-select-options"
          role="listbox"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width, maxHeight: menuPosition.maxHeight }}
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            const active = index === activeIndex;
            return (
              <div
                id={`${listboxId}-option-${index}`}
                key={`${option.value}-${index}`}
                role="option"
                aria-selected={selected}
                aria-disabled={option.disabled || undefined}
                className={`bt-select-option${active ? " is-active" : ""}${selected ? " is-selected" : ""}`}
                onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); choose(option); }}
                onMouseEnter={() => { if (!option.disabled) setActiveIndex(index); }}
              >
                <span>{option.label}</span>
                {selected && <Check size={14} aria-hidden="true" />}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
