export function Header({ order }) {
  return (
    <div className="head">
      <span className="brand">Fernwood</span>
      <span className="meta">
        Order <strong>#{order.number}</strong>
        <br />
        {order.placedOn}
      </span>
    </div>
  );
}
