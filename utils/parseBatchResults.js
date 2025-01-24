// utils/parseBatchResults.js
import fs from "fs";
import readline from "readline";

/**
 * Parses the batch output file and maps responses to custom_ids.
 * @param {String} filePath - Path to the batch_output.jsonl file.
 * @returns {Object} - Mapping of custom_id to responses.
 */
const parseBatchResults = async (filePath) => {
  const fileStream = fs.createReadStream(filePath);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const results = {};

  for await (const line of rl) {
    if (line.trim() === "") continue;
    try {
      const parsed = JSON.parse(line);
      const { custom_id, response, error } = parsed;

      if (error) {
        results[custom_id] = { error: error.message };
      } else {
        results[custom_id] = response.body.choices[0].message.content;
      }
    } catch (err) {
      console.error("Error parsing line:", line, err.message);
    }
  }

  return results;
};

export default parseBatchResults;
