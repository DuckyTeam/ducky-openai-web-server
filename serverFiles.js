// server.js
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import axios from "axios";
import FormData from "form-data";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import cors from "cors";
import winston from "winston";

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

// CORS configuration (adjust origin as needed)
const corsOptions = {
  origin: "http://your-frontend-domain.com", // Replace with your frontend URL
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes.",
});
app.use(limiter);

// Serve static files from the root directory (for index.html)
app.use(express.static(__dirname));

// OpenAI configuration using the new client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure this is set in your .env file
});

/**
 * Uploads a single file to OpenAI.
 * @param {string} filePath - The path to the file to upload.
 * @param {string} purpose - The purpose of the file ('assistants', 'fine-tune', etc.).
 * @returns {Promise<Object>} - The response from OpenAI.
 */
async function uploadFileToOpenAI(filePath, purpose) {
  try {
    const absolutePath = path.join(__dirname, filePath);
    const fileStream = await fs.readFile(absolutePath);

    const form = new FormData();
    form.append("file", fileStream, path.basename(filePath));
    form.append("purpose", purpose);

    const response = await axios.post("https://api.openai.com/v1/files", form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    logger.info(`Uploaded file: ${filePath}`, response.data);
    return response.data;
  } catch (error) {
    logger.error(`Error uploading file: ${filePath}`, {
      message: error.response ? error.response.data : error.message,
    });
    throw error;
  }
}

/**
 * Reads multiple files and concatenates their content.
 * @param {Array<string>} filePaths - Array of file paths to read.
 * @returns {Promise<string>} - Concatenated content of all files.
 */
async function getFilesContent(filePaths) {
  try {
    const contents = await Promise.all(
      filePaths.map(async (filePath) => {
        const absolutePath = path.join(__dirname, filePath);
        const data = await fs.readFile(absolutePath, "utf-8");
        return data;
      })
    );
    return contents.join("\n\n"); // Separate files by double newline
  } catch (error) {
    logger.error("Error reading files:", { message: error.message });
    throw error;
  }
}

/**
 * Counts the number of tokens in a given text.
 * @param {string} text - The text to encode.
 * @returns {number} - Estimated token count.
 */
function countTokens(text) {
  // Placeholder function; implement with a real encoder if needed
  return text.split(/\s+/).length; // Simple word count approximation
}

// POST /upload endpoint with validation
app.post(
  "/upload",
  [
    body("projectName").isString().withMessage("projectName must be a string."),
    body("purpose")
      .isIn(["assistants", "fine-tune", "batch", "vision"])
      .withMessage(
        "Invalid purpose. Must be one of assistants, fine-tune, batch, vision."
      ),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors:", { errors: errors.array() });
      return res.status(400).json({ errors: errors.array() });
    }

    const { projectName, purpose } = req.body;

    // Define file paths based on projectName
    let filePaths = [];
    if (projectName === "mappingTest") {
      filePaths = [
        "projects/mappingTest/accounts_mapping_helper_no.csv",
        "projects/mappingTest/emission_factors.csv",
        "projects/mappingTest/mapped_accounts.csv",
        "projects/mappingTest/unmapped_accounts.csv",
      ];
    } else {
      logger.warn("Invalid projectName provided:", { projectName });
      return res.status(400).json({ error: "Invalid projectName provided." });
    }

    try {
      const uploadResults = await Promise.allSettled(
        filePaths.map((filePath) => uploadFileToOpenAI(filePath, purpose))
      );

      const successfulUploads = uploadResults
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);

      const failedUploads = uploadResults
        .filter((result) => result.status === "rejected")
        .map((result, index) => ({
          file: filePaths[index],
          reason: result.reason.response
            ? result.reason.response.data
            : result.reason.message,
        }));

      res.json({
        successfulUploads,
        failedUploads,
      });
    } catch (error) {
      logger.error("Failed to upload files to OpenAI:", {
        message: error.message,
      });
      res.status(500).json({ error: "Failed to upload files to OpenAI." });
    }
  }
);

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
