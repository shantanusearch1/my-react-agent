import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-3.1-flash-lite-preview",
  systemInstruction: "You are a Universal Assistant. If code/UI is requested, use 'CODE_MODE: App.jsx'. If Python, 'CODE_MODE: script.py'. Otherwise, use text."
});

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
          .message-user { background-color: #444654; }
          .message-ai { background-color: #343541; border-bottom: 1px solid rgba(0,0,0,0.1); }
          pre { background: #1e1e1e; padding: 1rem; border-radius: 0.5rem; border: 1px solid #333; overflow-x: auto; margin: 10px 0; }
        </style>
      </head>
      <body class="bg-[#343541] text-gray-100 h-screen flex flex-col font-sans">
        
        <div id="chat" class="flex-1 overflow-y-auto pb-32">
          <div class="message-ai py-8 px-4">
            <div class="max-w-3xl mx-auto flex gap-6">
              <div class="w-8 h-8 bg-emerald-600 rounded-sm flex items-center justify-center shrink-0 font-bold text-xs">AI</div>
              <div class="text-gray-200">Hello! I'm your Universal Assistant. I can run Python, execute terminal commands, or build React apps.</div>
            </div>
          </div>
        </div>

        <div class="fixed bottom-0 left-0 w-full bg-gradient-to-t from-[#343541] pt-10">
          <div class="max-w-3xl mx-auto px-4 pb-10">
            <div class="relative flex items-center bg-[#40414f] rounded-xl border border-black/10 shadow-2xl">
              <textarea id="prompt" rows="1" class="w-full bg-transparent text-white p-4 pr-12 focus:outline-none resize-none" placeholder="Send a message..."></textarea>
              <button onclick="ask()" id="btn" class="absolute right-3 p-2 text-gray-400 hover:text-white transition"><i class="fa fa-paper-plane"></i></button>
            </div>
          </div>
        </div>

        <script>
          const chat = document.getElementById('chat');
          
          async function pollPort(url, id) {
            const el = document.getElementById(id);
            for (let i = 0; i < 60; i++) {
              try {
                const r = await fetch(url, { mode: 'no-cors' });
                el.innerHTML = '<a href="' + url + '" target="_blank" class="text-emerald-400 font-bold underline"><i class="fa fa-external-link mr-2"></i> Open App Preview</a>';
                return;
              } catch (e) {
                el.innerText = "⏳ Building environment... " + (i * 2) + "s";
                await new Promise(res => setTimeout(res, 2000));
              }
            }
            el.innerText = "Build took too long. Try refreshing the link manually.";
          }

          async function ask() {
            const input = document.getElementById('prompt');
            const val = input.value.trim();
            if(!val) return;
            
            chat.innerHTML += '<div class="message-user py-8 px-4"><div class="max-w-3xl mx-auto flex gap-6"><div class="w-8 h-8 bg-blue-600 rounded-sm flex items-center justify-center shrink-0 text-xs">YOU</div><div>' + val + '</div></div></div>';
            input.value = '';
            chat.scrollTop = chat.scrollHeight;

            const res = await fetch('/chat?prompt=' + encodeURIComponent(val));
            const data = await res.json();
            
            const id = 'status-' + Date.now();
            let aiHtml = '<div class="message-ai py-8 px-4"><div class="max-w-3xl mx-auto flex gap-6"><div class="w-8 h-8 bg-emerald-600 rounded-sm flex items-center justify-center shrink-0 text-xs">AI</div><div class="text-gray-200 prose prose-invert">';
            aiHtml += marked.parse(data.answer);
            if(data.preview_url) {
              aiHtml += '<div id="' + id + '" class="mt-4 p-4 bg-black/20 rounded border border-white/10 text-blue-400 text-sm">Initializing...</div>';
            }
            aiHtml += '</div></div></div>';
            
            chat.innerHTML += aiHtml;
            chat.scrollTop = chat.scrollHeight;
            if(data.preview_url) pollPort(data.preview_url, id);
          }
        </script>
      </body>
    </html>
  `);
});

app.get('/chat', async (req, res) => {
  const prompt = req.query.prompt;
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    if (text.includes("CODE_MODE:")) {
      const sandbox = await Sandbox.create();
      const lines = text.split("CODE_MODE:")[1].trim().split("\n");
      const file = lines[0].trim();
      const code = lines.slice(1).join("\n").replace(/```\w*|```/g, "").trim();
      
      await sandbox.files.write(file, code);
      let output = "";
      let url = null;

      if (file.endsWith('.jsx') || file === 'App.jsx') {
        // Fast Scaffolding
        await sandbox.commands.run('mkdir -p my-app/src');
        await sandbox.files.write('my-app/vite.config.js', "import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; export default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: true } });");
        await sandbox.files.write('my-app/src/App.jsx', code);
        
        sandbox.commands.run("cd my-app && (ls package.json || npm create vite@latest . -- --template react) && npm install && npm run dev -- --host", { background: true });
        url = "https://" + sandbox.getHost(5173);
        output = "I am launching your React app in the background.";
      } else if (file.endsWith('.py')) {
        const run = await sandbox.commands.run(`python3 ${file}`);
        output = "### Result:\n```\n" + (run.stdout || run.stderr) + "\n```";
      }

      res.json({ answer: output, preview_url: url });
    } else {
      res.json({ answer: text });
    }
  } catch (error) {
    res.status(500).json({ answer: "Brain overload. Please wait a minute." });
  }
});

app.listen(port, () => console.log("System Online"));
