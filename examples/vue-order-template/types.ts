export type Address = { name: string; line1: string; line2?: string; city: string; postcode: string; country: string };
export type Item = { sku: string; name: string; variant: string; qty: number; price: string; listPrice: string; image: string; discount?: { label: string } };
export type Totals = { subtotal: string; savings?: string; delivery: string; tax: string; total: string };
