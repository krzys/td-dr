import { createSSRApp, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { fieldOf, renderSymbolic } from "../template/index.ts";

export { Each, Else, ElseIf, If } from "./components.ts";

export const render = (Component: Component, props: Record<string, unknown>): Promise<string> =>
  renderToString(createSSRApp(Component, props));

const propNames = (c: Component): string[] => {
  const props = (c as { props?: string[] | Record<string, unknown> }).props;
  return Array.isArray(props) ? props : Object.keys(props ?? {});
};

// Rendered with symbolic props (docs/templates.md#native-component-code): each declared prop is a top-level field. Their type
// checks can't pass on a placeholder, so those warnings are dropped.
export const renderTemplate = (Component: Component): Promise<string> => {
  const names = propNames(Component);
  return renderSymbolic(async (r) => {
    const app = createSSRApp(Component, Object.fromEntries(names.map((n) => [n, fieldOf(r, n)])));
    app.config.warnHandler = (msg, _instance, trace) => {
      if (!msg.startsWith("Invalid prop: type check failed")) console.warn(`[Vue warn]: ${msg}${trace ? `\n${trace}` : ""}`);
    };
    return renderToString(app);
  }, new Set(names));
};
