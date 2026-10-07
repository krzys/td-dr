import { field } from "../../../src/template/tokens.ts";
import "./styles.css";

export const template = ["handlebars", "liquid"];

export default function Promo() {
  return (
    <div className="promo">
      <p>Hello {field("user.name")}.</p>
      <div className="deal" data-email-if="show" data-email-each="deals" data-email-as="deal">
        <b>{field("deal.title")}</b> for {field("deal.price")}
      </div>
    </div>
  );
}
