// utils/retrieveBatchResults.js
import OpenAI from "openai"; // Default import for v4
import fs from "fs";
import path from "path";

/**
 * Retrieves the output file content of a completed batch job.
 * @param {String} outputFileId - ID of the output file.
 * @param {String} destinationPath - Path to save the downloaded results.
 */
const retrieveBatchResults = async (outputFileId, destinationPath) => {
  // Initialize OpenAI client (reads API key from environment variables)
  const openai = new OpenAI();

  try {
    // Retrieve the content of the output file by passing the file ID as a string
    const fileResponse = await openai.files.content(outputFileId);

    // Read the response as text
    const fileContents = await fileResponse.text();

    // Ensure the destination directory exists
    const dir = path.dirname(destinationPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write the contents to the destination path
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
