import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function renderInvoiceDocx(
  templateBuffer: Buffer,
  data: Record<string, unknown>,
): Buffer {
  const doc = new Docxtemplater(new PizZip(templateBuffer), {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

/**
 * Best-effort list of {{placeholder}} names, for display only. XML tags are
 * stripped first so placeholders split across Word runs are still found.
 */
export function detectPlaceholders(templateBuffer: Buffer): string[] {
  const zip = new PizZip(templateBuffer);
  const xml = zip.file("word/document.xml")?.asText() ?? "";
  const text = xml.replace(/<[^>]+>/g, "");
  const found = new Set<string>();
  const re = /\{\{\s*[#/^]?\s*([\w.]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) found.add(m[1]);
  return [...found];
}
