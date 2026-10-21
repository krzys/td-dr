import "./styles.css";
import { Header } from "./Header.jsx";
import { LineItems } from "./LineItems.jsx";
import { Totals } from "./Totals.jsx";
import { Addresses } from "./Addresses.jsx";
import { Footer } from "./Footer.jsx";

export const lang = "en";

export default function App(props) {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: props.currency });
  const fmt = (n) => money.format(n);
  return (
    <div className="bg-slate-100 px-4 py-8 font-sans text-slate-900">
      <div className="mx-auto max-w-[600px] rounded-lg bg-white px-6 py-8">
        <Header />
        <div className="mt-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Order {props.orderNo}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Thanks, your order is on its way.</h1>
          <p className="mt-3 text-base/7 text-slate-900/70">
            Hi {props.customer.split(" ")[0]}, we packed your order on {props.placed}. You will get another note when it
            is out for delivery.
          </p>
        </div>
        <LineItems items={props.items} fmt={fmt} />
        <Totals {...props} fmt={fmt} />
        <div className="mt-8 text-center">
          <a href={props.trackUrl} className="inline-block rounded-md bg-indigo-600 px-5 py-3 text-white font-semibold no-underline">
            Track your package
          </a>
        </div>
        <Addresses shipTo={props.shipTo} billTo={props.billTo} />
      </div>
      <Footer helpUrl={props.helpUrl} />
    </div>
  );
}
