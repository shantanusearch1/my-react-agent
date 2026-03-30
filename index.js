import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

// Initialize Gemini with your key from Railway Variables
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

//app.get('/', (req, res) => res.send('React AI Agent (Gemini Edition) is Online. Use /build?prompt=your_idea'));
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <title>React AI Agent</title>
      </head>
      <body class="bg-slate-900 text-white flex flex-col items-center justify-center min-h-screen p-4">
        <div class="max-w-2xl w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
          <h1 class="text-3xl font-bold mb-6 text-blue-400">React AI Agent 🤖</h1>
          <p class="mb-4 text-slate-400">Describe the website you want to build:</p>
          <input id="prompt" type="text" class="w-full p-4 rounded-lg bg-slate-900 border border-slate-600 mb-4 focus:outline-none focus:border-blue-500" placeholder="e.g. A crypto dashboard with dark mode...">
          <button onclick="build()" id="btn" class="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-lg font-bold transition">Build My Website</button>
          
          <div id="status" class="mt-8 hidden">
            <div class="flex items-center space-x-3 mb-4">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <p id="status-text" class="text-blue-300 font-mono text-sm">Initializing Cloud Sandbox...</p>
            </div>
            <div id="result" class="p-4 bg-slate-900 rounded border border-blue-900/50 hidden">
              <p class="text-sm text-slate-400 mb-2">Build Complete!</p>
              <a id="link" href="#" target="_blank" class="text-blue-400 underline font-bold text-lg italic">Click here to view your site 🚀</a>
            </div>
          </div>
        </div>

        <script>
          async function build() {
            const prompt = document.getElementById('prompt').value;
            const btn = document.getElementById('btn');
            const status = document.getElementById('status');
            const statusText = document.getElementById('status-text');
            const result = document.getElementById('result');

            btn.disabled = true;
            btn.innerText = "Working...";
            status.classList.remove('hidden');
            
            // Start the build
            const response = await fetch('/build?prompt=' + encodeURIComponent(prompt));
            const data = await response.json();
            
            statusText.innerText = "Deployment successful!";
            result.classList.remove('hidden');
            document.getElementById('link').href = data.preview_url;
            btn.disabled = false;
            btn.innerText = "Build Another";
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
    // 1. Try to reconnect to an existing sandbox
    const savedId = process.env.PERSISTENT_SANDBOX_ID;
    
    if (savedId && savedId !== 'none') {
      console.log(`Reconnecting to existing sandbox: ${savedId}`);
      sandbox = await Sandbox.connect(savedId);
    } else {
      console.log("Creating a brand new persistent sandbox...");
      sandbox = await Sandbox.create({
        // This keeps the sandbox alive for 24 hours (Pro) or 1 hour (Free)
        timeoutMs: 3600000 
      });
      // IMPORTANT: In a real app, you'd save this ID to a database.
      // For now, we'll log it so you can add it to your Railway Variables.
      console.log(`NEW SANDBOX ID: ${sandbox.sandboxId}`);
    }

    // 2. Clear old files & Re-scaffold if it's the first time
    // If the folder doesn't exist, create it
    await sandbox.commands.run('mkdir -p my-app');
    
    // ... [Insert your existing Vite Scaffolding & Gemini code here] ...

    // 3. Get the URL (This will now be consistent for this Sandbox ID)
    const previewUrl = sandbox.getHost(5173);
    
    res.json({
      status: "Success",
      preview_url: `https://${previewUrl}`,
      sandbox_id: sandbox.sandboxId // Save this!
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
    // 2. Setup React (Vite)
    await sandbox.commands.run('npm create vite@latest my-app -- --template react');
    await sandbox.commands.run('cd my-app && npm install');

// ADD THIS NEW STEP:
console.log("Configuring Vite to allow cloud hosts...");
const viteConfig = `
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true, // This allows the E2B proxy to work
    host: true,         // Exposes the server to the network
  }
})
`;
await sandbox.files.write('my-app/vite.config.js', viteConfig);

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
