import logo from "./logo.png";
import "./styles.css";

export const template = ["handlebars", "liquid"];

export default function Badge({ user }) {
  return (
    <div className="badge">
      <img src={logo} width="40" height="20" alt="Logo" />
      <div className="hero">Hello {user.name}.</div>
      <img src="/brand/mark.png" width="30" height="30" alt="" />
    </div>
  );
}
