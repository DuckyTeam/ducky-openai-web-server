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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes.",
});
app.use(limiter);

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
    const absolutePath = path.resolve(__dirname, filePath);

    // Check if file exists
    await fs.access(absolutePath);

    // Validate file extension based on purpose
    const allowedFileTypes = {
      assistants: [".csv"],
      "fine-tune": [".jsonl"],
      batch: [".jsonl"],
      vision: [".png", ".jpg", ".jpeg", ".gif"], // Example image formats
    };

    const fileExtension = path.extname(filePath).toLowerCase();
    if (!allowedFileTypes[purpose].includes(fileExtension)) {
      throw new Error(
        `File type '${fileExtension}' is not allowed for purpose '${purpose}'. Allowed types: ${allowedFileTypes[
          purpose
        ].join(", ")}.`
      );
    }

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
        const absolutePath = path.resolve(__dirname, filePath);
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


// POST /upload endpoint with validation
app.post(
  "/upload",
  [
    body("purpose")
      .isIn(["assistants", "fine-tune", "batch", "vision"])
      .withMessage(
        "Invalid purpose. Must be one of assistants, fine-tune, batch, vision."
      ),
    body("files")
      .isArray({ min: 1 })
      .withMessage("Files must be provided as a non-empty array."),
    body("files.*").isString().withMessage("Each file path must be a string."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors:", { errors: errors.array() });
      return res.status(400).json({ errors: errors.array() });
    }

    const { purpose, files } = req.body;

    if (!files || files.length === 0) {
      logger.warn("No files provided for upload.");
      return res.status(400).json({ error: "No files provided for upload." });
    }

    try {
      const uploadResults = await Promise.allSettled(
        files.map((filePath) => uploadFileToOpenAI(filePath, purpose))
      );

      const successfulUploads = [];
      const failedUploads = [];

      uploadResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          successfulUploads.push(result.value);
        } else {
          failedUploads.push({
            file: files[index],
            reason: result.reason.response
              ? result.reason.response.data.error.message
              : result.reason.message,
          });
        }
      });

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

/**
 * POST /generate endpoint to handle prompt submissions.
 * Expects:
 * - prompt: string (the user's prompt)
 * - unmappedAccountsData: array of objects (unmapped accounts data)
 */
app.post(
  "/generate",
  [
    body("prompt").isString().withMessage("prompt must be a string."),
    body("unmappedAccountsData")
      .isArray({ min: 1 })
      .withMessage("unmappedAccountsData must be a non-empty array."),
    body("unmappedAccountsData.*.Account ID")
      .exists()
      .withMessage("Each account must have an Account ID."),
    body("unmappedAccountsData.*.Account Name")
      .exists()
      .withMessage("Each account must have an Account Name."),
    body("unmappedAccountsData.*.Spend ($)")
      .exists()
      .withMessage("Each account must have a Spend ($) value."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in /generate:", {
        errors: errors.array(),
      });
      return res.status(400).json({ errors: errors.array() });
    }

    const { prompt, unmappedAccountsData } = req.body;

    // Define file paths for context
    const contextFilePaths = [
      "projects/mappingTest/mapped_accounts.csv",
      "projects/mappingTest/emission_factors.csv",
      "projects/mappingTest/commonly_used_expenses.csv",
    ];

    let fileContext = "";
    try {
      fileContext = await getFilesContent(contextFilePaths);
    } catch (error) {
      logger.error("Failed to read context files for /generate:", {
        message: error.message,
      });
      return res
        .status(500)
        .json({ error: "Failed to read context files for prompt generation." });
    }

    // Convert unmappedAccountsData to markdown table
    const unmappedTableHeader =
      "| Account ID | Account Name         | Spend ($) |\n|------------|----------------------|-----------|";
    const unmappedTableRows = unmappedAccountsData
      .map(
        (account) =>
          `| ${account["Account ID"]} | ${account["Account Name"]} | ${account["Spend ($)"]} |`
      )
      .join("\n");
    const unmappedTable = `${unmappedTableHeader}\n${unmappedTableRows}`;

    // Construct the full prompt
    const fullPrompt = `
**System:**
You are an AI assistant specialized in environmental accounting and financial analysis. Your primary tasks include calculating and estimating emissions, assigning spend-based emission factors to accounts, and identifying commonly expensed items within given accounts. You have access to the following uploaded files for context:

1. **Mapped Accounts File (\`mapped_accounts.csv\`)**: Contains examples of accounts with their corresponding emission factors.
2. **Emission Factors File (\`emission_factors.csv\`)**: Lists various emission factors based on different spend categories.
3. **Common Expenses File (\`commonly_used_expenses.csv\`)**: Details frequently occurring expenses associated with different accounts.

Utilize the \`accounts_mapping_helper_no.csv\` as a basis for predicting which emission factors belong to a particular account. Do not reference or require the \`unmapped_accounts.csv\` file; any unmapped data should be provided directly within the user prompts.

**User:**
${prompt}

**Unmapped Accounts Data:**
\`\`\`
${unmappedTable}
\`\`\`
`;

    // Prepare messages for OpenAI Chat Completion
    const messages = [
      {
        role: "system",
        content: `You are an AI assistant specialized in environmental accounting and financial analysis. You have access to the following context:

${fileContext}`,
      },
      {
        role: "user",
        content: fullPrompt,
      },
    ];

    // Construct the request payload
    const requestPayload = {
      model: "gpt-4", // Ensure you have access to this model
      messages: messages,
      temperature: 0.7, // Adjust as needed
      max_tokens: 1500, // Adjust based on expected response length
    };

    // Log the request payload
    logger.info("Generating AI response with payload:", requestPayload);

    try {
      const completion = await client.chat.completions.create(requestPayload);

      const responseText = completion.choices[0].message.content;

      // Log the response
      logger.info("AI Generated Response:", responseText);

      // Send the response back to the client
      res.json({ response: responseText });
    } catch (error) {
      logger.error("Error generating AI response:", {
        message: error.response ? error.response.data : error.message,
      });
      res
        .status(500)
        .json({ error: "An error occurred while generating the AI response." });
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
