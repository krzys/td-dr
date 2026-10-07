import { Badge } from "./Badge.jsx";
import "./hello.css";

export default function Hello({ name, items }) {
  return (
    <div className="card">
      <img src="https://example.com/logo.png" width="40" height="40" alt="" />
      <h1 className="title">Hello {name}</h1>
      {items.map((i) => (
        <p key={i}>{i}</p>
      ))}
      <Badge />
    </div>
  );
}
