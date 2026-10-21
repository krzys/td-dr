import "./styles.css";
import { Header } from "./Header.jsx";
import { Segment } from "./Segment.jsx";
import { Passengers } from "./Passengers.jsx";
import { Price } from "./Price.jsx";
import { UpgradeBanner } from "./UpgradeBanner.jsx";
import { Footer } from "./Footer.jsx";

export const lang = "en";

export default function App({ bookingRef, customer, segments, passengers, lines, upgrade, manageUrl }) {
  return (
    <div className="wrap">
      <Header customer={customer} bookingRef={bookingRef} />
      {segments.map((s, i) => (
        <Segment key={s.id} seg={s} label={i === 0 ? "Outbound" : "Return"} />
      ))}
      <Passengers passengers={passengers} />
      <Price lines={lines} />
      <UpgradeBanner upgrade={upgrade} />
      <div className="cta">
        <a href={manageUrl}>Manage your booking</a>
      </div>
      <Footer bookingRef={bookingRef} />
    </div>
  );
}
