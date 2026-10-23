import { useMemo, useState } from "react";
import { normalize } from "../../utils/text";

// Autocomplete input. `options` are { key, label, meta?, search? }; `search` defaults to `label`.
// Shows `value` while idle and the typed query while focused.
export function SearchSelect({ value, options, onSelect, placeholder, limit = 20, className = "searchInput", autoFocus }) {
  const [query, setQuery] = useState(null);

  const indexed = useMemo(
    () => options.map((o) => ({ ...o, norm: normalize(o.search ?? o.label) })),
    [options]
  );

  const matches = useMemo(() => {
    if (query == null) return [];
    const nq = normalize(query);
    if (!nq) return [];
    const starts = [];
    const contains = [];
    for (const o of indexed) {
      const i = o.norm.indexOf(nq);
      if (i === 0) starts.push(o);
      else if (i > 0) contains.push(o);
      if (starts.length >= limit) break;
    }
    return [...starts, ...contains].slice(0, limit);
  }, [indexed, query, limit]);

  function pick(option) {
    setQuery(null);
    onSelect(option);
  }

  return (
    <div className="searchBox">
      <input
        className={className}
        value={query ?? value ?? ""}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={() => setQuery("")}
        onBlur={() => setQuery(null)}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches.length > 0) pick(matches[0]);
          if (e.key === "Escape") e.currentTarget.blur();
        }}
      />
      {matches.length > 0 ? (
        <div className="dropdown dropdownAbove">
          {matches.map((o) => (
            <button
              key={o.key}
              className="dropdownItem"
              // mousedown fires before the input's blur, so the pick isn't lost
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
            >
              <div className="dropdownName">{o.label}</div>
              {o.meta ? <div className="dropdownMeta muted">{o.meta}</div> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
