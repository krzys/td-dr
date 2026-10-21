export const lang = "en";
export const template = ["handlebars", "liquid"];

export default function Match({ user, items }) {
  return (
    <div>
      <div>Hello {user.name}.</div>
      {items.map((item) => (
        <div key={item}>{item}</div>
      ))}
    </div>
  );
}
