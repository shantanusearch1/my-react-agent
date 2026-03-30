import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

// Initialize Gemini with your key from Railway Variables
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

app.get('/', (req, res) => res.send('React AI Agent (Gemini Edition) is Online. Use /build?prompt=your_idea'));

app.get('/build', async (req, res) => {
  const userPrompt = req.query.prompt;
  if (!userPrompt) return res.send("Please provide a prompt. Example: /build?prompt=a blue landing page");

  try {
    console.log(`Starting Gemini Build for: ${userPrompt}`);
    
    // 1. Create the Cloud Sandbox
    const sandbox = await Sandbox.create();

    // 2. Setup React (Vite)
    await sandbox.commands.run('npm create vite@latest my-app -- --template react');
    await sandbox.commands.run('cd my-app && npm install');

    // 3. Ask Gemini to write the React Code
    const promptText = `You are a Senior React Developer. 
    Task: Build a single-file React component (App.jsx) based on this request: "${userPrompt}".
    Requirements:
    - Use Tailwind CSS utility classes for all styling.
    - Use Lucide-React for icons if needed.
    - Return ONLY the raw code. Do NOT include markdown code blocks like \`\`\`jsx or \`\`\`.`;

    const result = await model.generateContent(promptText);
    const aiResponse = result.response.text();
    
    // Clean up any accidental markdown formatting from the AI
    const cleanCode = aiResponse.replace(/```jsx|```javascript|```/g, "").trim();

    // 4. Save the Code to the Sandbox
    await sandbox.files.write('my-app/src/App.jsx', cleanCode);

    // 5. Start the Preview Server
    await sandbox.commands.run('cd my-app && npm run dev -- --host', { background: true });

    // 6. Get the live URL
    const previewUrl = sandbox.getHost(5173);
    
    res.json({
      status: "Success",
      preview_url: `https://${previewUrl}`,
      prompt: userPrompt
    });

  } catch (error) {
    console.error("Agent Error:", error);
    res.status(500).json({ error: "Failed to build project", details: error.message });
  }
});

app.listen(port, () => console.log(`Agent listening on port ${port}`));
