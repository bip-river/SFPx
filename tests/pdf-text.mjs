import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
export async function readPdf(blob) {
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: false, disableFontFace: true, isEvalSupported: false });
  const doc = await task.promise;
  const pages = [];
  for (let index = 1; index <= doc.numPages; index++) {
    const page = await doc.getPage(index);
    pages.push({ width: page.view[2], height: page.view[3], items: (await page.getTextContent()).items.filter(item => typeof item.str === 'string') });
  }
  await task.destroy?.();
  return { pages, text: pages.map(page => page.items.map(item => item.str).join('\n')).join('\n') };
}
