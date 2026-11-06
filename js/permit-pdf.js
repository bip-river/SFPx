import { PDF_STYLES, documentContent, packageSections, sectionsToContent } from './permit-documents.js';
import { demoBreak } from '../demo/state.js';

let enginePromise;
let engineAttempts = 0;

// The app explains each kind of failure in its own words; `message` keeps the technical detail for the console.
// code 'engine-unavailable': the PDF engine or font did not download. code 'unprintable-character': `character`
// is not in the embedded font.
export class PermitPdfError extends Error {
  constructor(code, message, details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = 'PermitPdfError';
    this.code = code;
    Object.assign(this, details);
  }
}

async function loadPdfEngine() {
  // The demo switch fails the download the way a dropped connection would, every time until it is switched off.
  if (demoBreak('pdf')) throw new PermitPdfError('engine-unavailable', 'Demo: the PDF engine download was switched off');
  if (!enginePromise) {
    // Browsers remember a module that failed to download and fail every later import of the same URL, so a
    // retry asks for a new one. Both files are self-contained, so a second copy changes nothing else.
    const retry = engineAttempts++ ? `?attempt=${engineAttempts}` : '';
    enginePromise = Promise.all([import(`../vendor/pdfmake.js${retry}`), import(`../vendor/permit-font.js${retry}`)])
      .then(([engine, font]) => {
        const pdfMake = engine.default;
        pdfMake.addVirtualFileSystem(font.default);
        pdfMake.addFonts({ DejaVu: { normal: 'DejaVuSans.ttf' } });
        return { pdfMake, supported: new Set(font.codePoints) };
      }).catch(error => {
        // A later attempt downloads again (see above), so a dropped connection is not permanent.
        enginePromise = null;
        throw new PermitPdfError('engine-unavailable', `The PDF engine or its font did not load: ${error?.message || error}`, { cause: error });
      });
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
        throw new PermitPdfError('unprintable-character', `The embedded PDF font does not support U+${character.codePointAt(0).toString(16).toUpperCase()}. The permit has not been generated.`, { character });
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
