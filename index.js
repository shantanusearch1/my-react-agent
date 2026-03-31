import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-3.1-flash-lite-preview",
  systemInstruction: "You are a Universal AI Assistant. For React/Web apps, start response with 'CODE_MODE: App.jsx'. For Python, use 'CODE_MODE: script.py'. Otherwise, plain text."
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
          .message-ai { background-color: #343541; }
          pre { background: #1e1e1e; padding: 1rem; border-radius: 0.5rem; margin: 10px 0; border: 1px solid #333; overflow-x: auto; }
          .loader { border-top-color: #3498db; animation: spinner 1.5s linear infinite; }
          @keyframes spinner { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body class="bg-[#343541] text-gray-100 h-screen flex overflow-hidden font-sans">
        
        <div class="w-64 bg-[#202123] h-full hidden md:flex flex-col p-2">
          <button onclick="location.reload()" class="flex items-center gap-3 w-full p-3 border border-white/20 rounded-md hover:bg-gray-500/10 transition text-sm">
            <i class="fa fa-plus text-xs"></i> New Chat
          </button>
        </div>

        <div class="flex-1 flex flex-col h-full relative">
          <div id="chat-container" class="flex-1 overflow-y-auto pb-48"></div>

          <div class="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#343541] pt-6">
            <div class="max-w-3xl mx-auto px-4 pb-8">
              <div class="relative flex items-center bg-[#40414f] rounded-xl border border-black/10 shadow-2xl">
                <textarea id="prompt" rows="1" class="w-full bg-transparent text-white p-4 pr-12 focus:outline-none resize-none" placeholder="Ask me anything..."></textarea>
                <button onclick="ask()" id="send-btn" class="absolute right-3 p-2 text-gray-400 hover:text-white transition">
                  <i class="fa fa-paper-plane"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <script>
          const container = document.getElementById('chat-container');
          
          async function checkPort(url, elementId) {
            const statusEl = document.getElementById(elementId);
            let attempts = 0;
            while (attempts < 60) {
              try {
                const res = await fetch(url, { mode: 'no-cors' });
                statusEl.innerHTML = '<a href="' + url + '" target="_blank" class="text-emerald-400 font-bold underline"><i class="fa fa-rocket mr-2"></i> Open Live Preview Now</a>';
                return;
              } catch (e) {
                attempts++;
                statusEl.innerHTML = '<i class="fa fa-cog fa-spin mr-2"></i> Environment starting... (' + attempts + 's)';
                await new Promise(r => setTimeout(r, 2000));
              }
            }
            statusEl.innerHTML = 'Timeout. Try refreshing manually.';
          }

          async function ask() {
            const input = document.getElementById('prompt');
            const val = input.value.trim();
            if(!val) return;
            
            container.innerHTML += '<div class="message-user py-8 px-4"><div class="max-w-3xl mx-auto flex gap-6"><div class="w-8 h-8 bg-blue-600 rounded-sm flex items-center justify-center shrink-0">U</div><div>' + val + '</div></div></div>';
            input.value = '';
            container.scrollTop = container.scrollHeight;

            const res = await fetch('/chat?prompt=' + encodeURIComponent(val));
            const data = await res.json();
            
            const msgId = 'status-' + Date.now();
            let aiHtml = '<div class="message-ai py-8 px-4 border-b border-black/10"><div class="max-w-3xl mx-auto flex gap-6"><div class="w-8 h-8 bg-emerald-600 rounded-sm flex items-center justify-center shrink-0">AI</div><div class="text-gray-200 prose prose-invert">';
            aiHtml += marked.parse(data.answer);
            if(data.preview_url) {
              aiHtml += '<div id="' + msgId + '" class="mt-4 p-4 bg-black/20 rounded-lg border border-white/10 text-blue-400 italic text-sm">Initializing sandbox...</div>';
            }
            aiHtml += '</div></div></div>';
            
            container.innerHTML += aiHtml;
            container.scrollTop = container.scrollHeight;

            if(data.preview_url) checkPort(data.preview_url, msgId);
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
    const fullText = result.response.text();

    if (fullText.includes("CODE_MODE:")) {
      const sandbox = await Sandbox.create();
      const lines = fullText.split("CODE_MODE:")[1].trim().split("\n");
      const fileName = lines[0].trim();
      const code = lines.slice(1).join("\n").replace(/```\w*|```/g, "").trim();
      
      await sandbox.files.write(fileName, code);
      let output = "";
      let previewUrl = null;

      if (fileName.endsWith('.jsx') || fileName === 'App.jsx') {
        await sandbox.commands.run('mkdir -p my-app/src');
        await sandbox.files.write('my-app/vite.config.js', "import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; export default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: true } });");
        await sandbox.files.write('my-app/src/App.jsx', code);
        
        // Start background process
        sandbox.commands.run("cd my-app && (ls package.json || npm create vite@latest . -- --template react) && npm install && npm run dev -- --host", { background: true });
        previewUrl = "https://" + sandbox.getHost(5173);
        output = "I am launching your React application. You can watch the status below.";
      } else if (fileName.endsWith('.py')) {
        const run = await sandbox.commands.run(`python3 ${fileName}`);
        output = "### Python Output:\n```\n" + (run.stdout || run.stderr) + "\n```";
      }

      res.json({ answer: output, preview_url: previewUrl });
    } else {
      res.json({ answer: fullText });
    }
  } catch (error) {
    res.status(500).json({ answer: "Assistant is currently resting. Quota hit." });
  }
});

app.listen(port, () => console.log("Universal Assistant Online"));
