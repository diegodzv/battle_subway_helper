export function TrainerNamesLine({ trainer }) {
  if (!trainer) return null;
  const names = trainer?.names && typeof trainer.names === "object" ? trainer.names : null;
  const order = ["en", "de", "fr", "it", "ja", "ko"];
  const parts = [];

  if (names) {
    for (const lang of order) {
      const val = names?.[lang];
      if (typeof val === "string" && val.trim()) parts.push({ lang, val: val.trim() });
    }
  }

  if (parts.length === 0) {
    const en = (trainer?.name_en ?? "").trim();
    if (en) parts.push({ lang: "en", val: en });
  }

  if (parts.length === 0) return null;

  return (
    <div className="trainerNamesLine muted">
      {parts.map((p, idx) => (
        <span key={`${p.lang}-${p.val}`} className="trainerNamePart">
          <span className="langTag mono">{p.lang.toUpperCase()}</span>
          <span className="mono trainerNameVal">{p.val}</span>
          {idx < parts.length - 1 ? <span className="sep">·</span> : null}
        </span>
      ))}
    </div>
  );
}
