import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  systemInstruction: "You are a Universal AI Assistant. If the user asks for code or complex math, use the E2B Sandbox. If they ask a general question, answer directly. If they ask for a database, simulate it using JSON files in the sandbox."
});

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><script src="https://cdn.tailwindcss.com"></script><title>Universal AI</title></head>
      <body class="bg-slate-900 text-slate-100 min-h-screen flex items-center justify-center p-4">
        <div class="max-w-3xl w-full bg-slate-800 rounded-3xl shadow-2xl border border-slate-700 p-8">
          <h1 class="text-4xl font-black mb-2 bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">Universal Assistant 🤖</h1>
          <p class="text-slate-400 mb-8 font-mono text-sm">Coding • Database • General Knowledge</p>
          
          <div id="chat" class="space-y-4 mb-6 max-h-[400px] overflow-y-auto p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
            <div class="text-blue-300 italic">How can I help you today?</div>
          </div>

          <div class="flex gap-2">
            <input id="prompt" type="text" class="flex-1 p-4 rounded-xl bg-slate-900 border border-slate-600 focus:border-blue-500 outline-none" placeholder="Ask anything...">
            <button onclick="ask()" id="btn" class="bg-blue-600 hover:bg-blue-500 px-8 rounded-xl font-bold transition">Send</button>
          </div>
        </div>

        <script>
          async function ask() {
            const p = document.getElementById('prompt');
            const chat = document.getElementById('chat');
            const btn = document.getElementById('btn');
            if(!p.value) return;

            const userVal = p.value;
            chat.innerHTML += '<div class="text-white font-bold text-right">' + userVal + '</div>';
            p.value = '';
            btn.disabled = true;

            const res = await fetch('/chat?prompt=' + encodeURIComponent(userVal));
            const data = await res.json();

            chat.innerHTML += '<div class="text-blue-200 bg-blue-900/20 p-4 rounded-lg mt-2">' + data.answer + '</div>';
            if(data.preview_url) {
              chat.innerHTML += '<div class="mt-2"><a href="' + data.preview_url + '" target="_blank" class="text-emerald-400 underline font-bold">View Generated App 🚀</a></div>';
            }
            chat.scrollTop = chat.scrollHeight;
            btn.disabled = false;
          }
        </script>
      </body>
    </html>
  `);
});

app.get('/chat', async (req, res) => {
  const prompt = req.query.prompt;
  
  try {
    // 1. Determine Intent
    const decision = await model.generateContent(`Categorize this prompt: "${prompt}". Respond with ONLY one word: "TEXT" or "CODE".`);
    const intent = decision.response.text().trim().toUpperCase();

    if (intent === "CODE") {
      // Logic for building apps/running code
      const sandbox = await Sandbox.create();
      await sandbox.commands.run('mkdir -p my-app');
      
      const aiResponse = await model.generateContent("Build a React App.jsx for: " + prompt);
      const code = aiResponse.response.text().replace(/```jsx|```javascript|```/g, "").trim();
      await sandbox.files.write('my-app/src/App.jsx', code);
      
      // Vite Config
      await sandbox.files.write('my-app/vite.config.js', "import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; export default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', port: 5173, allowedHosts: true } });");
      
      sandbox.commands.run("cd my-app && (ls package.json || npm create vite@latest . -- --template react) && npm install && npm run dev -- --host", { background: true });

      res.json({ 
        answer: "I am building that application for you right now in a cloud sandbox.",
        preview_url: "https://" + sandbox.getHost(5173)
      });
    } else {
      // Logic for General Knowledge / Database Queries (Simulation)
      const answer = await model.generateContent(prompt);
      res.json({ answer: answer.response.text() });
    }

  } catch (error) {
    res.status(500).json({ answer: "Error: " + error.message });
  }
});

app.listen(port, () => console.log("Universal Assistant Active"));
