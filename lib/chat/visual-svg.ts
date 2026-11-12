import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const svgNamespace = "http://www.w3.org/2000/svg";

/** Accept SVG documents and fragments, including saved charts missing only the root closing tag. */
export function normalizeVisualSvg(source: string): string | null {
  const content = source.trim().replace(/^\x60{3}(?:svg|xml)?\s*\r?\n([\s\S]*?)\r?\n\x60{3}$/i, "$1").trim();
  if (!content || /<!DOCTYPE\b/i.test(content)) return null;

  const root = content.match(/^(?:<\?xml[^?]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?=[\s/>])(?:[^"'<>]|"[^"]*"|'[^']*')*>/);
  let markup = content;
  if (!root) {
    if (/<svg(?=[\s/>])/i.test(content) || !content.startsWith("<")) return null;
    markup = `<svg xmlns="${svgNamespace}" viewBox="0 0 800 600">${content}</svg>`;
  } else if (!root[0].endsWith("/>") && !/<\/svg\s*>/.test(content)) {
    markup += "</svg>";
  }

  try {
    let invalid = false;
    const document = new DOMParser({ errorHandler: () => { invalid = true; } }).parseFromString(markup, "image/svg+xml");
    const svg = document.documentElement;
    if (invalid || svg?.localName !== "svg" || (svg.namespaceURI && svg.namespaceURI !== svgNamespace)) return null;
    for (let node = document.firstChild; node; node = node.nextSibling) {
      if (node !== svg && node.nodeType !== 7 && node.nodeType !== 8 &&
          (node.nodeType !== 3 || node.nodeValue?.trim())) return null;
    }
    if (!svg.namespaceURI) svg.setAttribute("xmlns", svgNamespace);
    return new XMLSerializer().serializeToString(svg, false, undefined, { requireWellFormed: true });
  } catch {
    return null;
  }
}
