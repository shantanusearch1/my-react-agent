import express from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import OpenAI from 'openai';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;
const openai = new OpenAI();

app.get('/', (req, res) => res.send('React AI Agent is Online. Use /build?prompt=your_idea'));

// The main route to trigger the agent
app.get('/build', async (req, res) => {
  const userPrompt = req.query.prompt;
  if (!userPrompt) return res.send("Please provide a prompt. Example: /build?prompt=a red button");

  try {
    console.log(`Starting build for: ${userPrompt}`);
    
    // 1. Create the Cloud Sandbox
    const sandbox = await Sandbox.create();

    // 2. Setup React (Vite)
    // We use --template react for plain JavaScript
    await sandbox.commands.run('npm create vite@latest my-app -- --template react');
    await sandbox.commands.run('cd my-app && npm install');

    // 3. Ask AI to write the React Code
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Or your preferred model
      messages: [
        { role: "system", content: "You are a React developer. Return ONLY the code for App.jsx. Use Tailwind classes." },
        { role: "user", content: `Build this UI: ${userPrompt}` }
      ],
    });

    const aiCode = completion.choices[0].message.content;

    // 4. Save the AI's code into the Sandbox
    await sandbox.files.write('my-app/src/App.jsx', aiCode);

    // 5. Start the Preview Server
    // We run 'npm run dev -- --host' so the URL is public
    await sandbox.commands.run('cd my-app && npm run dev -- --host', { background: true });

    // 6. Get the live URL
    const previewUrl = sandbox.getHost(5173);
    
    res.json({
      message: "Success! Your React site is building.",
      url: `https://${previewUrl}`,
      code_generated: aiCode
    });

  } catch (error) {
    console.error(error);
    res.status(500).send("Error building the agent.");
  }
});

app.listen(port, () => console.log(`Brain listening on port ${port}`));
