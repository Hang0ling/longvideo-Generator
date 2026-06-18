# AI Script-to-Video Studio

AI Script-to-Video Studio turns a written script into a structured video production package. It can analyze a script, create scenes and shot plans, generate storyboard images, prepare voiceover assets, and guide Veo-style video generation workflows.

Original AI Studio project:
https://ai.studio/apps/c07f1df4-c8a6-4c41-87d0-5e2b364aeca5

## What It Does

- Accepts long-form scripts and breaks them into production-ready scenes.
- Builds shot plans, character notes, and visual descriptions.
- Uses Gemini for script analysis and creative planning.
- Uses Gemini image generation for storyboard or reference frames.
- Includes voiceover and video-generation workflow hooks.
- Supports manual Gemini API key entry when not running inside AI Studio.
- Stores a manual key in local storage for local testing convenience.
- Can package generated assets for download.

## Tech Stack

- React 19
- TypeScript
- Vite
- Express and `tsx` local server
- `@google/genai`
- Motion
- JSZip
- FileSaver
- Tailwind CSS

## Project Structure

- `src/App.tsx` - Main studio workflow, Gemini calls, key handling, and UI.
- `server.ts` - Local server and runtime configuration endpoint.
- `src/index.css` - Tailwind and app styling.
- `src/lib/utils.ts` - Shared utility helpers.
- `.env.example` - Environment variable template.
- `vite.config.ts` - Vite and React configuration.

## Requirements

- Node.js 18 or newer
- A Gemini API key

Create `.env.local` from the example:

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

```bash
GEMINI_API_KEY=your_gemini_api_key
```

The app can also ask for an API key in the UI when it detects that it is not running inside AI Studio.

## Run Locally

```bash
npm install
npm run dev
```

The dev script runs the local server with `tsx server.ts`.

## Build And Check

```bash
npm run lint
npm run build
npm run preview
```

## Notes

- Long video generation can require high quota and access to preview models.
- Model names and availability may change; update constants in `src/App.tsx` if the API changes.
- Do not commit `.env.local` or real API keys.
