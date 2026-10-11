const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export function UpgradeBanner({ upgrade }) {
  if (!upgrade) return null;
  return (
    <div className="upgrade">
      Fancy more legroom? Move to <strong>{upgrade.cabin}</strong> for just{" "}
      <strong>{gbp.format(upgrade.extra)}</strong> more per person.
    </div>
  );
}
