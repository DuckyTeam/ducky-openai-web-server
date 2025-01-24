// utils/uploadBatchFile.js
import fs from "fs";
import { OpenAI } from "openai";

/**
 * Uploads a batch input file to OpenAI's Files API.
 * @param {String} filePath - Path to the batch_input.jsonl file.
 * @returns {Object} - Uploaded file metadata.
 */
const uploadBatchFile = async (filePath) => {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const response = await openai.files.create({
      file: fs.createReadStream(filePath),
      purpose: "batch",
    });

    console.log("File uploaded successfully:", response);
    return response;
  } catch (error) {
    console.error(
      "Error uploading file:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
};

export default uploadBatchFile;
