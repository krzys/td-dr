export type Emitted = {
  html: string;
  headCss: string[]; // media queries etc. for <head>, deduped
  background?: string; // page colour from the root node; the shell paints it full-width
};
