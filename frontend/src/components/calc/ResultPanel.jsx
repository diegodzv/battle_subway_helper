import { useEffect, useState } from "react";

function MoveList({ title, results, side, selected, onSelect }) {
  return (
    <div className="calcResultCol">
      <div className="muted calcResultColTitle">{title}</div>
      {results.map((r, i) =>
        r ? (
          <button
            key={i}
            className={`calcResultItem ${selected.side === side && selected.index === i ? "calcResultItemOn" : ""}`}
            onClick={() => onSelect({ side, index: i })}
          >
            <span>{r.moveName}</span>
            <span className="mono muted">{r.short}</span>
          </button>
        ) : null
      )}
    </div>
  );
}

// mine/enemy: arrays of 4 { moveName, desc, short } | null
export function ResultPanel({ mine, enemy, selected, onSelect, emptyHint }) {
  const [copied, setCopied] = useState(false);
  const current = (selected.side === "mine" ? mine : enemy)[selected.index] ?? null;

  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.desc);
      setCopied(true);
    } catch {
      // clipboard blocked (insecure context / permissions): nothing to do
    }
  }

  const hasAny = mine.some(Boolean) || enemy.some(Boolean);

  return (
    <section className="panel">
      <div className="panelTitle">
        <div className="h2">Damage</div>
        <div className="muted">{copied ? "Copied ✓" : current ? "Click the result to copy it" : null}</div>
      </div>

      {current ? (
        <button className={`calcResultMain mono ${copied ? "calcResultCopied" : ""}`} onClick={copy}>
          {current.desc}
        </button>
      ) : (
        <div className="muted calcResultEmpty">{emptyHint}</div>
      )}

      {hasAny ? (
        <div className="calcResultLists">
          <MoveList title="Your moves" results={mine} side="mine" selected={selected} onSelect={onSelect} />
          <MoveList title="Rival moves" results={enemy} side="enemy" selected={selected} onSelect={onSelect} />
        </div>
      ) : null}
    </section>
  );
}
