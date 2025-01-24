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

// Function to parse JSONL files
const parseJSONLFile = async (filePath) => {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const lines = data.trim().split("\n");
    return lines.map((line) => JSON.parse(line));
  } catch (error) {
    logger.error(`Error reading or parsing ${filePath}:`, {
      message: error.message,
    });
    throw error;
  }
};

// Function to load all necessary data files
const loadDataFiles = async () => {
  try {
    const mappedAccountsPath = path.join(
      __dirname,
      "files",
      "mapped_accounts.jsonl"
    );
    const mappingHelperPath = path.join(
      __dirname,
      "files",
      "accounts_mapping_helper_no.jsonl"
    );
    const emissionFactorsPath = path.join(
      __dirname,
      "files",
      "emission_factors.jsonl"
    );

    const [mappedAccounts, mappingHelper, emissionFactors] = await Promise.all([
      parseJSONLFile(mappedAccountsPath),
      parseJSONLFile(mappingHelperPath),
      parseJSONLFile(emissionFactorsPath),
    ]);

    return { mappedAccounts, mappingHelper, emissionFactors };
  } catch (error) {
    logger.error("Error loading data files:", { message: error.message });
    throw error;
  }
};

// Function to construct the AI prompt
const constructPrompt = (
  unmappedAccounts,
  mappedAccounts,
  emissionFactors,
  mappingHelper
) => {
  // Example: Creating a mapping dictionary from mappedAccounts
  const mappingDict = {};
  mappedAccounts.forEach((account) => {
    mappingDict[account.accountNumber] = {
      accountName: account.accountName,
      mapping: account.mapping,
    };
  });

  // Example: Creating an emission factors dictionary
  const emissionFactorDict = {};
  emissionFactors.forEach((factor) => {
    emissionFactorDict[factor.category] = factor.value;
  });

  // Construct the prompt
  let prompt = `
You are an AI assistant specialized in environmental accounting and financial analysis. You have access to the following data:

**Mapped Accounts:**
${JSON.stringify(mappingDict, null, 2)}

**Emission Factors:**
${JSON.stringify(emissionFactorDict, null, 2)}

**Mapping Helper (Norwegian):**
${JSON.stringify(mappingHelper, null, 2)}

Your task is to process the following unmapped accounts and assign appropriate mappings and emission factors based on the historical data provided above. Provide the output in CSV format with the following columns: accountNumber, accountName, mapping, emissionFactor.

**Unmapped Accounts:**
| accountNumber | accountName |
|---------------|-------------|
${unmappedAccounts
  .map(
    (acc) =>
      `| ${acc.accountNumber} | "${acc.accountName.replace(/"/g, '""')}" |`
  )
  .join("\n")}
`;

  return prompt;
};

// Function to save raw AI response
const saveRawResponse = async (rawData, outputPath) => {
  try {
    await fs.writeFile(outputPath, rawData, "utf-8");
    logger.info(`Saved AI response to file at ${outputPath}`);
  } catch (error) {
    logger.error("Error saving raw response:", { message: error.message });
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
      const systemPromptPath = path.join(
        __dirname,
        "prompts",
        "system_prompt.txt"
      );
      const systemPrompt = await fs.readFile(systemPromptPath, "utf-8");

      // Load Data Files
      const { mappedAccounts, mappingHelper, emissionFactors } =
        await loadDataFiles();

      // Construct Prompt
      const prompt = constructPrompt(
        unmappedAccountsData,
        mappedAccounts,
        emissionFactors,
        mappingHelper
      );

      // Send Request to OpenAI's Chat Completion API
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4", // Ensure your API plan supports this
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.3, // Adjust for determinism
          max_tokens: 1500, // Adjust based on expected response length
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

      // Define Output Path
      const timestamp = Date.now();
      const outputPath = path.join(
        __dirname,
        "results",
        `raw_response_${timestamp}.txt`
      );

      // Ensure Results Directory Exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Save Raw AI Response
      await saveRawResponse(aiResponse, outputPath);

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
