import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Serve the UI Dashboard
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><script src="https://cdn.tailwindcss.com"></script><title>React Agent</title></head>
      <body class="bg-slate-900 text-white flex flex-col items-center justify-center min-h-screen p-4">
        <div class="max-w-2xl w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
          <h1 class="text-3xl font-bold mb-6 text-blue-400">Fixed URL React Agent 🤖</h1>
          <input id="prompt" type="text" class="w-full p-4 rounded-lg bg-slate-900 border border-slate-600 mb-4" placeholder="Describe your site...">
          <button onclick="build()" id="btn" class="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-lg font-bold">Build Website</button>
          <div id="status" class="mt-8 hidden text-center">
            <p id="status-text" class="text-blue-300 animate-pulse">Building in the cloud...</p>
            <a id="link" href="#" target="_blank" class="mt-4 block text-blue-400 underline font-bold text-lg hidden">View My Fixed URL Site 🚀</a>
          </div>
        </div>
        <script>
          async function build() {
            const prompt = document.getElementById('prompt').value;
            const btn = document.getElementById('btn');
            const status = document.getElementById('status');
            const link = document.getElementById('link');
            btn.disabled = true;
            status.classList.remove('hidden');
            const response = await fetch('/build?prompt=' + encodeURIComponent(prompt));
            const data = await response.json();
            link.href = data.preview_url;
            link.classList.remove('hidden');
            btn.disabled = false;
          }
        </script>
      </body>
    </html>
  `);
});

app.get('/build', async (req, res) => {
  const userPrompt = req.query.prompt;
  let sandbox;

  try {
    const savedId = process.env.PERSISTENT_SANDBOX_ID;
    
    // 1. Reconnect or Create Sandbox
    if (savedId && savedId !== 'none' && savedId !== '') {
      console.log("Connecting to persistent sandbox...");
      sandbox = await Sandbox.connect(savedId);
    } else {
      console.log("Creating new sandbox...");
      sandbox = await Sandbox.create();
      console.log("!! COPY THIS ID TO RAILWAY VARIABLES !! ->", sandbox.sandboxId);
    }

    // 2. Scaffold (Only if first time, but safe to run mkdir)
    await sandbox.commands.run('mkdir -p my-app');
    
    // Check if App exists, if not, create Vite project
    const check = await sandbox.commands.run('ls my-app/package.json').catch(() => ({ exitCode: 1 }));
    if (check.exitCode !== 0) {
      await sandbox.commands.run('npm create vite@latest my-app -- --template react');
      await sandbox.commands.run('cd my-app && npm install');
    }

    // 3. Configure Vite for Fixed URL
    const viteConfig = `
      import { defineConfig } from 'vite'
      import react from '@vitejs/plugin-react'
      export default defineConfig({
        plugins: [react()],
        server: { allowedHosts: true, host: true }
      })
    `;
    await sandbox.files.write('my-app/vite.config.js', viteConfig);

    // 4. Generate Code
    const result = await model.generateContent(`Create a React App.jsx for: ${userPrompt}. Use Tailwind. Return ONLY code.`);
    const aiCode = result.response.text().replace(/```jsx|```javascript|```/g, "").trim();
    await sandbox.files.write('my-app/src/App.jsx', aiCode);

    // 5. Run Server
    await sandbox.commands.run('cd my-app && npm run dev -- --host', { background: true });
    
    const previewUrl = sandbox.getHost(5173);
    res.json({ status: "Success", preview_url: `https://${previewUrl}`, sandbox_id: sandbox.sandboxId });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => console.log(`Agent active on port ${port}`));
