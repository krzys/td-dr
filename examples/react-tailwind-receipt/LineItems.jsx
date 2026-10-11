export function LineItems({ items, fmt }) {
  return (
    <div className="mt-8">
      <div className="flex border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span className="flex-1">Item</span>
        <span className="w-12 text-right">Qty</span>
        <span className="w-24 text-right">Price</span>
      </div>
      {items.map((it) => (
        <div key={it.sku} className="flex items-start border-b border-slate-100 py-4">
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">{it.name}</p>
            <p className="mt-1 text-sm text-slate-500">{it.variant}</p>
          </div>
          <span className="w-12 text-right text-sm text-slate-900/70">{it.qty}</span>
          <span className="w-24 text-right text-sm font-semibold">{fmt(it.qty * it.price)}</span>
        </div>
      ))}
    </div>
  );
}
