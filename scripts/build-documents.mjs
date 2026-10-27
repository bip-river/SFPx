import { mkdir, writeFile } from 'node:fs/promises';
import { buildSampleDocumentPdf } from '../js/permit-pdf.js';
import { sampleDocumentIds, documentUrl } from '../js/permit-documents.js';
// The site links to these files; the permit package builds the same content into one PDF in the browser.
await mkdir('documents', { recursive: true });
for (const id of sampleDocumentIds()) {
  const blob = await buildSampleDocumentPdf(id);
  await writeFile(documentUrl(id), Buffer.from(await blob.arrayBuffer()));
}
console.log(`Generated ${sampleDocumentIds().length} sample documents in documents/.`);
