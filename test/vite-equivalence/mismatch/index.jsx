export const lang = "en";
export const template = ["handlebars", "liquid"];

// a side effect the template can't follow: every render counts up, so the template (rendered
// once, before any data) and the HTML render of a data set never agree on the number
export default function Mismatch({ user }) {
  globalThis.__tddrVisits = (globalThis.__tddrVisits ?? 0) + 1;
  return (
    <div>
      <div>Hello {user.name}.</div>
      <div>Visit number {globalThis.__tddrVisits}.</div>
    </div>
  );
}
