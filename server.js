// server.js
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Handle __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// OpenAI configuration using the new client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure this is set in your .env file
});

// POST /generate endpoint for standard responses
app.post("/generate", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  // Construct the request payload
  const requestPayload = {
    model: "gpt-4", // Verify if 'gpt-4o' is correct or should be 'gpt-4'
    messages: [{ role: "user", content: prompt }],
    // Add additional parameters here if needed
  };

  // Log the request payload
  console.log("Request Payload:", JSON.stringify(requestPayload, null, 2));

  try {
    const completion = await client.chat.completions.create(requestPayload);

    const responseText = completion.choices[0].message.content;

    // Save response to a file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `response-${timestamp}.txt`;
    const filePath = path.join(__dirname, "responses", filename);

    // Ensure the responses directory exists
    fs.mkdirSync(path.join(__dirname, "responses"), { recursive: true });

    fs.writeFile(filePath, responseText, (err) => {
      if (err) {
        console.error("Error writing to file", err);
        // Not sending error to client as response was already generated
      } else {
        console.log(`Response saved to ${filePath}`);
      }
    });

    // Log the response
    console.log("OpenAI Response:", JSON.stringify(completion, null, 2));

    // Send the response back to the client
    res.json({ response: responseText });
  } catch (error) {
    console.error(
      "Error with OpenAI API:",
      error.response
        ? JSON.stringify(error.response.data, null, 2)
        : error.message
    );
    res
      .status(500)
      .json({ error: "An error occurred while processing your request." });
  }
});

// POST /generate-stream endpoint for streaming responses
app.post("/generate-stream", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const stream = await client.chat.completions.create({
      model: "gpt-4", // Verify if 'gpt-4o' is correct or should be 'gpt-4'
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders(); // Flush the headers to establish SSE with the client

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${content}\n\n`);
      }
    }

    res.write("event: end\ndata: [DONE]\n\n");
    res.end();

    // Optionally, save the complete response to a file
    // Implement logic to accumulate chunks and save after completion if needed
  } catch (error) {
    console.error(
      "Error with OpenAI API:",
      error.response ? error.response.data : error.message
    );
    res
      .status(500)
      .json({ error: "An error occurred while processing your request." });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
