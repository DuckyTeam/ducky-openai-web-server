// utils/createBatch.js
import { Configuration, OpenAIApi } from "openai";

/**
 * Creates a batch job using the uploaded file.
 * @param {String} fileId - ID of the uploaded batch_input.jsonl file.
 * @param {String} endpoint - API endpoint (e.g., "/v1/chat/completions").
 * @param {String} completionWindow - Time window for completion (e.g., "24h").
 * @param {Object} [metadata] - Optional metadata.
 * @returns {Object} - Batch job metadata.
 */
const createBatchJob = async (
  fileId,
  endpoint,
  completionWindow,
  metadata = {}
) => {
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const openai = new OpenAIApi(configuration);

  try {
    const response = await openai.createBatch({
      input_file_id: fileId,
      endpoint: endpoint,
      completion_window: completionWindow,
      metadata: metadata,
    });

    console.log("Batch created successfully:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "Error creating batch:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
};

export default createBatchJob;
