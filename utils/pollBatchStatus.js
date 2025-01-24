// utils/pollBatchStatus.js
import { OpenAI } from "openai";

/**
 * Polls the status of a batch job until completion or failure.
 * @param {String} batchId - ID of the batch job.
 * @param {Number} interval - Polling interval in milliseconds.
 * @param {Number} maxAttempts - Maximum number of polling attempts.
 * @returns {String} - Final batch job status.
 */
const pollBatchStatus = async (batchId, interval = 5000, maxAttempts = 60) => {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  let attempts = 0;
  let batchStatus = null;

  while (attempts < maxAttempts) {
    try {
      const response = await openai.batches.retrieve(batchId);
      batchStatus = response.status;
      console.log(`Batch Status [Attempt ${attempts + 1}]: ${batchStatus}`);

      if (
        ["completed", "failed", "expired", "cancelled"].includes(batchStatus)
      ) {
        break;
      }

      // Wait for the specified interval before next poll
      await new Promise((resolve) => setTimeout(resolve, interval));
      attempts++;
    } catch (error) {
      console.error(
        "Error retrieving batch status:",
        error.response ? error.response.data : error.message
      );
      throw error;
    }
  }

  if (
    attempts === maxAttempts &&
    !["completed", "failed", "expired", "cancelled"].includes(batchStatus)
  ) {
    throw new Error("Batch polling timed out.");
  }

  return batchStatus;
};

export default pollBatchStatus;
