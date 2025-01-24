// server.js
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import winston from "winston";
import { createObjectCsvWriter } from "csv-writer";

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

// Load System Prompt
const loadSystemPrompt = async () => {
  try {
    const systemPromptPath = path.join(
      __dirname,
      "prompts",
      "system_prompt.txt"
    );
    const systemPrompt = await fs.readFile(systemPromptPath, "utf-8");
    return systemPrompt;
  } catch (error) {
    logger.error("Error loading system prompt:", { message: error.message });
    throw error;
  }
};

// Define CSV Schema for Mapped Accounts
const csvHeaders = [
  { id: "accountNumber", title: "accountNumber" },
  { id: "accountName", title: "accountName" },
  { id: "mapping", title: "mapping" },
];

// Function to Save AI Response as CSV
const saveResponseAsCSV = async (csvData, outputPath) => {
  const csvWriter = createObjectCsvWriter({
    path: outputPath,
    header: csvHeaders,
  });

  try {
    await csvWriter.writeRecords(csvData);
    logger.info(`Saved AI response to CSV at ${outputPath}`);
  } catch (error) {
    logger.error("Error saving CSV:", { message: error.message });
    throw error;
  }
};

// POST /process-accounts endpoint
app.post(
  "/process-accounts",
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
      // Load System Prompt
      const systemPrompt = await loadSystemPrompt();

      // Construct User Prompt
      let userPrompt =
        "Please process the following unmapped accounts and assign appropriate mappings based on historical data. Provide the output in CSV format matching the mapped_accounts.csv file structure, including columns for accountNumber, accountName, and mapping.\n\n";
      userPrompt += "Unmapped Accounts Data:\n";
      userPrompt += "| accountNumber | accountName | \n";
      userPrompt += "|---------------|-------------|\n";
      unmappedAccountsData.forEach((account) => {
        // Escape double quotes in accountName
        const accountName = account["accountName"].replace(/"/g, '""');
        userPrompt += `| ${account["accountNumber"]} | "${accountName}" |\n`;
      });

      // Combine System and User Prompts
      // Note: In Chat API, system and user prompts are separate; no need to combine them.
      // However, system prompt is provided as a separate message.

      // Send Request to OpenAI's Chat Completion API
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4", // Ensure your API plan supports this
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3, // Adjust for determinism
          max_tokens: 1000, // Adjust based on expected response length
          n: 1,
          stop: null,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        }
      );

      const aiResponse = response.data.choices[0].message.content;

      // Log the AI response
      logger.info("AI Response:", aiResponse);

      // Parse AI Response to CSV Format
      // Basic parsing assuming the AI returns well-formatted CSV
      const lines = aiResponse.trim().split("\n");

      // Validate CSV headers
      const responseHeaders = lines[0]
        .split(",")
        .map((header) => header.trim().toLowerCase());
      const expectedHeaders = ["accountnumber", "accountname", "mapping"];

      const headersMatch = expectedHeaders.every(
        (header, index) => header === responseHeaders[index]
      );

      if (!headersMatch) {
        logger.error("AI response headers do not match the expected format.");
        return res
          .status(500)
          .json({
            error: "AI response format mismatch. Please check the AI's output.",
          });
      }

      // Process each line into JSON objects
      const csvData = lines.slice(1).map((line) => {
        const values = line.split(",").map((value) => value.trim());

        // Handle cases where accountName might contain commas and be enclosed in quotes
        let accountNumber, accountName, mapping;

        if (values.length > 3) {
          // Join all values beyond the first two for accountName and mapping
          accountNumber = values[0];
          // Assuming accountName is the second value, possibly enclosed in quotes
          accountName = values[1].replace(/^"|"$/g, "").replace(/""/g, '"');
          mapping = values.slice(2).join(", ");
        } else {
          accountNumber = values[0];
          accountName = values[1].replace(/^"|"$/g, "").replace(/""/g, '"');
          mapping = values[2];
        }

        return {
          accountNumber,
          accountName,
          mapping,
        };
      });

      // Define Output Path
      const timestamp = Date.now();
      const outputPath = path.join(
        __dirname,
        "results",
        `processed_accounts_${timestamp}.csv`
      );

      // Ensure Results Directory Exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Save CSV Data
      await saveResponseAsCSV(csvData, outputPath);

      // Respond to Client
      res.json({ message: "Accounts processed successfully.", outputPath });
    } catch (error) {
      logger.error("Error processing accounts:", {
        message: error.response ? error.response.data : error.message,
      });
      res.status(500).json({ error: "Failed to process accounts." });
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
