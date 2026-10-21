export const template = ["handlebars"];

export default function Fine({ name }) {
  return (
    <>
      <title>Welcome</title>
      <p>Hi {name}</p>
    </>
  );
}
