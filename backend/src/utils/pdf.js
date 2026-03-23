const escapePdfText = (text) =>
  String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const createSimplePdfBuffer = (title, lines) => {
  const fontSize = 12;
  const lineHeight = 16;
  const startY = 800;
  const textCommands = [`BT /F1 ${fontSize} Tf 40 ${startY} Td (${escapePdfText(title)}) Tj ET`];

  lines.forEach((line, index) => {
    const y = startY - (index + 2) * lineHeight;
    textCommands.push(`BT /F1 ${fontSize} Tf 40 ${y} Td (${escapePdfText(line)}) Tj ET`);
  });

  const stream = textCommands.join("\n");
  const streamLength = stream.length;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${streamLength} >> stream\n${stream}\nendstream endobj`
  ];

  let offset = "%PDF-1.4\n".length;
  const xrefOffsets = ["0000000000 65535 f "];
  const body = objects
    .map((obj) => {
      xrefOffsets.push(`${String(offset).padStart(10, "0")} 00000 n `);
      offset += `${obj}\n`.length;
      return `${obj}\n`;
    })
    .join("");

  const xrefStart = offset;
  const xref = `xref\n0 ${xrefOffsets.length}\n${xrefOffsets.join("\n")}\n`;
  const trailer = `trailer << /Size ${xrefOffsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  const content = `%PDF-1.4\n${body}${xref}${trailer}`;
  return Buffer.from(content, "utf8");
};

module.exports = { createSimplePdfBuffer };
