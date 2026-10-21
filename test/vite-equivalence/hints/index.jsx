import { field } from "../../../src/template/tokens.ts";

export const lang = "en";
export const template = ["handlebars", "liquid"];

export default function Hints() {
  return (
    <p>
      Sale: <span data-email-if="show">on</span>
      <span data-email-else="">off</span>. Deals:{" "}
      <b data-email-each="deals" data-email-as="deal">
        {field("deal.title")}{" "}
      </b>
    </p>
  );
}
