import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-3.1-flash-lite-preview",
  systemInstruction: `You are a Universal AI Assistant. 
  - For coding: Start with "CODE_MODE: filename.ext" then provide the code.
  - If asked for a website/React: Use "CODE_MODE: App.jsx".
  - For Python scripts: Use "CODE_MODE: script.py".
  - For general knowledge: Answer in plain Markdown.`
});

app.get('/', (req, res) => {
  // ... [Keep the same ChatGPT-style HTML from the previous response] ...
});

app.get('/chat', async (req, res) => {
  const prompt = req.query.prompt;
  try {
    const result = await model.generateContent(prompt);
    const fullText = result.response.text();

    if (fullText.includes("CODE_MODE:")) {
      const sandbox = await Sandbox.create();
      const lines = fullText.split("CODE_MODE:")[1].trim().split("\n");
      const fileName = lines[0].trim();
      const code = lines.slice(1).join("\n").replace(/```\w*|```/g, "").trim();
      
      await sandbox.files.write(fileName, code);

      let output = "";
      let previewUrl = null;

      // 1. REACT LOGIC (The Fix)
      if (fileName.endsWith('.jsx') || fileName === 'App.jsx') {
        await sandbox.commands.run('mkdir -p my-app');
        const viteConfig = "import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; export default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: true } });";
        await sandbox.files.write('my-app/vite.config.js', viteConfig);
        await sandbox.files.write('my-app/src/App.jsx', code);
        
        sandbox.commands.run("cd my-app && (ls package.json || npm create vite@latest . -- --template react) && npm install && npm run dev -- --host", { background: true });
        
        previewUrl = "https://" + sandbox.getHost(5173);
        output = "### React Website Mode\\nI have launched a Vite server for your React component. It will be ready in about 45 seconds.";
      } 
      // 2. PYTHON LOGIC
      else if (fileName.endsWith('.py')) {
        const run = await sandbox.commands.run(`python3 ${fileName}`);
        output = "### Python Output:\\n```\\n" + (run.stdout || run.stderr) + "\\n```";
      } 
      // 3. HTML LOGIC
      else if (fileName.endsWith('.html')) {
        await sandbox.files.write('index.html', code);
        sandbox.commands.run("npx serve -l 5173", { background: true });
        previewUrl = "https://" + sandbox.getHost(5173);
        output = "### HTML Preview Mode\\nYour static website is now live.";
      }

      res.json({ answer: output, preview_url: previewUrl });
    } else {
      res.json({ answer: fullText });
    }
  } catch (error) {
    res.status(500).json({ answer: "My brain is overloaded. Try again in a moment." });
  }
});

app.listen(port, () => console.log("Universal Assistant Online"));
