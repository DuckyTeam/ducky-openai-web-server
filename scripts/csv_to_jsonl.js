import fs from "fs/promises";
import path from "path";

async function convertCsvToJsonl(csvFilePath, jsonlFilePath) {
  const data = await fs.readFile(csvFilePath, "utf-8");
  const lines = data.split("\n");
  const headers = lines[0].split(",").map((header) => header.trim());

  const jsonlData = lines
    .slice(1)
    .map((line) => {
      const values = line.split(",").map((value) => value.trim());
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index];
      });
      return JSON.stringify(obj);
    })
    .join("\n");

  await fs.writeFile(jsonlFilePath, jsonlData);
  console.log(`Converted ${csvFilePath} to ${jsonlFilePath}`);
}

// Example Usage
(async () => {
  try {
    await convertCsvToJsonl(
      "../projects/mappingTest/unmapped_accounts.csv",
      "../projects/mappingTest/unmapped_accounts.jsonl"
    );
    console.log("Conversion Successful!");
  } catch (error) {
    console.error("Error converting CSV to JSONL:", error);
  }
})();
