import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes FIRST
  app.get(["/api/config", "/api/config/"], (req, res) => {
    console.log(`[Veo Studio Server] GET /api/config hit`);
    // Return the latest environment variables
    res.json({ 
      apiKey: process.env.API_KEY || "",
      geminiApiKey: process.env.GEMINI_API_KEY || ""
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Veo Studio Server] Running on http://localhost:${PORT}`);
    console.log(`[Veo Studio Server] API_KEY: ${process.env.API_KEY ? "Present" : "Missing"}`);
  });
}

startServer();
