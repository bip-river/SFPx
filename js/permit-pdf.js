import { PDF_STYLES, documentContent, packageSections, sectionsToContent } from './permit-documents.js';

let enginePromise;

async function loadPdfEngine() {
  if (!enginePromise) {
    enginePromise = Promise.all([import('../vendor/pdfmake.js'), import('../vendor/permit-font.js')])
      .then(([engine, font]) => {
        const pdfMake = engine.default;
        pdfMake.addVirtualFileSystem(font.default);
        pdfMake.addFonts({ DejaVu: { normal: 'DejaVuSans.ttf' } });
        return { pdfMake, supported: new Set(font.codePoints) };
      }).catch(error => { enginePromise = null; throw error; });
  }
  return enginePromise;
}

// Collects every string the PDF will draw, so an unsupported character fails clearly instead of printing a box.
function collectText(node, out = []) {
  if (typeof node === 'string' || typeof node === 'number') out.push(String(node));
  else if (Array.isArray(node)) node.forEach(child => collectText(child, out));
  else if (node && typeof node === 'object') {
    for (const key of ['text', 'stack', 'columns', 'ul', 'ol', 'table', 'body']) if (key in node) collectText(node[key], out);
  }
  return out;
}

function checkGlyphs(content, supported) {
  for (const text of collectText(content)) {
    for (const character of text.normalize('NFC')) {
      if (!['\r', '\n'].includes(character) && !supported.has(character.codePointAt(0))) {
        throw new Error(`The embedded PDF font does not support U+${character.codePointAt(0).toString(16).toUpperCase()}. The permit has not been generated.`);
      }
    }
  }
}

// Also a deep copy: the engine writes layout state into the nodes it renders, and shared sample content
// (such as a map legend) would otherwise come out broken the second time it is used.
const normalize = node => {
  if (typeof node === 'string') return node.normalize('NFC').replace(/\t/g, '    ');
  if (Array.isArray(node)) return node.map(normalize);
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, normalize(value)]));
  return node;
};

// Renders content and reports the page count, which the footer callback is the engine's way to reveal.
async function render(content, { title, subject, footerLabel }) {
  const { pdfMake, supported } = await loadPdfEngine();
  const body = normalize(content);
  checkGlyphs(body, supported);
  let pageCount = 0;
  const doc = {
    pageSize: 'LETTER', pageMargins: [48, 48, 48, 54],
    language: 'en-US', displayTitle: true,
    info: { title, author: 'Bureau of Wandering Lands', subject, creationDate: new Date(Date.UTC(2026, 0, 1)) },
    defaultStyle: { font: 'DejaVu', fontSize: 10.5, lineHeight: 1.2, color: '#15211b' },
    styles: PDF_STYLES,
    content: body,
    footer: (page, pages) => {
      pageCount = pages;
      return { text: `${footerLabel} · Page ${page} of ${pages} · DEMO - not valid for harvesting`, fontSize: 8, color: '#55635c', alignment: 'center', margin: [48, 20, 48, 0] };
    }
  };
  const blob = await pdfMake.createPdf(doc).getBlob();
  return { blob, pageCount };
}

// One PDF in page order: the permit and its stipulations, the haul tags, then maps, area notices and reference.
export async function buildPermitPackagePdf(permit) {
  const meta = { title: `Forest Product Permit ${permit.permitNumber} - DEMO`, subject: 'Demo permit package; not valid for harvesting', footerLabel: `Permit ${permit.permitNumber}` };
  let frontPageCount = 0;
  if (permit.tagCount) {
    // The tags must start on the front of a sheet, which depends on how many pages the permit itself takes.
    ({ pageCount: frontPageCount } = await render(sectionsToContent([packageSections(permit).front]), meta));
  }
  const sections = packageSections(permit, { frontPageCount });
  return render(sectionsToContent([sections.front, sections.tags, sections.reading]), meta);
}

export async function buildSampleDocumentPdf(id) {
  const { blob } = await render(documentContent(id), { title: `Sample document: ${id}`, subject: 'Sample document for the demo site', footerLabel: 'Sample document' });
  return blob;
}
