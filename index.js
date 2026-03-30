import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

// 1. Initialize Gemini with Safety & System Instructions
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  systemInstruction: `You are a Senior React Developer. 
  - Use Tailwind CSS for all styling. 
  - Use 'lucide-react' for icons. 
  - Return ONLY raw code for App.jsx. 
  - Do not use any other external libraries like Kendo or Material UI.
  - If a login is requested, build a functional UI with React state.`
});

// 2. The Agent Dashboard (Frontend)
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <title>React AI Agent</title>
      </head>
      <body class="bg-slate-900 text-white flex flex-col items-center justify-center min-h-screen p-4">
        <div class="max-w-2xl w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 text-center">
          <h1 class="text-3xl font-bold mb-2 text-blue-400">React AI Agent 🤖</h1>
          <p class="text-slate-400 mb-6 text-sm italic">Built with Railway + E2B + Gemini</p>
          
          <input id="prompt" type="text" class="w-full p-4 rounded-lg bg-slate-900 border border-slate-600 mb-4 outline-none focus:border-blue-500" placeholder="e.g. A modern crypto dashboard with dark mode">
          
          <button onclick="build()" id="btn" class="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-lg font-bold transition disabled:opacity-50">Build My Website</button>
          
          <div id="status-container" class="mt-8 hidden">
            <div id="loader" class="flex items-center justify-center space-x-2 mb-4">
              <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
              <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-.3s]"></div>
              <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-.5s]"></div>
              <p class="text-blue-300 font-mono text-xs ml-2">AGENT PROCESSING...</p>
            </div>
            
            <div id="result" class="hidden p-6 bg-blue-900/20 border border-blue-500/50 rounded-xl">
              <p class="text-sm text-blue-200 mb-3">Your site is being deployed!</p>
              <a id="link" href="#" target="_blank" class="inline-block bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-full font-bold text-white transition mb-3">
                Open Live Preview 🚀
              </a>
              <p class="text-slate-500 text-[10px] leading-tight italic">
                Wait ~20 seconds after opening for npm install to finish.<br>
                If you see "Closed Port", just refresh the preview page.
              </p>
            </div>
          </div>
        </div>

        <script>
          async function build() {
            const promptInput = document.getElementById('prompt');
            const btn = document.getElementById('btn');
            const statusContainer = document.getElementById('status-container');
            const result = document.getElementById('result');
            const link = document.getElementById('link');
            const loader = document.getElementById('loader');

            if (!promptInput.value) return alert("Please enter a prompt!");

            btn.disabled = true;
            statusContainer.classList.remove('hidden');
            result.classList.add('hidden');
            loader.classList.remove('hidden');

            try {
              const response = await fetch('/build?prompt=' + encodeURIComponent(promptInput.value));
              const data = await response.json();

              if (data.preview_url) {
                link.href = data.preview_url;
                loader.classList.add('hidden');
                result.classList.remove('hidden');
              } else {
                alert("Error: " + (data.error || "Unknown error"));
              }
            } catch (err) {
              alert("The request timed out, but the agent might still be working. Check Railway logs.");
            } finally {
              btn.disabled = false;
            }
          }
        </script>
      </body>
    </html>
  `);
});

// 3. The "Brain" Route (Backend)
app.get('/build', async (req, res) => {
  const userPrompt = req.query.prompt;
  
  try {
    console.log("--- Starting Agent Build ---");
    
    // Create the cloud sandbox
    const sandbox = await Sandbox.create();
    console.log("Sandbox Created:", sandbox.sandboxId);

    // Write Vite config with all security/host fixes
    await sandbox.commands.run('mkdir -p my-app');
    const viteConfig = `
      import { defineConfig } from 'vite'
      import react from '@vitejs/plugin-react'
      export default defineConfig({
        plugins: [react()],
        server: { 
          host: '0.0.0.0', 
          port: 5173, 
          strictPort: true, 
          allowedHosts: true 
        }
      })
    `;
    await sandbox.files.write('my-app/vite.config.js', viteConfig);

    // Ask Gemini to design the UI
    const result = await model.generateContent("Create React App.jsx for: " + userPrompt);
    const code = result.response.text().replace(/```jsx|```javascript|```/g, "").trim();
    
    // Save the code to the sandbox
    await sandbox.files.write('my-app/src/App.jsx', code);

    // Launch background build (prevents First Byte Timeout)
    console.log("Launching background installation and server...");
    sandbox.commands.run(\`
      cd my-app && 
      if [ ! -f package.json ]; then 
        npm create vite@latest . -- --template react && npm install; 
      fi && 
      npm run dev -- --host\`, 
      { background: true }
    );

    // Return the URL immediately
    const previewUrl = sandbox.getHost(5173);
    res.json({ 
      status: "Success", 
      preview_url: \`https://\${previewUrl}\`
    });

  } catch (error) {
    console.error("AGENT ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => console.log(\`Agent is online at port \${port}\`));
