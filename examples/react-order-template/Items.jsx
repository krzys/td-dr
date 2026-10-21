export function Items({ items }) {
  return (
    <div className="items">
      {items.map((item) => (
        <div className="item" key={item.sku}>
          <img src={item.image} alt={item.name} width="64" height="64" />
          <div className="item-text">
            <p className="item-name">{item.name}</p>
            <p className="item-meta">
              {item.variant} · Qty {item.qty}
            </p>
            {item.discount && <p className="item-sale">{item.discount.label}</p>}
          </div>
          <div className="item-price">
            {item.discount ? (
              <>
                <s>{item.listPrice}</s>
                <br />
                <strong>{item.price}</strong>
              </>
            ) : (
              <strong>{item.price}</strong>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
