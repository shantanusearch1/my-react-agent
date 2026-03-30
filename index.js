import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  systemInstruction: "You are a Senior React Developer. Use Tailwind CSS. ONLY use 'lucide-react' for icons. No other external libraries. Return ONLY raw code for App.jsx."
});

// Helper to clean AI response
const cleanCode = (text) => text.replace(/```jsx|```javascript|```/g, "").trim();

app.get('/', (req, res) => {
  // ... (Keep your existing HTML Dashboard code here) ...
});

app.get('/build', async (req, res) => {
  const userPrompt = req.query.prompt;
  let sandbox;
  let attempts = 0;
  let lastError = "";

  try {
    console.log("--- Starting New Build Process ---");
    const savedId = process.env.PERSISTENT_SANDBOX_ID;
    
    // 1. Create/Connect Sandbox
    if (savedId && savedId !== 'none' && savedId !== '') {
      sandbox = await Sandbox.connect(savedId);
    } else {
      sandbox = await Sandbox.create();
      console.log(`NEW PERSISTENT_SANDBOX_ID: ${sandbox.sandboxId}`);
    }

    // 2. Setup Filesystem
    await sandbox.commands.run('mkdir -p my-app');
    const check = await sandbox.commands.run('ls my-app/package.json').catch(() => ({ exitCode: 1 }));
    
    if (check.exitCode !== 0) {
      console.log("Scaffolding new Vite project...");
      await sandbox.commands.run('npm create vite@latest my-app -- --template react');
      await sandbox.commands.run('cd my-app && npm install');
    }

    // 3. Force Vite Config
    const viteConfig = `
      import { defineConfig } from 'vite'
      import react from '@vitejs/plugin-react'
      export default defineConfig({
        plugins: [react()],
        server: { allowedHosts: true, host: true, port: 5173, strictPort: true }
      })
    `;
    await sandbox.files.write('my-app/vite.config.js', viteConfig);

    // 4. SELF-HEALING LOOP
    while (attempts < 3) {
      console.log(`Build Attempt ${attempts + 1}...`);
      
      const aiPrompt = lastError 
        ? `The previous code failed with: "${lastError}". Rewrite App.jsx to fix this. Use ONLY standard Tailwind/React hooks.`
        : `Build a React App.jsx for: ${userPrompt}. Include a collapsible sidebar and login logic. Use Tailwind.`;

      const result = await model.generateContent(aiPrompt);
      const code = cleanCode(result.response.text());
      await sandbox.files.write('my-app/src/App.jsx', code);

      // Verify with a build check
      const buildCheck = await sandbox.commands.run('cd my-app && npm run build');
      
      if (buildCheck.exitCode === 0) {
        console.log("Build Success!");
        await sandbox.commands.run('cd my-app && npm run dev -- --host', { background: true });
        return res.json({ 
          status: "Success", 
          preview_url: `https://${sandbox.getHost(5173)}` 
        });
      } else {
        lastError = buildCheck.stderr || buildCheck.stdout;
        console.log(`Attempt ${attempts + 1} failed. Error: ${lastError.substring(0, 100)}...`);
        attempts++;
      }
    }

    throw new Error("Self-healing failed after 3 attempts.");

  } catch (error) {
    console.error("AGENT FATAL ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => console.log(`Agent Listening on ${port}`));
