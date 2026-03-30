import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  systemInstruction: "You are a Senior React Developer. Use Tailwind CSS. Return ONLY raw code for App.jsx."
});

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <title>Fast React Agent</title>
      </head>
      <body class="bg-slate-900 text-white flex flex-col items-center justify-center min-h-screen p-4">
        <div class="max-w-2xl w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 text-center">
          <h1 class="text-3xl font-bold mb-6 text-blue-400">⚡ Fast React Agent</h1>
          <input id="prompt" type="text" class="w-full p-4 rounded-lg bg-slate-900 border border-slate-600 mb-4 outline-none focus:border-blue-500" placeholder="Describe your site...">
          <button onclick="build()" id="btn" class="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-lg font-bold transition disabled:opacity-50 text-white">Build Site</button>
          <div id="status" class="mt-8 hidden">
            <p id="status-text" class="text-blue-300 animate-pulse font-mono">Requesting code...</p>
            <div id="result" class="mt-4 hidden p-4 bg-blue-900/20 border border-blue-500 rounded-lg">
              <a id="link" href="#" target="_blank" class="text-blue-400 underline font-bold text-lg italic">Open Your Site 🚀</a>
              <p class="text-slate-400 text-xs mt-2 italic">Wait 30s for npm to finish, then refresh the preview.</p>
            </div>
          </div>
        </div>
        <script>
          async function build() {
            const p = document.getElementById('prompt').value;
            const btn = document.getElementById('btn');
            const status = document.getElementById('status');
            const result = document.getElementById('result');
            if(!p) return;
            btn.disabled = true;
            status.classList.remove('hidden');
            result.classList.add('hidden');
            try {
              const response = await fetch('/build?prompt=' + encodeURIComponent(p));
              const data = await response.json();
              if(data.preview_url) {
                document.getElementById('link').href = data.preview_url;
                result.classList.remove('hidden');
                document.getElementById('status-text').innerText = "Build Triggered!";
              }
            } catch(e) {
              document.getElementById('status-text').innerText = "Error. Check logs.";
            } finally {
              btn.disabled = false;
            }
          }
        </script>
      </body>
    </html>
  `);
});

app.get('/build', async (req, res) => {
  try {
    const userPrompt = req.query.prompt;
    const sandbox = await Sandbox.create();
    
    await sandbox.commands.run('mkdir -p my-app');
    
    // Simple Vite Config
    const viteConfig = "import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; export default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: true } });";
    await sandbox.files.write('my-app/vite.config.js', viteConfig);

    // AI logic
    const result = await model.generateContent("Create React App.jsx code for: " + userPrompt);
    const code = result.response.text().replace(/```jsx|```javascript|```/g, "").trim();
    await sandbox.files.write('my-app/src/App.jsx', code);

    // Flat command string (No backslashes to avoid SyntaxErrors)
    const runCommand = "cd my-app && (ls package.json || npm create vite@latest . -- --template react) && npm install && npm run dev -- --host";
    
    sandbox.commands.run(runCommand, { background: true });

    res.json({ 
      status: "Success", 
      preview_url: "https://" + sandbox.getHost(5173) 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => console.log("Agent Online"));
