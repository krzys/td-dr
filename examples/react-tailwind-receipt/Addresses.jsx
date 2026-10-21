function Address({ title, name, lines }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-sm/6 font-semibold text-slate-900">{name}</p>
      {lines.map((l) => (
        <p key={l} className="text-sm/6 text-slate-600">
          {l}
        </p>
      ))}
    </div>
  );
}

export function Addresses({ shipTo, billTo }) {
  return (
    <div className="mt-10 grid grid-cols-2 gap-6 border-t border-slate-200 pt-8">
      <Address title="Shipping to" {...shipTo} />
      <Address title="Billed to" {...billTo} />
    </div>
  );
}
