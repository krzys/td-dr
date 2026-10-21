function Address({ title, address }) {
  return (
    <div className="address">
      <h2>{title}</h2>
      <p>
        {address.name}
        <br />
        {address.line1}
        <br />
        {address.line2 && (
          <>
            {address.line2}
            <br />
          </>
        )}
        {address.city} {address.postcode}
        <br />
        {address.country}
      </p>
    </div>
  );
}

export function Addresses({ order }) {
  const { delivery } = order;
  return (
    <div className="addresses">
      <div className="column">
        {delivery.method === "pickup" ? (
          <Address title="Collect from" address={delivery.store} />
        ) : (
          <Address title="Shipping to" address={order.shipping} />
        )}
      </div>
      <div className="column">
        {order.billingSameAsShipping ? (
          <div className="address">
            <h2>Billing</h2>
            <p>Same as shipping address</p>
          </div>
        ) : (
          <Address title="Billing" address={order.billing} />
        )}
      </div>
    </div>
  );
}
