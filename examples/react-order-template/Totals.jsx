function Row({ label, children }) {
  return (
    <div className="row">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

export function Totals({ order }) {
  const { totals, delivery } = order;
  return (
    <div className="totals">
      <div className="charges">
        <Row label="Subtotal">{totals.subtotal}</Row>
        {totals.savings && <Row label="You saved">-{totals.savings}</Row>}
        <Row label="Delivery">
          {delivery.method === "pickup" ? "Free in-store pickup" : delivery.free ? "Free" : totals.delivery}
        </Row>
        {order.taxExempt ? (
          <div className="row exempt">
            <span>Tax</span>
            <span>Exempt ({order.taxExemptId})</span>
          </div>
        ) : (
          <Row label="Tax">{totals.tax}</Row>
        )}
      </div>
      <div className="row grand">
        <span>Total</span>
        <span>{totals.total}</span>
      </div>
    </div>
  );
}
