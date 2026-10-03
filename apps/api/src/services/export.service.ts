import ExcelJS from "exceljs";
import { PDFDocument, rgb, StandardFonts, PDFPage } from "pdf-lib";
import { prisma } from "@student-academic-ai/database";
import { AuthUser } from "../lib/rbac.js";

export type ExportFormat = "xlsx" | "pdf" | "csv";

export interface ColumnDefinition {
  header: string;
  key: string;
  width?: number;
  isNumeric?: boolean;
  isPercent?: boolean;
}

export interface ExportReportOptions {
  reportType: "attendance" | "marks" | "department_analytics" | "accreditation";
  format: ExportFormat;
  title: string;
  courseCode?: string;
  departmentCode?: string;
  columns: ColumnDefinition[];
  rows: Record<string, unknown>[];
  summaryRows?: Array<{ label: string; value: string | number }>;
  user: AuthUser;
  targetId?: string;
}

export interface ExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/**
 * Escapes CSV values conforming to RFC 4180.
 */
function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an XLSX file in-memory using ExcelJS.
 */
async function generateXlsx(opts: ExportReportOptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Student Academic AI";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(opts.title.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // Setup columns
  sheet.columns = opts.columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width ?? Math.max(col.header.length + 4, 14),
  }));

  // Style Header Row
  const headerRow = sheet.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" }, // Slate-800
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
    };
  });

  // Populate data rows
  if (opts.rows.length === 0) {
    const emptyRow = sheet.addRow({ [opts.columns[0]?.key ?? "info"]: "No data available" });
    emptyRow.getCell(1).font = { italic: true };
  } else {
    for (const r of opts.rows) {
      const row = sheet.addRow(r);
      row.height = 20;

      // Apply formatting per column
      opts.columns.forEach((col, idx) => {
        const cell = row.getCell(idx + 1);
        if (col.isPercent) {
          cell.numFmt = '0.0"%"';
        } else if (col.isNumeric) {
          cell.numFmt = "#,##0.00";
        }
      });

      // Conditional formatting: Highlight shortage rows with soft red fill + dark red text
      if (r.shortageFlag === true) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFEE2E2" }, // Soft red
          };
          cell.font = { color: { argb: "FF991B1B" }, bold: String(cell.col) === "1" };
        });
      }
    }
  }

  // Summary section if provided
  if (opts.summaryRows && opts.summaryRows.length > 0) {
    sheet.addRow({});
    const summaryHeader = sheet.addRow(["Summary Metrics"]);
    summaryHeader.getCell(1).font = { bold: true, size: 12 };
    for (const s of opts.summaryRows) {
      const sRow = sheet.addRow([s.label, s.value]);
      sRow.getCell(1).font = { bold: true };
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generates an A4 PDF in-memory using pure pdf-lib with Helvetica and multi-page pagination.
 */
async function generatePdf(opts: ExportReportOptions): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const totalCols = opts.columns.length;
  const colWidth = contentWidth / totalCols;

  const dateStr = new Date().toISOString().slice(0, 10);

  function drawHeader(page: PDFPage) {
    let curY = pageHeight - margin;
    page.drawText("STUDENT ACADEMIC AI - OFFICIAL REPORT", {
      x: margin,
      y: curY,
      size: 14,
      font: fontBold,
      color: rgb(0.12, 0.16, 0.23),
    });
    curY -= 18;

    const subText = `${opts.title}${opts.courseCode ? ` | Course: ${opts.courseCode}` : ""}${
      opts.departmentCode ? ` | Dept: ${opts.departmentCode}` : ""
    } | Generated: ${dateStr}`;
    page.drawText(subText, {
      x: margin,
      y: curY,
      size: 9,
      font: fontRegular,
      color: rgb(0.39, 0.45, 0.55),
    });
    curY -= 12;

    // Header divider rule
    page.drawLine({
      start: { x: margin, y: curY },
      end: { x: pageWidth - margin, y: curY },
      thickness: 1,
      color: rgb(0.8, 0.83, 0.88),
    });
    curY -= 15;

    // Table Column Headers
    page.drawRectangle({
      x: margin,
      y: curY - 4,
      width: contentWidth,
      height: 20,
      color: rgb(0.93, 0.95, 0.98),
    });

    opts.columns.forEach((col, idx) => {
      const colX = margin + idx * colWidth + 4;
      page.drawText(col.header.slice(0, 16), {
        x: colX,
        y: curY + 2,
        size: 8.5,
        font: fontBold,
        color: rgb(0.12, 0.16, 0.23),
      });
    });

    return curY - 20;
  }

  y = drawHeader(currentPage);

  if (opts.rows.length === 0) {
    currentPage.drawText("No data available for this report.", {
      x: margin + 4,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 25;
  } else {
    for (let rIdx = 0; rIdx < opts.rows.length; rIdx++) {
      const row = opts.rows[rIdx]!;

      // Check page break threshold
      if (y < 65) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        y = drawHeader(currentPage);
      }

      // Zebra background or shortage background
      if (row.shortageFlag === true) {
        currentPage.drawRectangle({
          x: margin,
          y: y - 3,
          width: contentWidth,
          height: 16,
          color: rgb(0.99, 0.9, 0.9), // Light red
        });
      } else if (rIdx % 2 === 1) {
        currentPage.drawRectangle({
          x: margin,
          y: y - 3,
          width: contentWidth,
          height: 16,
          color: rgb(0.97, 0.98, 0.99),
        });
      }

      // Draw row text
      opts.columns.forEach((col, cIdx) => {
        const val = row[col.key];
        let text = val === null || val === undefined ? "-" : String(val);
        if (col.isPercent && typeof val === "number") {
          text = `${val.toFixed(1)}%`;
        }

        const colX = margin + cIdx * colWidth + 4;
        currentPage.drawText(text.slice(0, 20), {
          x: colX,
          y: y + 2,
          size: 8,
          font: fontRegular,
          color: row.shortageFlag === true ? rgb(0.65, 0.1, 0.1) : rgb(0.15, 0.2, 0.25),
        });
      });

      y -= 17;
    }
  }

  // Summary Metrics Section
  if (opts.summaryRows && opts.summaryRows.length > 0) {
    if (y < 100) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      y = drawHeader(currentPage);
    }
    y -= 10;
    currentPage.drawText("Summary Statistics", {
      x: margin,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.12, 0.16, 0.23),
    });
    y -= 15;

    for (const s of opts.summaryRows) {
      currentPage.drawText(`${s.label}: ${s.value}`, {
        x: margin + 8,
        y,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.2, 0.25, 0.3),
      });
      y -= 13;
    }
  }

  // Add Page Numbers to all pages
  const pageCount = pdfDoc.getPageCount();
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pageCount; i++) {
    const p = pages[i]!;
    const footerText = `Page ${i + 1} of ${pageCount} | Confidential - Academic Evaluation Use Only`;
    p.drawText(footerText, {
      x: margin,
      y: margin - 15,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.5, 0.55, 0.6),
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Generates RFC 4180 compliant CSV string with UTF-8 BOM.
 */
function generateCsv(opts: ExportReportOptions): Buffer {
  const lines: string[] = [];

  // Header row
  const headerLine = opts.columns.map((c) => escapeCsvValue(c.header)).join(",");
  lines.push(headerLine);

  // Data rows
  if (opts.rows.length === 0) {
    lines.push("No data available");
  } else {
    for (const r of opts.rows) {
      const line = opts.columns.map((c) => escapeCsvValue(r[c.key])).join(",");
      lines.push(line);
    }
  }

  // Summary rows
  if (opts.summaryRows && opts.summaryRows.length > 0) {
    lines.push("");
    lines.push(escapeCsvValue("Summary Statistics"));
    for (const s of opts.summaryRows) {
      lines.push(`${escapeCsvValue(s.label)},${escapeCsvValue(s.value)}`);
    }
  }

  // Prepend UTF-8 BOM (\uFEFF)
  const csvContent = "\uFEFF" + lines.join("\r\n");
  return Buffer.from(csvContent, "utf-8");
}

/**
 * Main export handler: generates file buffer, records AuditLog, and returns download details.
 */
export async function exportReport(opts: ExportReportOptions): Promise<ExportResult> {
  const dateStr = new Date().toISOString().slice(0, 10);
  const identifier = opts.courseCode || opts.departmentCode || "report";
  const baseFilename = `${identifier}_${opts.reportType}_${dateStr}`;

  let buffer: Buffer;
  let contentType: string;
  let filename: string;

  switch (opts.format) {
    case "xlsx":
      buffer = await generateXlsx(opts);
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      filename = `${baseFilename}.xlsx`;
      break;
    case "pdf":
      buffer = await generatePdf(opts);
      contentType = "application/pdf";
      filename = `${baseFilename}.pdf`;
      break;
    case "csv":
      buffer = generateCsv(opts);
      contentType = "text/csv; charset=utf-8";
      filename = `${baseFilename}.csv`;
      break;
    default:
      throw new Error("UNSUPPORTED_FORMAT");
  }

  // Record AuditLog entry: "ReportExported" (who, report type, format, course)
  await prisma.auditLog.create({
    data: {
      entity: "ReportExported",
      entityId: opts.targetId ?? opts.user.id,
      modifiedById: opts.user.id,
      justification: `Report exported: ${opts.reportType} (${opts.format}) for ${opts.courseCode ?? "department"}`,
      newValue: {
        who: opts.user.email,
        role: opts.user.role,
        reportType: opts.reportType,
        format: opts.format,
        course: opts.courseCode ?? "N/A",
      },
    },
  });

  return {
    buffer,
    contentType,
    filename,
  };
}
