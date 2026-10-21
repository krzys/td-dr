import { createElement, type ComponentType } from "react";
import { jsx } from "./jsx-runtime.ts";
import { renderToStaticMarkup } from "react-dom/server";
import { renderSymbolic, rootProps } from "../template/index.ts";

export { Each, Else, ElseIf, If } from "./components.ts";

// React 19 hoists one of these for every <img>; written exactly like this, so an author's own link stays
const IMAGE_PRELOAD = /<link rel="preload" as="image"[^>]*\/>/g;

export const render = <P extends object>(Component: ComponentType<P>, props: P): string =>
  renderToStaticMarkup(createElement(Component, props)).replace(IMAGE_PRELOAD, "");

// Rendered with symbolic props (docs/templates.md#native-component-code): `({ order })` reads the field `order`. jsx(), unlike
// createElement, keeps the props object it is given, so the component gets the symbolic one.
export const renderTemplate = (Component: ComponentType<any>): Promise<string> =>
  renderSymbolic((r) => {
    const { props, arm } = rootProps(r);
    const element = jsx(Component, props);
    arm();
    return renderToStaticMarkup(element).replace(IMAGE_PRELOAD, "");
  });
