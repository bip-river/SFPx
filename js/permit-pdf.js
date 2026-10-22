export function buildDemoPermitPdf(lines) {
  const safe = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = (() => {
    const out = [];
    out.push('BT');
    out.push('/F1 12 Tf');
    out.push('14 TL');
    out.push('72 740 Td');
    (lines || []).forEach((line, i) => {
      out.push(`(${safe(line)}) Tj`);
      if (i < (lines.length - 1)) out.push('T*');
    });
    out.push('ET');
    return out.join('\n') + '\n';
  })();

  const encoder = new TextEncoder();
  const contentBytes = encoder.encode(content);

  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n');
  objects.push(`4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${content}endstream\nendobj\n`);
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  const header = '%PDF-1.4\n';
  const headerBytes = encoder.encode(header).length;

  const offsets = [0];
  let cursor = headerBytes;

  for (const obj of objects) {
    offsets.push(cursor);
    cursor += encoder.encode(obj).length;
  }

  const xrefOffset = cursor;
  const xrefLines = [];
  xrefLines.push('xref\n');
  xrefLines.push(`0 ${offsets.length}\n`);
  xrefLines.push('0000000000 65535 f \n');
  for (let i = 1; i < offsets.length; i++) {
    const off = String(offsets[i]).padStart(10, '0');
    xrefLines.push(`${off} 00000 n \n`);
  }
  const trailer =
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const xref = xrefLines.join('');
  const full = header + objects.join('') + xref + trailer;
  return new Blob([full], { type: 'application/pdf' });
}
