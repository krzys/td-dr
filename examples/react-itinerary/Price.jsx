import { Panel } from "./Panel.jsx";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export function Price({ lines }) {
  const taxes = lines.filter((l) => l.tax).reduce((n, l) => n + l.amount, 0);
  const subtotal = lines.filter((l) => !l.tax).reduce((n, l) => n + l.amount, 0);
  const rows = [
    ...lines.filter((l) => !l.tax).map((l) => [l.label, l.amount]),
    ["Subtotal", subtotal],
    ["Taxes and charges", taxes],
  ];
  return (
    <Panel title="Price breakdown">
      {rows.map(([label, amount]) => (
        <div className="price-row" key={label} style={label === "Subtotal" ? { fontWeight: 700 } : undefined}>
          <span>{label}</span>
          <span>{gbp.format(amount)}</span>
        </div>
      ))}
      <div className="price-row total">
        <span>Total paid</span>
        <span>{gbp.format(subtotal + taxes)}</span>
      </div>
    </Panel>
  );
}
