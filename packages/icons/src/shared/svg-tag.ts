import { html } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import type { TemplateResult } from 'lit';

export const svgTag = (svgPaths: string): TemplateResult => html`<svg
  xmlns="http://www.w3.org/2000/svg"
  width="100%"
  height="100%"
  viewBox="0 0 24 24"
  fill="currentColor"
>
  ${unsafeSVG(svgPaths)}
</svg>`;
