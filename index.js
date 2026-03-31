import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  systemInstruction: "You are a Universal AI Assistant. If asked for code/apps, build them in React. If asked general questions, answer directly. For databases, use JSON files in the sandbox."
});

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><script src="https://cdn.tailwindcss.com"></script><title>Universal AI</title></head>
      <body class="bg-slate-900 text-slate-100 min-h-screen flex items-center justify-center p-4 font-sans">
        <div class="max-w-3xl w-full bg-slate-800 rounded-3xl shadow-2xl border border-slate-700 p-8">
          <h1 class="text-3xl font-black mb-6 bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent italic">AI Assistant 🤖</h1>
          <div id="chat" class="space-y-4 mb-6 max-h-[400px] overflow-y-auto p-4 bg-slate-900/50 rounded-xl border border-slate-700/50 font-mono text-sm">
            <div class="text-blue-400 italic font-bold">> System Ready. Ask me anything.</div>
          </div>
          <div class="flex gap-2">
            <input id="prompt" type="text" class="flex-1 p-4 rounded-xl bg-slate-900 border border-slate-600 focus:border-blue-500 outline-none transition-all" placeholder="Build a todo app... or ask a question...">
            <button onclick="ask()" id="btn" class="bg-blue-600 hover:bg-blue-500 px-8 rounded-xl font-bold transition-all disabled:opacity-50">Send</button>
          </div>
        </div>
        <script>
          async function ask() {
            const p = document.getElementById('prompt');
            const chat = document.getElementById('chat');
            const btn = document.getElementById('btn');
            if(!p.value) return;
            const val = p.value; p.value = ''; btn.disabled = true;
            chat.innerHTML += '<div class="text-white mt-4 font-bold">> User: ' + val + '</div>';
            
            try {
              const res = await fetch('/chat?prompt=' + encodeURIComponent(val));
              const data = await res.json();
              chat.innerHTML += '<div class="text-emerald-400 mt-2 bg-emerald-900/10 p-3 rounded border border-emerald-900/30 font-bold">> Assistant: ' + data.answer + '</div>';
              if(data.preview_url) {
                chat.innerHTML += '<div class="mt-2 pl-4"><a href="' + data.preview_url + '" target="_blank" class="text-blue-400 underline animate-pulse">View Generated Application 🚀</a><br><span class="text-[10px] text-slate-500 italic">(Wait 30s for npm install then refresh if it says Closed Port)</span></div>';
              }
            } catch(e) {
              chat.innerHTML += '<div class="text-red-400 mt-2 italic font-bold">> Error: Request timed out. Check Railway logs.</div>';
            }
            chat.scrollTop = chat.scrollHeight; btn.disabled = false;
          }
        </script>
      </body>
    </html>
  `);
});

app.get('/chat', async (req, res) => {
  const prompt = req.query.prompt;
  try {
    // Determine Intent: Simple check for "build", "create", or code-like prompts
    const decision = await model.generateContent("Respond with ONLY the word 'CODE' if this prompt asks for a website/app/ui/coding task. Otherwise respond 'TEXT'. Prompt: " + prompt);
    const intent = decision.response.text().trim().toUpperCase();

    if (intent.includes("CODE")) {
      const sandbox = await Sandbox.create();
      await sandbox.commands.run('mkdir -p my-app');
      
      // Force Vite Config
      await sandbox.files.write('my-app/vite.config.js', "import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; export default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: true } });");
      
      const aiResponse = await model.generateContent("Return raw React code for App.jsx using Tailwind: " + prompt);
      const code = aiResponse.response.text().replace(/```jsx|```javascript|```/g, "").trim();
      await sandbox.files.write('my-app/src/App.jsx', code);
      
      // Start background build
      sandbox.commands.run("cd my-app && (ls package.json || npm create vite@latest . -- --template react) && npm install && npm run dev -- --host", { background: true });
      
      res.json({ 
        answer: "I've started building that React application in a new cloud sandbox for you.", 
        preview_url: "https://" + sandbox.getHost(5173) 
      });
    } else {
      const result = await model.generateContent(prompt);
      res.json({ answer: result.response.text() });
    }
  } catch (error) {
    res.status(500).json({ answer: error.message });
  }
});

app.listen(port, () => console.log("Universal Assistant Online"));
