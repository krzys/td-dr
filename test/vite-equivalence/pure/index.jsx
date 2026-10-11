export const lang = "en";
export const template = ["handlebars", "liquid"];

// a function the arms call that changes something: the rewrite can't see it, but every arm is
// rendered once for the template, so the unpaid page reads "Due 2" there and "Due 1" as HTML
export default function Pure({ order }) {
  let n = 0;
  const next = () => ++n;
  if (order.paid) return <p>Paid {next()}</p>;
  return <p>Due {next()}</p>;
}
