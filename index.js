import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

// 1. Initialize Gemini
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
        <title>Pro React AI Agent</title>
      </head>
      <body class="bg-slate-900 text-white flex flex-col items-center justify-center min-h-screen p-4">
        <div class="max-w-2xl w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 text-center">
          <h1 class="text-3xl font-bold mb-2 text-blue-400">Pro React Agent 🤖</h1>
          <p class="text-slate-500 mb-6 text-xs italic italic">Railway + E2B + Gemini 2.5</p>
          
          <input id="prompt" type="text" class="w-full p-4 rounded-lg bg-slate-900 border border-slate-600 mb-4 outline-none focus:border-blue-500 text-white" placeholder="Describe your site (e.g. A dark mode music player)">
          
          <button onclick="build()" id="btn" class="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-lg font-bold transition disabled:opacity-50">Build & Deploy</button>
          
          <div id="status-container" class="mt-8 hidden">
            <p id="status-text" class="text-blue-300 animate-pulse font-mono text-sm mb-4">Starting Engine...</p>
            
            <div id="result" class="hidden p-6 bg-blue-900/20 border border-blue-500/50 rounded-xl">
              <a id="link" href="#" target="_blank" class="inline-block bg-blue-600 hover:bg-blue-500 px-8 py-3 rounded-full font-bold text-white transition mb-4 shadow-lg">
                View Live Site 🚀
              </a>
              <div class="flex flex-col space-y-2">
                <button onclick="downloadProject()" class="text-xs text-slate-400 hover:text-blue-400 underline transition">
                  Download Project Source (.zip) 📦
                </button>
                <p class="text-[10px] text-slate-500 italic mt-2">Wait 30s for npm install if you see a 'Closed Port' error.</p>
              </div>
            </div>
          </div>
        </div>

        <script>
          let currentSandboxId = null;

          async function build() {
            const p = document.getElementById('prompt').value;
            const btn = document.getElementById('btn');
            const status = document.getElementById('status-container');
            const result = document.getElementById('result');
            
            if(!p) return alert("Enter a prompt!");

            btn.disabled = true;
            status.classList.remove('hidden');
            result.classList.add('hidden');
            document.getElementById('status-text').innerText = "Architecting your React app...";

            try {
              const response = await fetch('/build?prompt=' + encodeURIComponent(p));
              const data = await response.json();

              if (data.preview_url) {
                currentSandboxId = data.sandbox_id;
                document.getElementById('link').href = data.preview_url;
                document.getElementById('status-text').innerText = "Deployment Success!";
                result.classList.remove('hidden');
              } else {
                alert("Error: " + data.error);
              }
            } catch (err) {
              alert("Timeout: Check Railway Logs.");
            } finally {
              btn.disabled = false;
            }
          }

          function downloadProject() {
            if(!currentSandboxId) return;
            window.location.href = '/download?id=' + currentSandboxId;
          }
        </script>
      </body>
    </html>
  `);
});

app.get('/build', async (req, res) => {
  const userPrompt = req.query.prompt;
  try {
    const sandbox = await Sandbox.create();
    console.log("New Sandbox:", sandbox.sandboxId);

    // Write Vite Config
    await sandbox.commands.run('mkdir -p my-app');
    const viteConfig = "import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; export default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: true } });";
    await sandbox.files.write('my-app/vite.config.js', viteConfig);

    // AI Generation
    const aiResponse = await model.generateContent("Return raw React code for App.jsx using Tailwind: " + userPrompt);
    const code = aiResponse.response.text().replace(/```jsx|```javascript|```/g, "").trim();
    await sandbox.files.write('my-app/src/App.jsx', code);

    // Background Launch
    const cmd = "cd my-app && (ls package.json || npm create vite@latest . -- --template react) && npm install && npm run dev -- --host";
    sandbox.commands.run(cmd, { background: true });

    res.json({ 
      status: "Success", 
      preview_url: "https://" + sandbox.getHost(5173),
      sandbox_id: sandbox.sandboxId 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ZIP Download Route
app.get('/download', async (req, res) => {
  try {
    const sandbox = await Sandbox.connect(req.query.id);
    console.log("Zipping project for sandbox:", req.query.id);
    
    await sandbox.commands.run('zip -r project.zip my-app');
    const buffer = await sandbox.files.read('project.zip', { format: 'buffer' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=ai-react-site.zip');
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).send("Download error: " + e.message);
  }
});

app.listen(port, () => console.log("Agent Online on Port " + port));
