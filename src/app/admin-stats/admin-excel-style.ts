import { Workbook, Worksheet } from 'exceljs';

export function reportSheet(book: Workbook, stamp: string, name: string, headers: string[], widths: number[], note: string): Worksheet {
    const s = book.addWorksheet(name, { properties: { tabColor: { argb: 'FFB4232B' } },
      views: [{ state: 'frozen', ySplit: 4, xSplit: 1 }],
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:4' } });
    s.columns = widths.map(width => ({ width }));
    s.addRow([name]); s.mergeCells(1, 1, 1, headers.length);
    s.addRow([stamp]); s.mergeCells(2, 1, 2, headers.length);
    s.addRow([note]); s.mergeCells(3, 1, 3, headers.length);
    s.addRow(headers);
    return s;
  }

export function styleWorkbook(book: Workbook) {
  book.eachSheet(s => {
    s.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, s.rowCount), column: s.columnCount } };
    s.eachRow((r, index) => {
      r.height ??= index <= 3 ? 32 : 36;
      r.eachCell({ includeEmpty: true }, cell => {
        cell.alignment = { vertical: 'top', wrapText: true };
        if (!cell.font?.color) cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF202027' } };
        if (index > 4 && index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F7' } };
        if (index === 1 || index === 4) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index === 1 ? 'FF17171D' : 'FFB4232B' } };
          cell.font = { name: 'Calibri', size: index === 1 ? 18 : 11, bold: true, color: { argb: 'FFFFFFFF' } };
        }
        if (index > 4 && (['Code and Questions', 'Test Case Content'].includes(s.name)) && Number(cell.col) === s.columnCount) cell.font = { name: 'Consolas', size: 10 };
      });
    });
    s.headerFooter.oddFooter = '&LCodeReport · Confidential&RPage &P of &N';
  });

}

