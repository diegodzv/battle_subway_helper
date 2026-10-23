import { WEATHERS } from "../../calc/engine";

function Toggle({ label, checked, onChange, title }) {
  return (
    <label className={`calcToggle ${checked ? "calcToggleOn" : ""}`} title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function SideConditions({ title, side, doubles, onChange }) {
  return (
    <div className="calcSideCol">
      <div className="h3">{title}</div>
      <div className="calcToggleWrap">
        <Toggle label="Reflect" checked={side.isReflect} onChange={(v) => onChange({ isReflect: v })} />
        <Toggle label="Light Screen" checked={side.isLightScreen} onChange={(v) => onChange({ isLightScreen: v })} />
        <Toggle label="Tailwind" checked={side.isTailwind} onChange={(v) => onChange({ isTailwind: v })} />
        <Toggle label="Stealth Rock" checked={side.isSR} onChange={(v) => onChange({ isSR: v })} />
        <Toggle
          label="Leech Seed"
          checked={side.isSeeded}
          onChange={(v) => onChange({ isSeeded: v })}
          title="Counted in the KO chance"
        />
        {doubles ? (
          <>
            <Toggle label="Helping Hand" checked={side.isHelpingHand} onChange={(v) => onChange({ isHelpingHand: v })} />
            <Toggle label="Friend Guard" checked={side.isFriendGuard} onChange={(v) => onChange({ isFriendGuard: v })} />
          </>
        ) : null}
        <label className="calcField calcSpikes">
          <span className="muted">Spikes</span>
          <select className="calcSelect" value={side.spikes} onChange={(e) => onChange({ spikes: Number(e.target.value) })}>
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export function FieldPanel({ field, setField }) {
  const doubles = field.gameType === "Doubles";
  const patch = (p) => setField((f) => ({ ...f, ...p }));
  const patchSide = (key, p) => setField((f) => ({ ...f, sides: { ...f.sides, [key]: { ...f.sides[key], ...p } } }));

  return (
    <section className="panel">
      <div className="panelTitle">
        <div className="h2">Field</div>
        <div className="calcSegmented">
          {["Singles", "Doubles"].map((g) => (
            <button
              key={g}
              className={`calcSegment ${field.gameType === g ? "calcSegmentOn" : ""}`}
              onClick={() => patch({ gameType: g })}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="calcFieldBoth">
        <div className="calcToggleWrap calcCenterWrap">
          {WEATHERS.map((w) => (
            <button
              key={w || "none"}
              className={`calcSegment ${field.weather === w ? "calcSegmentOn" : ""}`}
              onClick={() => patch({ weather: w })}
            >
              {w || "No weather"}
            </button>
          ))}
        </div>
        <div className="calcToggleWrap calcCenterWrap">
          <Toggle label="Gravity" checked={field.isGravity} onChange={(v) => patch({ isGravity: v })} />
          <Toggle label="Magic Room" checked={field.isMagicRoom} onChange={(v) => patch({ isMagicRoom: v })} />
          <Toggle label="Wonder Room" checked={field.isWonderRoom} onChange={(v) => patch({ isWonderRoom: v })} />
        </div>
      </div>

      <div className="calcSides">
        <SideConditions
          title="Your side"
          side={field.sides.mine}
          doubles={doubles}
          onChange={(p) => patchSide("mine", p)}
        />
        <div className="calcSideDivider" />
        <SideConditions
          title="Rival side"
          side={field.sides.enemy}
          doubles={doubles}
          onChange={(p) => patchSide("enemy", p)}
        />
      </div>
    </section>
  );
}
