// utils/createBatchInput.js
import fs from "fs";
import path from "path";

/**
 * Generates a batch_input.jsonl file from unmapped accounts data.
 * @param {Array} unmappedAccounts - Array of account objects.
 * @param {String} filePath - Path to save the batch_input.jsonl file.
 */
const createBatchInputFile = (unmappedAccounts, filePath) => {
  const writeStream = fs.createWriteStream(filePath, { flags: "w" });

  unmappedAccounts.forEach((account, index) => {
    const request = {
      custom_id: `request-${index + 1}`,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant specialized in environmental accounting and financial analysis.",
          },
          {
            role: "user",
            content: `Assign appropriate mappings and emission factors to account number ${account.accountNumber}, named "${account.accountName}".`,
          },
        ],
        max_tokens: 1500,
      },
    };

    writeStream.write(`${JSON.stringify(request)}\n`);
  });

  writeStream.end();
};

export default createBatchInputFile;
