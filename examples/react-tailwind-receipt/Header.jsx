const nav = [
  ["Shop", "https://example.com/shop"],
  ["Orders", "https://example.com/orders"],
  ["Help", "https://example.com/help"],
];

export function Header() {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 pb-6">
      <a href="https://example.com" className="flex items-center gap-2 no-underline">
        <img src="https://example.com/img/northvale-mark.png" width="32" height="32" alt="" className="size-8 rounded-md" />
        <span className="text-lg font-semibold tracking-tight text-slate-900">Northvale Supply</span>
      </a>
      <div className="flex gap-4 text-sm">
        {nav.map(([label, href]) => (
          <a key={label} href={href} className="text-slate-600 no-underline">
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
