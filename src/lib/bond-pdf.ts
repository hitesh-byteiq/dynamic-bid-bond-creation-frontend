import {
  bondValidationError,
  displayBondValue,
  type BondField,
  type BondTemplate,
  type BondValues,
} from "./bond-templates.ts";
import type { PDFFont } from "pdf-lib";

type FontAssets = {
  regular: Uint8Array;
  bold: Uint8Array;
};

export type BondFieldArea = {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  valueX: number;
  valueTop: number;
  valueWidth: number;
  valueHeight: number;
  maxLines: number;
  kind: BondField["kind"];
};

export type BondPdfResult = {
  bytes: Uint8Array;
  fieldAreas: BondFieldArea[];
  pageSize: [number, number];
};

let fontAssetsPromise: Promise<FontAssets> | null = null;

async function loadFonts(): Promise<FontAssets> {
  fontAssetsPromise ??= Promise.all([
    fetch("/fonts/DejaVuSans.ttf"),
    fetch("/fonts/DejaVuSans-Bold.ttf"),
  ])
    .then(async ([regular, bold]) => {
      if (!regular.ok || !bold.ok) throw new Error("The PDF fonts could not be loaded.");
      return {
        regular: new Uint8Array(await regular.arrayBuffer()),
        bold: new Uint8Array(await bold.arrayBuffer()),
      };
    })
    .catch((error: unknown) => {
      fontAssetsPromise = null;
      throw error;
    });
  return fontAssetsPromise;
}

export async function generateBondPdf(
  template: BondTemplate,
  values: BondValues,
  fontAssets?: FontAssets,
): Promise<Uint8Array> {
  return (await buildBondPdf(template, values, fontAssets ? { fontAssets } : {})).bytes;
}

export async function buildBondPdf(
  template: BondTemplate,
  values: BondValues,
  options: { preview?: boolean; backgroundOnly?: boolean; fontAssets?: FontAssets } = {},
): Promise<BondPdfResult> {
  if (!options.preview) {
    const validationError = bondValidationError(template, values);
    if (validationError) throw new Error(validationError);
  }

  const [{ PDFDocument, rgb }, { default: fontkit }] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
  ]);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = options.fontAssets ?? (await loadFonts());
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });
  pdf.setTitle(template.name);
  pdf.setSubject(template.formTitle);
  pdf.setAuthor("Dynamic Form Fill AI");

  const ink = rgb(0.06, 0.1, 0.23);
  const muted = rgb(0.37, 0.41, 0.48);
  const lineColor = rgb(0.57, 0.61, 0.66);
  const pale = rgb(0.95, 0.96, 0.97);
  const pageSize: [number, number] = template.pageSize === "A4" ? [595.28, 841.89] : [612, 792];
  const fieldAreas: BondFieldArea[] = [];

  for (const [index, pageData] of template.pages.entries()) {
    const page = pdf.addPage(pageSize);
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const margin = 46;
    const contentWidth = pageWidth - margin * 2;
    let y = pageHeight - 48;

    const drawCentered = (text: string, size: number, font = bold) => {
      page.drawText(text, {
        x: Math.max(margin, (pageWidth - font.widthOfTextAtSize(text, size)) / 2),
        y,
        size,
        font,
        color: ink,
      });
      y -= size + 9;
    };

    const wrapLines = (text: string, maxWidth: number, size: number, font: PDFFont) => {
      const lines: string[] = [];
      let line = "";
      const pushLine = () => {
        if (line) lines.push(line);
        line = "";
      };
      for (const word of text.split(/\s+/)) {
        if (!word) continue;
        if (font.widthOfTextAtSize(word, size) > maxWidth) {
          pushLine();
          let fragment = "";
          for (const character of word) {
            if (fragment && font.widthOfTextAtSize(fragment + character, size) > maxWidth) {
              lines.push(fragment);
              fragment = "";
            }
            fragment += character;
          }
          line = fragment;
          continue;
        }
        const candidate = line ? `${line} ${word}` : word;
        if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) pushLine();
        line = line ? `${line} ${word}` : word;
      }
      pushLine();
      return lines;
    };

    const drawWrapped = (
      text: string,
      x: number,
      startY: number,
      maxWidth: number,
      size: number,
      font = regular,
      color = ink,
      lineHeight = size * 1.55,
    ) => {
      let currentY = startY;
      for (const line of wrapLines(text, maxWidth, size, font)) {
        page.drawText(line, { x, y: currentY, size, font, color });
        currentY -= lineHeight;
      }
      return currentY;
    };

    const drawField = (field: BondField, x: number, top: number, width: number) => {
      if (field.kind === "checkbox") {
        const squareY = top - 10;
        page.drawRectangle({
          x,
          y: squareY,
          width: 11,
          height: 11,
          borderColor: ink,
          borderWidth: 0.8,
        });
        page.drawText(field.label, {
          x: x + 18,
          y: top - 7,
          size: 7.6,
          font: regular,
          color: ink,
        });
        if (!options.backgroundOnly && values[field.id] === true) {
          page.drawLine({
            start: { x: x + 2, y: squareY + 5 },
            end: { x: x + 4.5, y: squareY + 2 },
            thickness: 1.2,
            color: ink,
          });
          page.drawLine({
            start: { x: x + 4.5, y: squareY + 2 },
            end: { x: x + 9, y: squareY + 8 },
            thickness: 1.2,
            color: ink,
          });
        }
        fieldAreas.push({
          id: field.id,
          page: index + 1,
          x,
          y: squareY - 2,
          width,
          height: 15,
          valueX: x,
          valueTop: pageHeight - squareY - 11,
          valueWidth: 11,
          valueHeight: 11,
          maxLines: 1,
          kind: field.kind,
        });
        return top - 25;
      }

      page.drawText(field.label.toUpperCase(), {
        x,
        y: top,
        size: 7.2,
        font: bold,
        color: muted,
      });
      const maxLines =
        field.maxLines ??
        Math.max(
          1,
          wrapLines(displayBondValue(field, { [field.id]: field.value }), width - 6, 9, regular)
            .length,
        );
      const lineY = top - 12 - maxLines * 12;
      if (!options.backgroundOnly) {
        const value = displayBondValue(field, values);
        const lines = wrapLines(value, width - 6, 9, regular);
        if (lines.length > maxLines) {
          throw new Error(`${field.label} is too long for page ${index + 1}. Shorten the value.`);
        }
        lines.forEach((line, lineIndex) => {
          page.drawText(line, {
            x,
            y: top - 16 - lineIndex * 12,
            size: 9,
            font: regular,
            color: ink,
          });
        });
      }
      page.drawLine({
        start: { x, y: lineY },
        end: { x: x + width - 5, y: lineY },
        thickness: 0.5,
        color: lineColor,
      });
      fieldAreas.push({
        id: field.id,
        page: index + 1,
        x,
        y: lineY - 4,
        width,
        height: top - lineY + 14,
        valueX: x,
        valueTop: pageHeight - top + 7,
        valueWidth: width - 6,
        valueHeight: maxLines * 12,
        maxLines,
        kind: field.kind,
      });
      return lineY - 15;
    };

    if (template.style === "school") {
      page.drawRectangle({
        x: 24,
        y: 24,
        width: pageWidth - 48,
        height: pageHeight - 48,
        borderColor: ink,
        borderWidth: 1.4,
      });
    }

    if (template.style === "state") {
      page.drawText(template.issuer.toUpperCase(), {
        x: margin,
        y,
        size: 8,
        font: bold,
        color: ink,
      });
      page.drawText(template.documentCode, {
        x: pageWidth - margin - bold.widthOfTextAtSize(template.documentCode, 8),
        y,
        size: 8,
        font: bold,
        color: muted,
      });
      y -= 22;
      page.drawText(template.formTitle, { x: margin, y, size: 17, font: bold, color: ink });
      y -= 15;
      page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 1.4,
        color: ink,
      });
      y -= 25;
    } else if (template.style === "district") {
      drawCentered(template.issuer.toUpperCase(), 8);
      drawCentered(template.formTitle, 17);
      drawCentered(template.documentCode, 8, regular);
      y -= 9;
    } else {
      drawCentered(template.documentCode, 8, regular);
      drawCentered(template.issuer.toUpperCase(), 9);
      drawCentered(template.formTitle, 17);
      y -= 8;
    }

    y = drawWrapped(pageData.subtitle, margin, y, contentWidth, 10, bold, ink, 15) - 10;
    y = drawWrapped(pageData.intro, margin, y, contentWidth, 9, regular, muted, 14) - 16;

    for (const section of pageData.sections) {
      const sectionStartY = y + 16;
      if (template.style === "district") {
        page.drawRectangle({
          x: margin,
          y: y - 7,
          width: contentWidth,
          height: 23,
          color: pale,
        });
        page.drawLine({
          start: { x: margin, y: y - 7 },
          end: { x: margin + contentWidth, y: y - 7 },
          thickness: 0.7,
          color: lineColor,
        });
      }
      page.drawText(section.heading.toUpperCase(), {
        x: margin + (template.style === "district" ? 8 : 0),
        y,
        size: 9,
        font: bold,
        color: ink,
      });
      y -= 24;

      if (section.body) {
        const inset = template.style === "district" ? 8 : 4;
        y =
          drawWrapped(
            section.body,
            margin + inset,
            y,
            contentWidth - inset * 2,
            9,
            regular,
            ink,
            14,
          ) - 13;
      }

      if (section.fields) {
        const columns = section.columns ?? 1;
        const gap = 17;
        const inset = template.style === "district" ? 8 : 0;
        const columnWidth = (contentWidth - inset * 2 - gap * (columns - 1)) / columns;
        for (let offset = 0; offset < section.fields.length; offset += columns) {
          const row = section.fields.slice(offset, offset + columns);
          let rowBottom = y;
          row.forEach((id, column) => {
            const field = template.fields.find((item) => item.id === id);
            if (!field) throw new Error(`Missing PDF field: ${id}`);
            rowBottom = Math.min(
              rowBottom,
              drawField(field, margin + inset + column * (columnWidth + gap), y, columnWidth),
            );
          });
          y = rowBottom;
        }
        y -= 5;
      }

      if (section.signatures) {
        const inset = template.style === "district" ? 8 : 0;
        const width = (contentWidth - inset * 2 - 25) / 2;
        for (let offset = 0; offset < section.signatures.length; offset += 2) {
          for (const [column, label] of section.signatures.slice(offset, offset + 2).entries()) {
            const x = margin + inset + column * (width + 25);
            page.drawLine({
              start: { x, y: y - 28 },
              end: { x: x + width, y: y - 28 },
              thickness: 0.7,
              color: lineColor,
            });
            page.drawText(label, { x, y: y - 40, size: 8, font: regular, color: muted });
          }
          y -= 63;
        }
      }

      if (template.style === "district") {
        page.drawRectangle({
          x: margin,
          y: y + 4,
          width: contentWidth,
          height: sectionStartY - y - 4,
          borderColor: lineColor,
          borderWidth: 0.7,
        });
      }
      y -= template.style === "district" ? 22 : 9;
    }

    if (y < 61) throw new Error(`Page ${index + 1} has too much content to fit above the footer.`);
    page.drawLine({
      start: { x: margin, y: 47 },
      end: { x: pageWidth - margin, y: 47 },
      thickness: 0.5,
      color: lineColor,
    });
    page.drawText(template.documentCode, {
      x: margin,
      y: 32,
      size: 7.5,
      font: regular,
      color: muted,
    });
    page.drawText(`Page ${index + 1} of 3`, {
      x: pageWidth - margin - regular.widthOfTextAtSize(`Page ${index + 1} of 3`, 7.5),
      y: 32,
      size: 7.5,
      font: regular,
      color: muted,
    });
  }

  return { bytes: await pdf.save(), fieldAreas, pageSize };
}
