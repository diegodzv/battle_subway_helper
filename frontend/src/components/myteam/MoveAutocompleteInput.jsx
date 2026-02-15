import { useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { formatBPAcc, normalizeKey, prettyMoveNameFromSlug } from "../../utils/poke";
import { TypeBadge } from "../common/TypeBadge";

export function MoveAutocompleteInput({ value, onChangeText, onPickSlug, moveDex, placeholder }) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounced = useDebouncedValue(value, 80);
  const boxRef = useRef(null);

  const suggestions = useMemo(() => {
    if (!moveDex || typeof moveDex !== "object") return [];
    const qRaw = normalizeKey(debounced);
    if (!qRaw) return [];

    const q = qRaw.replace(/\s+/g, " ").trim();
    const qHy = q.replace(/\s+/g, "-");
    const out = [];

    const keys = Object.keys(moveDex);
    for (const slug of keys) {
      const pretty = normalizeKey(prettyMoveNameFromSlug(slug));
      const slugNorm = normalizeKey(slug);

      const hit = slugNorm.includes(q) || slugNorm.includes(qHy) || pretty.includes(q);
      if (hit) out.push(slug);
      if (out.length >= 12) break;
    }
    return out;
  }, [debounced, moveDex]);

  useEffect(() => {
    function onDocClick(e) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const show = (focused || open) && suggestions.length > 0;

  return (
    <div className="miniAutocomplete" ref={boxRef}>
      <input
        className="myInput myInputSmall myMoveNameInput"
        value={value}
        onChange={(e) => {
          onChangeText(e.target.value);
          setOpen(true);
        }}
        placeholder={placeholder}
        onFocus={() => {
          setFocused(true);
          setOpen(true);
        }}
        onBlur={() => setFocused(false)}
        autoComplete="off"
      />

      {show ? (
        <div className="dropdown dropdownAbove moveDropdown">
          {suggestions.map((slug) => {
            const entry = moveDex?.[slug] ?? null;
            const label = prettyMoveNameFromSlug(slug) ?? slug;
            const type = entry?.type ?? null;
            const bpacc = formatBPAcc(entry);

            return (
              <button
                key={slug}
                className="dropdownItem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPickSlug(slug, label);
                  setOpen(false);
                }}
                title={slug}
              >
                <div className="dropdownName" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <TypeBadge type={type} />
                  <span className="mono">{label}</span>
                </div>
                <div className="dropdownMeta muted">
                  <span className="mono">{bpacc}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
