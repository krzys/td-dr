export function Footer({ bookingRef }) {
  return (
    <footer className="foot">
      <p>Booking reference {bookingRef}. Check-in opens 24 hours before departure.</p>
      <p style={{ color: "#94a3b8" }}>Northvale Air Ltd, 1 Airport Way, London</p>
    </footer>
  );
}
