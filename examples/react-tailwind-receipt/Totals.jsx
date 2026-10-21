export function Totals({ items, shipping, discount, taxRate, fmt }) {
  const subtotal = items.reduce((n, it) => n + it.qty * it.price, 0);
  const tax = Math.round((subtotal - discount.amount) * taxRate * 100) / 100;
  const total = subtotal - discount.amount + shipping + tax;
  const rows = [
    ["Subtotal", fmt(subtotal)],
    [`Discount (${discount.code})`, `-${fmt(discount.amount)}`],
    ["Shipping", fmt(shipping)],
    ["Tax", fmt(tax)],
  ];
  return (
    <div className="mt-6 rounded-xl bg-indigo-600/10 p-5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between py-1 text-sm text-slate-900/70">
          <span>{label}</span>
          <span>{value}</span>
        </div>
      ))}
      <div className="mt-3 flex justify-between border-t border-indigo-600/20 pt-3 text-base font-semibold text-slate-900">
        <span>Total</span>
        <span>{fmt(total)}</span>
      </div>
    </div>
  );
}
