import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

// Initialize Gemini
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
          <h1 class="text-3xl font-bold mb-6 text-blue-400 font-mono">⚡ Fast React Agent</h1>
          <input id="prompt" type="text" class="w-full p-4 rounded-lg bg-slate-900 border border-slate-600 mb-4 outline-none focus:border-blue-500" placeholder="e.g. A luxury dashboard with dark mode">
          <button onclick="build()" id="btn" class="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-lg font-bold transition disabled:opacity-50">Build Site</button>
          
          <div id="status" class="mt-8 hidden">
            <p id="status-text" class="text-blue-300 animate-pulse font-mono">Initializing Sandbox...</p>
            <div id="result" class="mt-4 hidden p-4 bg-blue-900/20 border border-blue-500 rounded-lg">
              <a id="link" href="#" target="_blank" class="text-blue-400 underline font-bold text-lg italic">Open Your Site 🚀</a>
              <p class="text-slate-400 text-xs mt-2 italic">Note: If you see '404' or 'Blocked', wait 20 seconds for npm install to finish and refresh.</p>
            </div>
          </div>
        </div>
        <script>
          async function build() {
            const p = document.getElementById('prompt').value;
            const btn = document.getElementById('btn');
            const status = document.getElementById('status');
            const statusText = document.getElementById('status-text');
            const result = document.getElementById('result');
            const link = document.getElementById('link');

            if(!p) return;
            btn.disabled = true;
            status.classList.remove('hidden');
            result.classList.add('hidden');
            statusText.innerText = "Requesting code from Gemini...";

            try {
              const response = await fetch('/build?prompt=' + encodeURIComponent(p));
              const data = await response.json();
              
              if(data.preview_url) {
                statusText.innerText = "Build Triggered!";
                link.href = data.preview_url;
                result.classList.remove('hidden');
              } else {
                statusText.innerText = "Error: " + data.error;
              }
            } catch(e) {
              statusText.innerText = "Timeout or Error. Check Railway Logs.";
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
  const userPrompt = req.query.prompt;
  try {
    const sandbox = await Sandbox.create();
    
    // Setup Vite Config with ALL necessary fixes
    await sandbox.commands.run('mkdir -p my-app');
    await sandbox.files.write('my-app/vite.config.js', `
      import { defineConfig } from 'vite';
      import react from '@vitejs/plugin-react';
      export default defineConfig({
        plugins: [react()],
        server: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: true }
      });
    `);

    // Generate Code
    const result = await model.generateContent("Return raw React code for App.jsx using Tailwind: " + userPrompt);
    const code = result.response.text().replace(/```jsx|```javascript|```/g, "").trim();
    await sandbox.files.write('my-app/src/App.jsx', code);

    // Background Process: Install and Run
    // We use 'nohup' and '&' to ensure it survives even if the request ends
    console.log("Launching background build...");
    sandbox.commands.run('cd my-app && (ls package.json || npm create vite@latest . -- --template react) && npm install && npm run dev -- --host', { background: true });

    const previewUrl = sandbox.getHost(5173);
    res.json({ 
      status: "Success", 
      preview_url: `https://${previewUrl}`
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
    // 1. Write Vite Config Immediately
    await sandbox.commands.run('mkdir -p my-app');
    const viteConfig = `
      import { defineConfig } from 'vite'
      import react from '@vitejs/plugin-react'
      export default defineConfig({
        plugins: [react()],
        server: { allowedHosts: true, host: true, port: 5173, strictPort: true }
      })
    `;
    await sandbox.files.write('my-app/vite.config.js', viteConfig);

    // 2. Generate Code with Gemini
    const result = await model.generateContent("Return ONLY raw React code for App.jsx using Tailwind CSS: " + userPrompt);
    const code = result.response.text().replace(/```jsx|```javascript|```/g, "").trim();
    await sandbox.files.write('my-app/src/App.jsx', code);

    // 3. THE MAGIC: Start background processes
    // We don't 'await' these so the route can return a response immediately
    console.log("Triggering background installation...");
    sandbox.commands.run('cd my-app && (ls package.json || npm create vite@latest . -- --template react) && npm install && npm run dev -- --host', { background: true });

    // 4. Return URL immediately to prevent Railway Timeout
    const previewUrl = sandbox.getHost(5173);
    res.json({ 
      status: "Success", 
      preview_url: `https://${previewUrl}`,
      sandbox_id: sandbox.sandboxId
    });

  } catch (error) {
    console.error("FATAL:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => console.log(`Agent active on port ${port}`));
