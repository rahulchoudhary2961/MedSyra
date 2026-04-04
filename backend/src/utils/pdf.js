const escapePdfText = (text) =>
  String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const formatMoney = (amount, currency = "INR") => {
  const value = Number(amount || 0);
  if (currency && currency !== "INR") {
    return `${currency} ${value.toFixed(2)}`;
  }
  return `Rs. ${value.toFixed(2)}`;
};

const wrapText = (text, maxLength = 42) => {
  const value = String(text || "").trim();
  if (!value) {
    return [""];
  }

  const words = value.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLength) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
    }
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
};

const pushText = (commands, text, x, y, options = {}) => {
  const {
    font = "F1",
    size = 11,
    color = [0, 0, 0]
  } = options;
  commands.push(
    `BT /${font} ${size} Tf ${color[0]} ${color[1]} ${color[2]} rg 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`
  );
};

const pushRect = (commands, x, y, width, height, color = [1, 1, 1]) => {
  commands.push(`${color[0]} ${color[1]} ${color[2]} rg ${x} ${y} ${width} ${height} re f`);
};

const buildPdfBuffer = (commands) => {
  const stream = commands.join("\n");
  const streamLength = Buffer.byteLength(stream, "utf8");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj",
    `6 0 obj << /Length ${streamLength} >> stream\n${stream}\nendstream endobj`
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
  return Buffer.from(`%PDF-1.4\n${body}${xref}${trailer}`, "utf8");
};

const createSimplePdfBuffer = (title, lines) => {
  const commands = [];
  pushText(commands, title, 40, 800, { font: "F2", size: 18 });
  lines.forEach((line, index) => {
    pushText(commands, line, 40, 770 - index * 16, { size: 11 });
  });
  return buildPdfBuffer(commands);
};

const createInvoicePdfBuffer = (invoice) => {
  const commands = [];
  const pageWidth = 595;
  const left = 42;
  const right = pageWidth - 42;

  pushRect(commands, 0, 760, pageWidth, 82, [0.07, 0.42, 0.36]);
  pushText(commands, invoice.organization_name || "MedSyra Clinic", left, 806, { font: "F2", size: 24, color: [1, 1, 1] });
  pushText(commands, "Professional Healthcare Invoice", left, 786, { size: 11, color: [0.88, 0.97, 0.94] });
  pushText(commands, "INVOICE", 445, 804, { font: "F2", size: 20, color: [1, 1, 1] });
  pushText(commands, invoice.invoice_number || "-", 445, 784, { font: "F2", size: 14, color: [1, 1, 1] });

  pushRect(commands, left, 678, 240, 64, [0.95, 0.98, 0.97]);
  pushRect(commands, 314, 678, right - 314, 64, [0.97, 0.97, 0.97]);

  pushText(commands, "Bill To", left + 12, 724, { font: "F2", size: 11, color: [0.07, 0.42, 0.36] });
  pushText(commands, invoice.patient_name || "Patient", left + 12, 704, { font: "F2", size: 14 });
  pushText(commands, `Doctor: ${invoice.doctor_name || "-"}`, left + 12, 686, { size: 10, color: [0.3, 0.3, 0.3] });

  pushText(commands, "Invoice Details", 326, 724, { font: "F2", size: 11, color: [0.27, 0.27, 0.27] });
  pushText(commands, `Issue Date: ${invoice.issue_date || "-"}`, 326, 706, { size: 10 });
  pushText(commands, `Due Date: ${invoice.due_date || "-"}`, 326, 690, { size: 10 });
  pushText(commands, `Status: ${String(invoice.status || "-").toUpperCase()}`, 326, 674, { size: 10 });

  pushText(commands, "Description", left, 640, { font: "F2", size: 11 });
  pushText(commands, "Qty", 380, 640, { font: "F2", size: 11 });
  pushText(commands, "Unit Price", 430, 640, { font: "F2", size: 11 });
  pushText(commands, "Amount", 510, 640, { font: "F2", size: 11 });
  commands.push(`0.82 0.86 0.84 RG ${left} 634 m ${right} 634 l S`);

  let y = 612;
  const items = Array.isArray(invoice.items) && invoice.items.length > 0 ? invoice.items : [{ description: "Consultation", quantity: 1, unit_price: invoice.total_amount, total_amount: invoice.total_amount }];
  items.slice(0, 8).forEach((item) => {
    const descriptionLines = wrapText(item.description || "-", 36);
    descriptionLines.forEach((line, index) => {
      pushText(commands, line, left, y - index * 14, { size: 10 });
    });
    pushText(commands, String(item.quantity || 1), 386, y, { size: 10 });
    pushText(commands, formatMoney(item.unit_price, invoice.currency), 430, y, { size: 10 });
    pushText(commands, formatMoney(item.total_amount, invoice.currency), 510, y, { size: 10 });
    y -= Math.max(22, descriptionLines.length * 14 + 8);
    commands.push(`0.92 0.92 0.92 RG ${left} ${y + 4} m ${right} ${y + 4} l S`);
  });

  const totalsTop = Math.max(320, y - 12);
  pushRect(commands, 330, totalsTop - 84, right - 330, 90, [0.96, 0.98, 0.98]);
  pushText(commands, "Payment Summary", 342, totalsTop - 14, { font: "F2", size: 11, color: [0.07, 0.42, 0.36] });
  pushText(commands, `Total`, 342, totalsTop - 36, { size: 10 });
  pushText(commands, formatMoney(invoice.total_amount, invoice.currency), 500, totalsTop - 36, { font: "F2", size: 10 });
  pushText(commands, `Paid`, 342, totalsTop - 54, { size: 10 });
  pushText(commands, formatMoney(invoice.paid_amount, invoice.currency), 500, totalsTop - 54, { font: "F2", size: 10 });
  pushText(commands, `Balance`, 342, totalsTop - 72, { size: 10 });
  pushText(commands, formatMoney(invoice.balance_amount, invoice.currency), 500, totalsTop - 72, { font: "F2", size: 12, color: [0.8, 0.31, 0.21] });

  const notesTop = totalsTop - 14;
  pushText(commands, "Notes", left, notesTop, { font: "F2", size: 11, color: [0.27, 0.27, 0.27] });
  wrapText(invoice.notes || "Thank you for choosing our clinic. Please retain this invoice for your records.", 48)
    .slice(0, 4)
    .forEach((line, index) => {
      pushText(commands, line, left, notesTop - 20 - index * 14, { size: 10, color: [0.32, 0.32, 0.32] });
    });

  pushText(commands, "Generated by MedSyra", left, 54, { size: 9, color: [0.45, 0.45, 0.45] });
  pushText(commands, "This is a computer-generated invoice.", 420, 54, { size: 9, color: [0.45, 0.45, 0.45] });

  return buildPdfBuffer(commands);
};

module.exports = {
  createSimplePdfBuffer,
  createInvoicePdfBuffer
};
