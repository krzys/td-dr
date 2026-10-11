import "./styles.css";
import { Header } from "./Header.jsx";
import { Items } from "./Items.jsx";
import { Totals } from "./Totals.jsx";
import { Addresses } from "./Addresses.jsx";
import { Footer } from "./Footer.jsx";

// written as normal JSX; the ESP fills it, the data sets here only preview it
export const template = ["handlebars", "liquid"];
export const lang = "en";

export default function OrderConfirmation({ customer, order, store }) {
  return (
    <div className="wrap">
      <Header order={order} />
      <div className="card">
        <h1>Thanks for your order, {customer.firstName}.</h1>
        <p className="lead">
          {order.delivery.method === "pickup"
            ? "We'll email you as soon as it's ready to collect."
            : "We're getting it ready and will email you when it ships."}
        </p>
        {order.subscription && (
          <div className="note">
            <strong>Subscribe &amp; save</strong>
            <span>
              Your {order.subscription.plan} plan renews every {order.subscription.interval}. Next delivery{" "}
              {order.subscription.nextDate}.
            </span>
          </div>
        )}
        <Items items={order.items} />
        <Totals order={order} />
      </div>
      <Addresses order={order} />
      <div className="cta">
        <a href={order.url}>View your order</a>
      </div>
      <Footer store={store} />
    </div>
  );
}
