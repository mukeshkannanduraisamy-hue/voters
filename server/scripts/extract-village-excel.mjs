/**
 * Standalone CLI Utility: Extract Village from Excel files.
 *
 * Usage:
 *   node server/scripts/extract-village-excel.mjs <input-file.xlsx> [output-file.xlsx]
 *
 * Example:
 *   node server/scripts/extract-village-excel.mjs voters.xlsx voters_with_village.xlsx
 */

import fs from 'node:fs';
import path from 'node:path';
let ExcelJS;
try {
  ExcelJS = (await import('exceljs')).default;
} catch {
  ExcelJS = (await import('../node_modules/exceljs/dist/es5/index.js')).default;
}
import { extractVillageFromSection } from '../src/lib/villageExtractor.js';

async function main() {
  const args = process.argv.slice(2);
  const inputFile = args[0];

  if (!inputFile) {
    console.log(`
Usage:
  node server/scripts/extract-village-excel.mjs <input.xlsx> [output.xlsx]

Description:
  Reads an Excel spreadsheet, finds the 'section_title_ta' column,
  and inserts a new column 'section_village_ta' with the extracted village name.
`);
    process.exit(1);
  }

  const resolvedInput = path.resolve(process.cwd(), inputFile);
  if (!fs.existsSync(resolvedInput)) {
    console.error(`Error: Input file not found: ${resolvedInput}`);
    process.exit(1);
  }

  const outputFile = args[1]
    ? path.resolve(process.cwd(), args[1])
    : resolvedInput.replace(/\.xlsx$/i, '_with_village.xlsx');

  console.log(`\nReading Excel workbook: ${resolvedInput}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolvedInput);

  let totalProcessed = 0;

  for (const worksheet of workbook.worksheets) {
    console.log(`Scanning worksheet: "${worksheet.name}"...`);

    // Find the header row (typically row 1)
    const headerRow = worksheet.getRow(1);
    let sectionColIndex = -1;

    headerRow.eachCell((cell, colNumber) => {
      const val = String(cell.value || '').trim().toLowerCase();
      if (
        val === 'section_title_ta' ||
        val === 'section_title' ||
        val.includes('section_title') ||
        val.includes('பிரிவு எண் மற்றும் பெயர்') ||
        val.includes('பிரிவு')
      ) {
        sectionColIndex = colNumber;
      }
    });

    if (sectionColIndex === -1) {
      console.log(`  -> Column "section_title_ta" not found in "${worksheet.name}". Skipping sheet.`);
      continue;
    }

    console.log(`  -> Found section column at column index ${sectionColIndex} ("${headerRow.getCell(sectionColIndex).value}")`);

    // Splice in the new village column right after the section column
    const villageColIndex = sectionColIndex + 1;
    worksheet.spliceColumns(villageColIndex, 0, []);

    // Set header for the new column
    const villageHeaderCell = worksheet.getRow(1).getCell(villageColIndex);
    villageHeaderCell.value = 'section_village_ta';
    villageHeaderCell.font = { bold: true };

    let sheetCount = 0;
    const rowCount = worksheet.rowCount;

    for (let rowNumber = 2; rowNumber <= rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const sectionVal = row.getCell(sectionColIndex).value;
      const extracted = extractVillageFromSection(sectionVal);

      row.getCell(villageColIndex).value = extracted || '';
      sheetCount++;
    }

    console.log(`  -> Extracted village names for ${sheetCount.toLocaleString()} rows in "${worksheet.name}".`);
    totalProcessed += sheetCount;
  }

  console.log(`\nSaving modified workbook to: ${outputFile}`);
  await workbook.xlsx.writeFile(outputFile);
  console.log(`Successfully completed! Total rows processed: ${totalProcessed.toLocaleString()}\n`);
}

main().catch((err) => {
  console.error('[extract-village-excel error]', err);
  process.exit(1);
});
