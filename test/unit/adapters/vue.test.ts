import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { render } from "../../../adapters/vue/index.ts";

const Card = defineComponent({
  props: { title: { type: String, required: true } },
  setup: (props) => () => h("div", { class: "card" }, [h("p", props.title)]),
});

describe("vue adapter", () => {
  it("renders the component with its props", async () => {
    expect(await render(Card, { title: "Hi" })).toBe('<div class="card"><p>Hi</p></div>');
  });
});
