// server.js
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import winston from "winston";
import createBatchInputFile from "./utils/createBatchInput.js";
import uploadBatchFile from "./utils/uploadBatchFile.js";
import createBatchJob from "./utils/createBatchJob.js";
import pollBatchStatus from "./utils/pollBatchStatus.js";
import retrieveBatchResults from "./utils/retrieveBatchResults.js";
import parseBatchResults from "./utils/parseBatchResults.js";
import fs from "fs/promises";

// Handle __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Setup Winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

// Middleware to parse JSON bodies
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes.",
});
app.use(limiter);

// Endpoint to initiate batch processing
app.post(
  "/initiate-batch",
  [
    body("unmappedAccountsData")
      .isArray({ min: 1 })
      .withMessage("unmappedAccountsData must be a non-empty array."),
    body("unmappedAccountsData.*.accountNumber")
      .exists()
      .withMessage("Each account must have an accountNumber."),
    body("unmappedAccountsData.*.accountName")
      .exists()
      .withMessage("Each account must have an accountName."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors:", { errors: errors.array() });
      return res.status(400).json({ errors: errors.array() });
    }

    const { unmappedAccountsData } = req.body;

    try {
      // 1. Create Batch Input File
      const batchInputPath = path.join(__dirname, "batch_input.jsonl");
      createBatchInputFile(unmappedAccountsData, batchInputPath);
      logger.info(`Batch input file created at ${batchInputPath}`);

      // 2. Upload Batch Input File
      const uploadedFile = await uploadBatchFile(batchInputPath);
      logger.info(`Batch input file uploaded with ID: ${uploadedFile.id}`);

      // 3. Create Batch Job
      const batchJob = await createBatchJob(
        uploadedFile.id,
        "/v1/chat/completions",
        "24h",
        { project: "EmissionFactorAssignment" } // Optional metadata
      );
      logger.info(`Batch job created with ID: ${batchJob.id}`);

      // 4. Respond to Client with Batch ID
      res.json({
        message: "Batch job initiated successfully.",
        batchId: batchJob.id,
      });
    } catch (error) {
      logger.error("Error initiating batch job:", {
        message: error.response ? error.response.data : error.message,
      });
      res
        .status(500)
        .json({
          error: "Failed to initiate batch job.",
          details: error.message,
        });
    }
  }
);

// Endpoint to check batch status
app.get("/batch-status/:batchId", async (req, res) => {
  const { batchId } = req.params;

  try {
    const status = await pollBatchStatus(batchId);
    res.json({ batchId, status });
  } catch (error) {
    logger.error("Error checking batch status:", {
      message: error.response ? error.response.data : error.message,
    });
    res
      .status(500)
      .json({ error: "Failed to check batch status.", details: error.message });
  }
});

// Endpoint to retrieve batch results
app.get("/batch-results/:batchId", async (req, res) => {
  const { batchId } = req.params;

  try {
    // Retrieve batch metadata
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const batch = await openai.batches.retrieve(batchId);

    if (batch.status !== "completed") {
      return res
        .status(400)
        .json({
          error: `Batch is not completed. Current status: ${batch.status}`,
        });
    }

    // Retrieve output file
    const outputFileId = batch.output_file_id;
    const destinationPath = path.join(
      __dirname,
      "results",
      `batch_output_${batchId}.jsonl`
    );
    await retrieveBatchResults(outputFileId, destinationPath);

    // Parse the results
    const parsedResults = await parseBatchResults(destinationPath);

    res.json({ batchId, results: parsedResults });
  } catch (error) {
    logger.error("Error retrieving batch results:", {
      message: error.response ? error.response.data : error.message,
    });
    res
      .status(500)
      .json({
        error: "Failed to retrieve batch results.",
        details: error.message,
      });
  }
});

// Start the server
app.listen(port, () => {
  logger.info(`Server is running on port ${port}`);
});

// Handle unhandled promise rejections and exceptions
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", {
    promise,
    reason: reason.message || reason,
  });
  // Optionally exit the process or perform cleanup
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception thrown:", {
    message: error.message,
    stack: error.stack,
  });
  // Optionally exit the process or perform cleanup
});
