import { Panel } from "./Panel.jsx";

export function Passengers({ passengers }) {
  return (
    <Panel title="Passengers">
      <ul className="pax">
        {passengers.map((p) => (
          <li key={p.name}>
            <span>{p.name}</span>
            <span className="type">
              {p.type} · {p.bag}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
