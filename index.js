import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Using Flash for speed and free tier reliability
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  systemInstruction: "You are a Senior React Developer. Use Tailwind CSS. Only use 'lucide-react' for icons. Do NOT use any other external libraries unless requested. Return ONLY raw code for App.jsx."
});

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><script src="https://cdn.tailwindcss.com"></script><title>Self-Healing Agent</title></head>
      <body class="bg-slate-900 text-white flex flex-col items-center justify-center min-h-screen p-4">
        <div class="max-w-2xl w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
          <h1 class="text-3xl font-bold mb-6 text-blue-400 text-center">React AI Agent 🤖</h1>
          <input id="prompt" type="text" class="w-full p-4 rounded-lg bg-slate-900 border border-slate-600 mb-4 outline-none focus:border-blue-500" placeholder="Describe your website...">
          <button onclick="build()" id="btn" class="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-lg font-bold transition disabled:opacity-50">Start Self-Healing Build</button>
          <div id="status-box" class="mt-8 hidden p-4 bg-black/50 rounded-lg font-mono text-xs overflow-y-auto max-h-40 border border-slate-700">
            <div id="logs" class="text-blue-300"></div>
          </div>
          <div id="result" class="mt-6 hidden text-center">
            <a id="link" href="#" target="_blank" class="text-green-400 underline font-bold text-lg italic">View Fixed URL Site 🚀</a>
          </div>
        </div>
        <script>
          function log(msg) {
            const div = document.getElementById('logs');
            div.innerHTML += '> ' + msg + '<br>';
            document.getElementById('status-box').scrollTop = div.scrollHeight;
          }

          async function build() {
            const p = document.getElementById('prompt').value;
            const btn = document.getElementById('btn');
            const result = document.getElementById('result');
            const logs = document.getElementById('logs');
            
            if(!p) return;
            btn.disabled = true;
            logs.innerHTML = '';
            document.getElementById('status-box').classList.remove('hidden');
            result.classList.add('hidden');

            log("Calling Brain (Gemini)...");
            const response = await fetch('/build?prompt=' + encodeURIComponent(p));
            const data = await response.json();

            if (data.status === "Success") {
              log("Build verified! Starting server...");
              document.getElementById('link').href = data.preview_url;
              result.classList.remove('hidden');
            } else {
              log("ERROR: " + (data.error || "Failed after retries"));
            }
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
  let attempts = 0;
  let lastError = "";

  try {
    const savedId = process.env.PERSISTENT_SANDBOX_ID;
    sandbox = (savedId && savedId !== 'none') ? await Sandbox.connect(savedId) : await Sandbox.create();
    
    // Scaffolding check
    await sandbox.commands.run('mkdir -p my-app');
    const check = await sandbox.commands.run('ls my-app/package.json').catch(() => ({ exitCode: 1 }));
    if (check.exitCode !== 0) {
      await sandbox.commands.run('npm create vite@latest my-app -- --template react');
      await sandbox.commands.run('cd my-app && npm install');
    }

    // Fix Vite Config for E2B
    const viteConfig = `
      import { defineConfig } from 'vite'
      import react from '@vitejs/plugin-react'
      export default defineConfig({
        plugins: [react()],
        server: { allowedHosts: true, host: true, port: 5173, strictPort: true }
      })
    `;
    await sandbox.files.write('my-app/vite.config.js', viteConfig);

    // --- START SELF-HEALING LOOP ---
    while (attempts < 3) {
      console.log(`Attempt ${attempts + 1} for: ${userPrompt}`);
      
      const aiPrompt = lastError 
        ? `The previous code failed with error: "${lastError}". Fix it. Use ONLY standard Tailwind/React. NO external charting libs like Kendo.`
        : `Build a beautiful React App.jsx for: ${userPrompt}. Use Tailwind CSS.`;

      const result = await model.generateContent(aiPrompt);
      const rawCode = result.response.text().replace(/```jsx|```javascript|```/g, "").trim();
      
      await sandbox.files.write('my-app/src/App.jsx', rawCode);

      // Verify the build
      const buildProc = await sandbox.commands.run('cd my-app && npm run build');
      
      if (buildProc.exitCode === 0) {
        // Success! Run dev server in background
        await sandbox.commands.run('cd my-app && npm run dev -- --host', { background: true });
        return res.json({ 
          status: "Success", 
          preview_url: `https://${sandbox.getHost(5173)}`,
          sandbox_id: sandbox.sandboxId 
        });
      } else {
        // Capture error for the next attempt
        lastError = buildProc.stderr;
        console.log("Healing needed. Error found:", lastError);
        attempts++;
      }
    }

    throw new Error("Could not fix code after 3 attempts.");

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => console.log(`Agent active on port ${port}`));
