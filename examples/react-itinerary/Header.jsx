const plane =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="#ffffff"/><path d="M6 17l20-8-6 15-4-6z" fill="#0e7490"/></svg>',
  );

export function Header({ customer, bookingRef }) {
  return (
    <header className="hero">
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "0.75rem" }}>
        <img src={plane} width="32" height="32" alt="" />
        <h1>Flight itinerary for {customer}</h1>
      </div>
      <div className="ref">
        Booking
        <strong>{bookingRef}</strong>
      </div>
    </header>
  );
}
