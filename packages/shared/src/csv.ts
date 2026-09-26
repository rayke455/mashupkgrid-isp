/**
 * CSV for spreadsheet users: RFC 4180 quoting, CRLF line ends, a UTF-8 BOM so Excel reads
 * accented names and currency symbols correctly, and a leading apostrophe-free guard against
 * formula injection (a cell starting with =, +, - or @ would otherwise execute in Excel).
 */
export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => string | number | boolean | Date | null | undefined;
}

function cell(value: string | number | boolean | Date | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  // "+254700000001" is a phone number, not a formula; "=SUM(...)", "@cmd" or "-2+3" are.
  if (/^[=@\t\r]/.test(text) || /^[+\-](?!\d)/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<Row>(rows: readonly Row[], columns: readonly CsvColumn<Row>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
