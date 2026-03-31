import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

// 1. Initialize Gemini with a Universal Identity
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-3.1-flash-lite-preview",
  systemInstruction: `You are a Universal AI Assistant. 
  - For coding/apps: Start your response with "CODE_MODE: filename.ext" followed by the code.
  - You can use .py, .js, .html, or .sh. 
  - For general knowledge: Answer using Markdown formatting (bold, lists, etc.).
  - Be concise, witty, and helpful.`
});

// 2. The ChatGPT-Style Interface
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <title>Universal AI</title>
        <style>
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-thumb { background: #4a5568; border-radius: 10px; }
          .message-user { background-color: #444654; }
          .message-ai { background-color: #343541; }
          pre { background: #1e1e1e; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; margin: 10px 0; border: 1px solid #333; }
          code { font-family: 'Fira Code', monospace; color: #e2e8f0; }
          p { margin-bottom: 1rem; }
        </style>
      </head>
      <body class="bg-[#343541] text-gray-100 h-screen flex overflow-hidden font-sans">
        
        <div class="w-64 bg-[#202123] h-full flex-col p-2 hidden md:flex">
          <button onclick="window.location.reload()" class="flex items-center gap-3 w-full p-3 border border-white/20 rounded-md hover:bg-gray-500/10 transition text-sm mb-2">
            <i class="fa fa-plus text-xs"></i> New Chat
          </button>
          <div class="flex-1 overflow-y-auto mt-4 text-xs text-gray-400 p-2 italic">
            Chat history is saved locally in this session.
          </div>
        </div>

        <div class="flex-1 flex flex-col h-full relative">
          <div id="chat-container" class="flex-1 overflow-y-auto pb-48">
            <div class="message-ai py-8 px-4 border-b border-black/10">
              <div class="max-w-3xl mx-auto flex gap-4 md:gap-6">
                <div class="w-8 h-8 rounded-sm bg-emerald-600 flex items-center justify-center text-[10px] shrink-0 font-bold">AI</div>
                <div class="text-gray-200 leading-relaxed">
                  I'm your 2026 Universal Assistant. I can execute Python, host HTML sites, or answer questions. What's on your mind?
                </div>
              </div>
            </div>
          </div>

          <div class="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#343541] via-[#343541] to-transparent pt-6">
            <div class="max-w-3xl mx-auto px-4 pb-8">
              <div class="relative flex items-center bg-[#40414f] rounded-xl border border-black/10 shadow-2xl">
                <textarea id="prompt" rows="1" 
                  class="w-full bg-transparent text-white p-4 pr-12 focus:outline-none resize-none overflow-hidden"
                  placeholder="Ask me anything..."
                  oninput="this.style.height = ''; this.style.height = this.scrollHeight + 'px'"></textarea>
                <button onclick="ask()" id="send-btn" class="absolute right-3 p-2 text-gray-400 hover:text-white transition">
                  <i class="fa fa-paper-plane"></i>
                </button>
              </div>
              <p class="text-[10px] text-gray-500 text-center mt-3 uppercase tracking-widest font-bold">
                E2B Sandbox Enabled • Gemini 3.1 Flash-Lite
              </p>
            </div>
          </div>
        </div>

        <script>
          async function ask() {
            const input = document.getElementById('prompt');
            const container = document.getElementById('chat-container');
            const btn = document.getElementById('send-btn');
            const val = input.value.trim();
            if(!val || btn.disabled) return;

            // Render User Message
            container.innerHTML += \`
              <div class="message-user py-8 px-4 border-b border-black/10">
                <div class="max-w-3xl mx-auto flex gap-4 md:gap-6">
                  <div class="w-8 h-8 rounded-sm bg-blue-600 flex items-center justify-center text-[10px] shrink-0 font-bold">YOU</div>
                  <div class="text-gray-100">\${val}</div>
                </div>
              </div>\`;
            
            input.value = '';
            input.style.height = 'auto';
            btn.disabled = true;
            container.scrollTop = container.scrollHeight;

            try {
              const res = await fetch('/chat?prompt=' + encodeURIComponent(val));
              const data = await res.json();

              // Render AI Response with Markdown
              let htmlResponse = \`
                <div class="message-ai py-8 px-4 border-b border-black/10">
                  <div class="max-w-3xl mx-auto flex gap-4 md:gap-6">
                    <div class="w-8 h-8 rounded-sm bg-emerald-600 flex items-center justify-center text-[10px] shrink-0 font-bold">AI</div>
                    <div class="text-gray-200 prose prose-invert max-w-none">
                      \${marked.parse(data.answer)}
                      \${data.preview_url ? \`
                        <div class="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                          <a href="\${data.preview_url}" target="_blank" class="text-emerald-400 font-bold underline italic">
                            <i class="fa fa-external-link mr-2"></i> Open Generated Preview
                          </a>
                        </div>\` : ''}
                    </div>
                  </div>
                </div>\`;
              container.innerHTML += htmlResponse;
            } catch(e) {
              container.innerHTML += '<div class="p-4 text-red-500 text-center text-xs">Connection Error.</div>';
            } finally {
              btn.disabled = false;
              container.scrollTop = container.scrollHeight;
            }
          }

          document.getElementById('prompt').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
          });
        </script>
      </body>
    </html>
  `);
});

// 3. The Backend Logic (Universal Tool-Use)
app.get('/chat', async (req, res) => {
  const prompt = req.query.prompt;
  try {
    const result = await model.generateContent(prompt);
    const fullText = result.response.text();

    if (fullText.includes("CODE_MODE:")) {
      const sandbox = await Sandbox.create();
      
      // Parse Filename and Code
      const lines = fullText.split("CODE_MODE:")[1].trim().split("\n");
      const fileName = lines[0].trim();
      const code = lines.slice(1).join("\n").replace(/```\w*|```/g, "").trim();
      
      await sandbox.files.write(fileName, code);

      let output = "";
      let previewUrl = null;

      // Decide execution based on extension
      if (fileName.endsWith('.py')) {
        const run = await sandbox.commands.run(`python3 \${fileName}`);
        output = "### Python Execution Output:\\n\`\`\`\\n" + (run.stdout || run.stderr || "Success (No output)") + "\\n\`\`\`";
      } else if (fileName.endsWith('.html')) {
        sandbox.commands.run("npx serve -l 5173", { background: true });
        previewUrl = "https://" + sandbox.getHost(5173);
        output = "I have generated an HTML interface for you. You can view it using the link below.";
      } else if (fileName.endsWith('.js')) {
        const run = await sandbox.commands.run(`node \${fileName}`);
        output = "### Node.js Execution Output:\\n\`\`\`\\n" + (run.stdout || run.stderr) + "\\n\`\`\`";
      } else {
        output = "File created: " + fileName;
      }

      res.json({ answer: output, preview_url: previewUrl });
    } else {
      res.json({ answer: fullText });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ answer: "My thoughts are hitting a limit (Quota). Try again in a minute!" });
  }
});

app.listen(port, () => console.log("Universal Assistant Online"));
