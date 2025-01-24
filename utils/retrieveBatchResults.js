// utils/retrieveBatchResults.js
import { OpenAI } from "openai";
import fs from "fs";
import path from "path";

/**
 * Retrieves the output file content of a completed batch job.
 * @param {String} outputFileId - ID of the output file.
 * @param {String} destinationPath - Path to save the downloaded results.
 */
const retrieveBatchResults = async (outputFileId, destinationPath) => {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const fileResponse = await openai.files.retrieveContent(outputFileId);
    const fileContents = await fileResponse.text();

    fs.writeFileSync(destinationPath, fileContents, "utf-8");
    console.log(`Batch results saved to ${destinationPath}`);
  } catch (error) {
    console.error(
      "Error retrieving batch results:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
};

export default retrieveBatchResults;
