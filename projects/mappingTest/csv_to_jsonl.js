import fs from "fs/promises";
import path from "path";
import csv from "csv-parser";

async function convertCsvToJsonl(csvFilePath, jsonlFilePath) {
  const results = [];
  const fileStream = await fs.open(csvFilePath, "r");

  return new Promise((resolve, reject) => {
    fileStream
      .createReadStream()
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", async () => {
        const jsonlData = results.map((obj) => JSON.stringify(obj)).join("\n");
        await fs.writeFile(jsonlFilePath, jsonlData);
        resolve();
      })
      .on("error", (error) => reject(error));
  });
}

// Example Usage
(async () => {
  try {
    await convertCsvToJsonl(
      "projects/mappingTest/accounts_mapping_helper_no.csv",
      "projects/mappingTest/accounts_mapping_helper_no.jsonl"
    );
    console.log("Conversion Successful!");
  } catch (error) {
    console.error("Error converting CSV to JSONL:", error);
  }
})();
