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

// Font data and the PDF engine load only when a PDF is requested.
export async function buildDemoPermitPdf(lines) {
  const { pdfMake, supported } = await loadPdfEngine();
  const paragraphs = Array.from(lines || [], line => String(line ?? '').normalize('NFC').replace(/\t/g, '    '));
  for (const text of paragraphs) {
    for (const character of text) {
      if (!['\r', '\n'].includes(character) && !supported.has(character.codePointAt(0))) {
        throw new Error(`The embedded PDF font does not support U+${character.codePointAt(0).toString(16).toUpperCase()}. The permit has not been generated.`);
      }
    }
  }
  const doc = {
    pageSize: 'LETTER', pageMargins: [48, 54, 48, 54],
    language: 'en-US', displayTitle: true,
    info: { title: 'Forest Product Permit - DEMO', author: 'Bureau of Wandering Lands', subject: 'Demo permit only; not valid for harvesting' },
    defaultStyle: { font: 'DejaVu', fontSize: 10.5, lineHeight: 1.25 },
    content: paragraphs.map((text, index) => ({
      text: text || ' ', margin: [0, 0, 0, 7],
      ...(index === 0 ? { fontSize: 15, color: '#155333', margin: [0, 0, 0, 15] } : {})
    })),
    footer: (page, pages) => ({ text: `DEMO - not valid for harvesting | Page ${page} of ${pages}`, fontSize: 8, color: '#4a5c65', alignment: 'center', margin: [48, 18, 48, 0] })
  };
  return pdfMake.createPdf(doc).getBlob();
}
