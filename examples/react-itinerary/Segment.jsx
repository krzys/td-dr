import { Panel } from "./Panel.jsx";
import { Chip } from "./Chip.jsx";

const duration = (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

function Stop({ code, city, time, align }) {
  return (
    <div className="stop" style={{ alignItems: align }}>
      <span className="code">{code}</span>
      <span className="time">{time}</span>
      <span className="city">{city}</span>
    </div>
  );
}

export function Segment({ seg, label }) {
  return (
    <Panel title={label} className="segment">
      <div className="meta">
        <span>
          {seg.airline} · {seg.flight}
        </span>
        <span>{seg.date}</span>
      </div>
      <div className="route">
        <Stop code={seg.from.code} city={seg.from.city} time={seg.departs} align="flex-start" />
        <div className="duration" style={{ flexGrow: 1 }}>
          {duration(seg.minutes)}
        </div>
        <Stop code={seg.to.code} city={seg.to.city} time={seg.arrives} align="flex-end" />
      </div>
      <div className="chips">
        <Chip>{seg.cabin}</Chip>
        <Chip>Seat {seg.seat}</Chip>
      </div>
    </Panel>
  );
}
