import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Plus, 
  Trash2, 
  Download, 
  Image as ImageIcon, 
  Video, 
  Mic, 
  Loader2, 
  ChevronRight, 
  ChevronLeft,
  Settings,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Type as TypeIcon,
  Languages,
  Film,
  Upload,
  Maximize2,
  RefreshCw,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality, Type, ThinkingLevel } from "@google/genai";
import { cn } from './lib/utils';

// --- Types ---

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey?: () => Promise<boolean>;
      openSelectKey?: () => Promise<void>;
    };
  }
}

interface Character {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  imageStatus: 'idle' | 'generating' | 'completed' | 'error';
}

interface Scene {
  id: string;
  text: string;
  visualDescriptionCn: string;
  visualDescriptionEn: string;
  characterIds: string[];
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  videoUrl?: string;
  videoDuration?: number;
  videoOperationId?: string;
  status: 'idle' | 'generating' | 'completed' | 'error';
  imageStatus: 'idle' | 'generating' | 'completed' | 'error';
  audioStatus: 'idle' | 'generating' | 'completed' | 'error';
  videoStatus: 'idle' | 'generating' | 'completed' | 'error';
}

// --- Constants ---

const GEMINI_MODEL = "gemini-3.1-pro-preview";
const IMAGE_MODEL = "gemini-2.5-flash-image";
const VIDEO_MODEL = "veo-3.1-fast-generate-preview";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

const STYLES = [
  { id: 'cinematic', name: '电影感 (Cinematic)', prompt: 'Cinematic, photorealistic, high-quality movie still, professional lighting, highly detailed, 8k resolution.' },
  { id: 'anime', name: '动漫 (Anime)', prompt: 'Anime style, vibrant colors, clean lines, high-quality illustration, detailed background.' },
  { id: '3d-render', name: '3D 渲染 (3D Render)', prompt: '3D rendered, Unreal Engine 5 style, Octane render, highly detailed, realistic textures.' },
  { id: 'cyberpunk', name: '赛博朋克 (Cyberpunk)', prompt: 'Cyberpunk aesthetic, neon lights, rainy streets, futuristic, high-tech, detailed.' },
  { id: 'watercolor', name: '水彩 (Watercolor)', prompt: 'Watercolor painting style, soft edges, artistic, hand-painted, textured paper.' },
  { id: 'pixel', name: '像素风 (Pixel Art)', prompt: 'Pixel art style, 16-bit, retro gaming aesthetic, detailed sprite.' },
];

// --- App Component ---

export default function App() {
  const [script, setScript] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [globalStyle, setGlobalStyle] = useState(STYLES[0].id);
  const [currentStep, setCurrentStep] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [apiKeySelected, setApiKeySelected] = useState(false);
  const [manualApiKey, setManualApiKey] = useState<string>('');
  const [showKeyInputModal, setShowKeyInputModal] = useState(false);
  const [isGeneratingAllImages, setIsGeneratingAllImages] = useState(false);
  const [modalImage, setModalImage] = useState<string | null>(null);
  const [serverConfig, setServerConfig] = useState<{ apiKey?: string; geminiApiKey?: string }>({});

  // Initialize AI
  const getAIInstance = async () => {
    let apiKey = manualApiKey || serverConfig.apiKey || process.env.API_KEY || "";
    
    // Try to read dynamically from window.process.env in case the platform injected it there
    try {
      if (typeof window !== 'undefined' && (window as any).process?.env?.API_KEY) {
        apiKey = (window as any).process.env.API_KEY;
      }
    } catch (e) {}

    // If we don't have the key but the UI says we should, try fetching it again
    if (!apiKey && apiKeySelected) {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            if (data.apiKey) {
              setServerConfig(data);
              apiKey = data.apiKey;
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch config in getAIInstance", e);
      }
    }

    // If apiKey is still empty, use a dummy key. 
    // The AI Studio platform proxy will intercept the request and inject the real key.
    // If the user hasn't selected a key, the proxy will return "Requested entity was not found."
    if (!apiKey) {
      console.warn("[Veo Studio] API Key is empty. Using dummy key to allow platform proxy to inject the real key.");
      apiKey = "dummy-key-for-proxy-interception";
    }
    
    return new GoogleGenAI({ apiKey });
  };

  // Check for Veo API Key
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            console.log("[Veo Studio] Server config fetched:", data.apiKey ? "API_KEY Present" : "API_KEY Missing");
            setServerConfig(data);
          } else {
            const text = await res.text();
            console.warn("[Veo Studio] Server config returned non-JSON response. Check server.ts configuration.", text.substring(0, 100));
          }
        } else {
          console.warn("[Veo Studio] Server config fetch failed with status:", res.status);
        }
      } catch (err) {
        console.error("[Veo Studio] Error fetching server config:", err);
      }
    };

    const checkKey = async () => {
      // Check localStorage first
      const savedKey = localStorage.getItem('veo_studio_manual_api_key');
      if (savedKey) {
        setManualApiKey(savedKey);
        setApiKeySelected(true);
      }

      if (window.aistudio?.hasSelectedApiKey) {
        try {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          console.log("[Veo Studio] API key status check:", hasKey);
          if (hasKey) setApiKeySelected(true);
          
          // If hasKey is true but config is missing, re-fetch config
          if (hasKey && !serverConfig.apiKey) {
            await fetchConfig();
          }
        } catch (err) {
          console.error("[Veo Studio] Error checking API key status:", err);
        }
      } else if (!window.aistudio && !savedKey) {
        // Fallback for non-AI Studio environment if no saved key
        console.log("[Veo Studio] window.aistudio not found and no saved key");
      }
    };

    fetchConfig();
    checkKey();
    window.addEventListener('focus', checkKey);
    const interval = setInterval(checkKey, 2000);

    return () => {
      window.removeEventListener('focus', checkKey);
      clearInterval(interval);
    };
  }, [serverConfig.apiKey]);

  const handleOpenKeyDialog = async () => {
    console.log("%c [Veo Studio] Opening API key dialog...", "color: #f97316; font-weight: bold; font-size: 14px;");
    if (window.aistudio?.openSelectKey) {
      try {
        await window.aistudio.openSelectKey();
        console.log("%c [Veo Studio] API key dialog opened successfully", "color: #22c55e; font-weight: bold;");
        
        // Explicitly fetch config after selection
        try {
          const res = await fetch('/api/config');
          if (res.ok) {
            const data = await res.json();
            setServerConfig(data);
          }
        } catch (e) {
          console.error("Error fetching config after selection:", e);
        }
        
        setApiKeySelected(true);
        setError(null);
      } catch (err) {
        console.error("[Veo Studio] Failed to open key dialog:", err);
        setError("无法打开 API Key 设置对话框，请重试。");
      }
    } else {
      console.warn("[Veo Studio] window.aistudio.openSelectKey is not available, showing manual input");
      setShowKeyInputModal(true);
    }
  };

  const handleSaveManualKey = (key: string) => {
    if (!key.trim()) return;
    setManualApiKey(key);
    localStorage.setItem('veo_studio_manual_api_key', key);
    setApiKeySelected(true);
    setShowKeyInputModal(false);
    setError(null);
  };

  // --- Logic Functions ---

  const withRetry = async <T,>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 3000): Promise<T> => {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        const errorStr = JSON.stringify(error);
        
        // Check for 429 Quota Exceeded specifically
        const isQuotaExceeded = errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED') || errorStr.includes('quota');
        const isRetryable = errorStr.includes('503') || errorStr.includes('429') || errorStr.includes('UNAVAILABLE') || errorStr.includes('500') || errorStr.includes('Service Unavailable');
        
        if (!isRetryable || i === maxRetries - 1) throw error;
        
        const delay = initialDelay * Math.pow(2, i);
        let retryMsg = `[Veo Studio] AI 服务繁忙 (503/429)，正在尝试第 ${i + 1} 次重试，等待 ${delay}ms...`;
        
        if (isQuotaExceeded) {
          retryMsg = `[Veo Studio] API 配额已耗尽 (429)，正在尝试第 ${i + 1} 次重试，等待 ${delay}ms... 请检查您的 Google Cloud 结算状态。`;
          // For quota exceeded, we might want to wait longer or show a more prominent warning
          console.error("Quota exceeded. Please check: https://console.cloud.google.com/billing");
        }
        
        console.warn(retryMsg);
        
        // If we have a way to update the UI status, we should
        if (setAnalysisStatus) {
          setAnalysisStatus(retryMsg);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  };

  const analyzeScript = async () => {
    if (!script.trim()) return;
    
    if (!apiKeySelected) {
      handleOpenKeyDialog();
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysisStatus('正在连接 AI 服务...');
    
    console.log("Starting script analysis...");
    
    try {
      const ai = await getAIInstance();
      setAnalysisStatus('正在分析脚本结构并提取角色...');
      
      const response = await withRetry(() => ai.models.generateContent({
        model: GEMINI_MODEL, // Using pro for more robust analysis and broader availability
        contents: `Analyze the following script and break it down into scenes/shots. 
CRITICAL: Each scene's dialogue (text) MUST be approximately 50 Chinese characters long (about 15-20 seconds of speech). If a line is too long, split it into multiple scenes. If it's too short, combine or expand it naturally.

Break it down into:
1. Characters: Identify key characters with a name and a detailed visual description for image generation.
2. Scenes/Shots: For each shot, provide the dialogue (around 50 chars), a visual description in Chinese, a visual description in English, and the list of character names present in that shot.

Return the result as a JSON object with keys: "characters" (array of {name, description}) and "scenes" (array of {text, visualDescriptionCn, visualDescriptionEn, characterNames}).

Script:
${script}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              characters: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ["name", "description"],
                },
              },
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    visualDescriptionCn: { type: Type.STRING },
                    visualDescriptionEn: { type: Type.STRING },
                    characterNames: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ["text", "visualDescriptionCn", "visualDescriptionEn", "characterNames"],
                },
              },
            },
            required: ["characters", "scenes"],
          },
        },
      }));

      setAnalysisStatus('正在解析生成的数据...');
      const fullText = response.text || "{}";
      const data = JSON.parse(fullText);
      
      setAnalysisStatus('正在生成角色列表...');
      const newCharacters: Character[] = (data.characters || []).map((char: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        name: char.name,
        description: char.description,
        imageStatus: 'idle',
      }));

      setAnalysisStatus('正在构建分镜列表...');
      const newScenes: Scene[] = (data.scenes || []).map((item: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        text: item.text,
        visualDescriptionCn: item.visualDescriptionCn,
        visualDescriptionEn: item.visualDescriptionEn,
        characterIds: (item.characterNames || []).map((name: string) => 
          newCharacters.find(c => c.name === name)?.id
        ).filter(Boolean),
        status: 'idle',
        imageStatus: 'idle',
        audioStatus: 'idle',
        videoStatus: 'idle',
      }));

      setCharacters(newCharacters);
      setScenes(newScenes);
      setAnalysisStatus('分析完成！');
      
      setTimeout(() => {
        setCurrentStep(1);
      }, 500);
    } catch (err: any) {
      console.error("Script analysis failed:", err);
      const errorStr = JSON.stringify(err);
      if (err.message === "API_KEY_MISSING" || err.message?.includes("Requested entity was not found") || errorStr.includes("Requested entity was not found")) {
        setError("未检测到有效的 API Key。请点击底部按钮配置您的 API Key。如果刚刚配置，请等待几秒钟让服务器同步。");
        setApiKeySelected(false);
        handleOpenKeyDialog();
      } else if (errorStr.includes('503') || errorStr.includes('UNAVAILABLE') || errorStr.includes('Service Unavailable')) {
        setError("AI 服务目前处于高负载状态（503/UNAVAILABLE）。系统已尝试多次自动重试，但仍未成功。请稍等几分钟后再试。");
      } else if (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED')) {
        setError("脚本分析失败：API 配额已耗尽 (429 RESOURCE_EXHAUSTED)。请检查您的 Google Cloud 结算设置或稍后再试。详情请访问：https://ai.google.dev/gemini-api/docs/rate-limits");
      } else {
        setError(`脚本分析失败: ${err.message || "未知错误"}。请检查网络或重试。`);
      }
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  const skipAnalysis = () => {
    if (scenes.length === 0) {
      // Add a default empty scene if none exist
      const defaultScene: Scene = {
        id: Math.random().toString(36).substr(2, 9),
        text: "在这里输入台词...",
        visualDescriptionCn: "描述画面内容...",
        visualDescriptionEn: "Visual description in English...",
        characterIds: [],
        status: 'idle',
        imageStatus: 'idle',
        audioStatus: 'idle',
        videoStatus: 'idle',
      };
      setScenes([defaultScene]);
    }
    setCurrentStep(1);
  };

  const handleImageUpload = (sceneId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string;
      setScenes(prev => prev.map(s => s.id === sceneId ? { 
        ...s, 
        imageUrl, 
        imageStatus: 'completed' 
      } : s));
    };
    reader.readAsDataURL(file);
  };

  const downloadImage = (imageUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const addCharacter = () => {
    const newChar: Character = {
      id: Math.random().toString(36).substr(2, 9),
      name: "新角色",
      description: "描述角色的外貌特征...",
      imageStatus: 'idle',
    };
    setCharacters(prev => [...prev, newChar]);
  };

  const updateCharacter = (id: string, updates: Partial<Character>) => {
    setCharacters(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const generateCharacterImage = async (charId: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;

    if (!apiKeySelected) {
      handleOpenKeyDialog();
      return;
    }

    setCharacters(prev => prev.map(c => c.id === charId ? { ...c, imageStatus: 'generating' } : c));

    try {
      const ai = await getAIInstance();
      const stylePrompt = STYLES.find(s => s.id === globalStyle)?.prompt || "";
      
      const response = await withRetry(() => ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: {
          parts: [{ text: `High-quality photorealistic character design sheet for ${char.name}: ${char.description}. Style: ${stylePrompt}. Hyper-realistic, highly detailed textures, movie quality, neutral studio background. Avoid any text, cartoonish style, or stylized art.` }]
        },
        config: { 
          imageConfig: { aspectRatio: "1:1" }
        }
      }));

      let imageUrl = "";
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      setCharacters(prev => prev.map(c => c.id === charId ? { ...c, imageUrl, imageStatus: 'completed' } : c));
    } catch (error: any) {
      console.error("Character image generation failed:", error);
      const errorStr = JSON.stringify(error);
      if (error.message === "API_KEY_MISSING" || error.message?.includes("Requested entity was not found") || errorStr.includes("Requested entity was not found")) {
        setApiKeySelected(false);
        handleOpenKeyDialog();
      } else if (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED')) {
        setError("角色生成失败：API 配额已耗尽 (429 RESOURCE_EXHAUSTED)。请检查您的 Google Cloud 结算设置。");
      }
      setCharacters(prev => prev.map(c => c.id === charId ? { ...c, imageStatus: 'error' } : c));
    }
  };

  const regenerateCharacterPrompt = async (charId: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;

    setCharacters(prev => prev.map(c => c.id === charId ? { ...c, imageStatus: 'generating' } : c));

    try {
      const ai = await getAIInstance();
      const response = await withRetry(() => ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Based on the character name "${char.name}" and the script context, generate a detailed visual description in English for AI image generation. Focus on physical features, clothing, and overall vibe. Keep it concise but descriptive. Output ONLY the description.`,
        config: {
          systemInstruction: "You are a professional character designer for films. Your goal is to provide high-quality visual prompts for image generation models."
        }
      }));

      const newDescription = response.text || char.description;
      setCharacters(prev => prev.map(c => c.id === charId ? { ...c, description: newDescription, imageStatus: 'idle' } : c));
    } catch (error: any) {
      console.error("Character prompt regeneration failed:", error);
      const errorStr = JSON.stringify(error);
      if (error.message === "API_KEY_MISSING" || error.message?.includes("Requested entity was not found") || errorStr.includes("Requested entity was not found")) {
        setApiKeySelected(false);
        handleOpenKeyDialog();
      } else if (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED')) {
        setError("提示词优化失败：API 配额已耗尽 (429 RESOURCE_EXHAUSTED)。");
      }
      setCharacters(prev => prev.map(c => c.id === charId ? { ...c, imageStatus: 'error' } : c));
    }
  };

  const generateImage = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, imageStatus: 'generating' } : s));

    try {
      const ai = await getAIInstance();
      const stylePrompt = STYLES.find(s => s.id === globalStyle)?.prompt || "";
      
      // Collect character images for consistency
      const sceneCharacters = characters.filter(c => scene.characterIds.includes(c.id) && c.imageUrl);
      
      const parts: any[] = [];
      
      // Add character reference images as context
      for (const char of sceneCharacters) {
        parts.push({
          inlineData: {
            data: char.imageUrl!.split(',')[1],
            mimeType: 'image/png'
          }
        });
        parts.push({ text: `Reference for character ${char.name}.` });
      }

      parts.push({ 
        text: `Cinematic movie still: ${scene.visualDescriptionEn}. 
        Style: ${stylePrompt}. 
        Ensure the characters match the provided reference images exactly in appearance, clothing, and features. 
        Avoid any text, labels, or storyboard markings in the image.` 
      });

      const response = await withRetry(() => ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: { parts },
        config: { 
          imageConfig: { aspectRatio: "16:9" }
        }
      }));

      let imageUrl = "";
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, imageUrl, imageStatus: 'completed' } : s));
    } catch (error: any) {
      console.error("Image generation failed:", error);
      const errorStr = JSON.stringify(error);
      if (error.message === "API_KEY_MISSING" || error.message?.includes("Requested entity was not found") || errorStr.includes("Requested entity was not found")) {
        setApiKeySelected(false);
        handleOpenKeyDialog();
      } else if (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED')) {
        setError("画面生成失败：API 配额已耗尽 (429 RESOURCE_EXHAUSTED)。请检查您的 Google Cloud 结算设置。");
      }
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, imageStatus: 'error' } : s));
    }
  };

  const generateAllImages = async () => {
    setIsGeneratingAllImages(true);
    try {
      // First, generate all character images if they don't exist
      const pendingChars = characters.filter(c => !c.imageUrl);
      for (const char of pendingChars) {
        await generateCharacterImage(char.id);
      }

      // Then generate all scene start frames
      for (const scene of scenes) {
        if (!scene.imageUrl) {
          await generateImage(scene.id);
        }
      }
    } finally {
      setIsGeneratingAllImages(false);
    }
  };

  const generateAudio = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene || !scene.text) return;

    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, audioStatus: 'generating' } : s));

    try {
      const ai = await getAIInstance();
      const response = await withRetry(() => ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: `Read this dialogue naturally: ${scene.text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          }
        }
      }));

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioUrl = `data:audio/wav;base64,${base64Audio}`;
        
        const audio = new Audio(audioUrl);
        audio.onloadedmetadata = () => {
          setScenes(prev => prev.map(s => s.id === sceneId ? { 
            ...s, 
            audioUrl, 
            audioDuration: audio.duration,
            audioStatus: 'completed' 
          } : s));
        };
      }
    } catch (error: any) {
      console.error("Audio generation failed:", error);
      const errorStr = JSON.stringify(error);
      if (error.message === "API_KEY_MISSING" || error.message?.includes("Requested entity was not found") || errorStr.includes("Requested entity was not found")) {
        setApiKeySelected(false);
        handleOpenKeyDialog();
      } else if (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED')) {
        setError("配音生成失败：API 配额已耗尽 (429 RESOURCE_EXHAUSTED)。");
      }
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, audioStatus: 'error' } : s));
    }
  };

  const generateVideo = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene || !scene.imageUrl) return;

    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, videoStatus: 'generating' } : s));

    try {
      const ai = await getAIInstance();
      const stylePrompt = STYLES.find(s => s.id === globalStyle)?.prompt || "";
      
      const videoConfig: any = {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
      };

      let operation = await withRetry(() => ai.models.generateVideos({
        model: VIDEO_MODEL,
        prompt: `Cinematic motion for this scene: ${scene.visualDescriptionEn}. Style: ${stylePrompt}. Maintain consistency with the provided image(s).`,
        image: {
          imageBytes: scene.imageUrl.split(',')[1],
          mimeType: 'image/png'
        },
        config: videoConfig
      }));

      console.log(`[Veo Studio] Video generation started. Operation ID: ${operation.name}`);
      
      // Polling with safety timeout (5 minutes)
      const startTime = Date.now();
      const TIMEOUT = 5 * 60 * 1000; 
      
      while (!operation.done) {
        if (Date.now() - startTime > TIMEOUT) {
          throw new Error("视频生成超时 (5分钟)，请重试。");
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        try {
          operation = await withRetry(() => ai.operations.getVideosOperation({ operation }), 2, 1000);
          console.log(`[Veo Studio] Polling video status for ${sceneId}: ${operation.done ? "Done" : "In Progress"}`);
        } catch (pollErr) {
          console.warn(`[Veo Studio] Polling error for ${sceneId}, continuing...`, pollErr);
          // Don't throw here, just continue polling unless it's a fatal error
        }
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        let apiKey = manualApiKey || serverConfig.apiKey || process.env.API_KEY || '';
        try {
          if (typeof window !== 'undefined' && (window as any).process?.env?.API_KEY) {
            apiKey = (window as any).process.env.API_KEY;
          }
        } catch (e) {}
        if (!apiKey) apiKey = "dummy-key-for-proxy-interception";
        
        const videoResponse = await fetch(downloadLink, {
          method: 'GET',
          headers: { 'x-goog-api-key': apiKey },
        });
        const blob = await videoResponse.blob();
        const videoUrl = URL.createObjectURL(blob);
        
        // Get video duration
        const tempVideo = document.createElement('video');
        tempVideo.src = videoUrl;
        tempVideo.onloadedmetadata = () => {
          setScenes(prev => prev.map(s => s.id === sceneId ? { 
            ...s, 
            videoUrl, 
            videoDuration: tempVideo.duration,
            videoStatus: 'completed' 
          } : s));
        };
      }
    } catch (err: any) {
      console.error("Video generation failed:", err);
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, videoStatus: 'error' } : s));
      
      if (err.message === "API_KEY_MISSING" || err.message?.includes("Requested entity was not found") || JSON.stringify(err).includes("Requested entity was not found")) {
        console.warn("[Veo Studio] API key invalid or model not found. Resetting key state.");
        setApiKeySelected(false);
        setError("未检测到有效的 API Key。请点击下方的按钮重新设置，并确保选择一个已启用结算的 Google Cloud 项目。");
        handleOpenKeyDialog();
      } else if (JSON.stringify(err).includes('429') || JSON.stringify(err).includes('RESOURCE_EXHAUSTED')) {
        setError(
          <div className="flex flex-col gap-2">
            <p className="font-bold">视频生成失败：API 配额已耗尽 (429 RESOURCE_EXHAUSTED)</p>
            <p className="text-sm opacity-90">视频生成消耗的配额较高。请检查您的 Google Cloud 结算设置，并确保您的项目已启用付费计划。</p>
            <div className="flex gap-4 mt-1">
              <a href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer" className="underline text-xs">检查结算状态</a>
              <a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" rel="noreferrer" className="underline text-xs">了解配额限制</a>
            </div>
          </div>
        );
      } else {
        setError(`视频生成失败: ${err.message || "未知错误"}`);
      }
    }
  };

  const generateAllVideos = async () => {
    const pendingScenes = scenes.filter(s => s.imageUrl && s.videoStatus !== 'completed');
    for (const scene of pendingScenes) {
      await generateVideo(scene.id);
    }
  };

  const updateSceneCn = async (id: string, newCn: string) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, visualDescriptionCn: newCn } : s));
    
    try {
      const ai = await getAIInstance();
      const response = await withRetry(() => ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Translate this visual description to a detailed English prompt for image generation: "${newCn}"`,
      }));
      const newEn = response.text || "";
      setScenes(prev => prev.map(s => s.id === id ? { ...s, visualDescriptionEn: newEn } : s));
    } catch (e: any) {
      console.error("Translation failed", e);
      if (e.message === "API_KEY_MISSING" || e.message?.includes("Requested entity was not found") || JSON.stringify(e).includes("Requested entity was not found")) {
        setApiKeySelected(false);
        handleOpenKeyDialog();
      }
    }
  };

  const [showFinalPreview, setShowFinalPreview] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const startFinalPreview = () => {
    if (scenes.length === 0) return;
    setPreviewIndex(0);
    setShowFinalPreview(true);
  };

  useEffect(() => {
    if (showFinalPreview && videoRef.current) {
      const currentScene = scenes[previewIndex];
      
      // Sync Video
      if (currentScene?.videoUrl) {
        videoRef.current.src = currentScene.videoUrl;
        
        // Adjust playback rate to match audio duration if both exist
        if (currentScene.audioDuration && currentScene.videoDuration) {
          const rate = currentScene.videoDuration / currentScene.audioDuration;
          // Clamp rate between 0.5 and 2.0 to avoid extreme distortion
          videoRef.current.playbackRate = Math.max(0.5, Math.min(2, rate));
        } else {
          videoRef.current.playbackRate = 1;
        }

        videoRef.current.load();
        videoRef.current.play().catch(e => console.error("Video play failed", e));
      }

      // Sync Audio
      if (currentScene?.audioUrl && audioRef.current) {
        audioRef.current.src = currentScene.audioUrl;
        audioRef.current.load();
        audioRef.current.play().catch(e => console.error("Audio play failed", e));
      }
    }
  }, [previewIndex, showFinalPreview, scenes]);

  const handleVideoEnd = () => {
    // If audio is still playing, we wait for it? 
    // Or just move to next when video ends. 
    // User asked to "trim video based on audio", so audio is the master.
  };

  const handleAudioEnd = () => {
    if (previewIndex < scenes.length - 1) {
      setPreviewIndex(prev => prev + 1);
    } else {
      setShowFinalPreview(false);
    }
  };

  const downloadAllAsZip = async () => {
    const JSZip = (await import('jszip')).default;
    const saveAs = (await import('file-saver')).saveAs;
    
    setIsDownloadingAll(true);
    const zip = new JSZip();
    const videoFolder = zip.folder("videos");
    
    try {
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        if (scene.videoUrl) {
          const response = await fetch(scene.videoUrl);
          const blob = await response.blob();
          videoFolder?.file(`scene-${i + 1}.mp4`, blob);
        }
      }
      
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "ai-video-project.zip");
    } catch (error) {
      console.error("Zip generation failed", error);
      alert("打包下载失败，请重试。");
    } finally {
      setIsDownloadingAll(false);
    }
  };

  // --- Render Helpers ---

  const renderStep0 = () => (
    <div className="max-w-3xl mx-auto space-y-8 py-12">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold tracking-tight text-white flex items-center justify-center gap-3">
          <Sparkles className="w-10 h-10 text-orange-500" />
          AI Script-to-Video
        </h1>
        <p className="text-zinc-400 text-lg">输入你的脚本，让 AI 为你生成完整的分镜、配音和视频。</p>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="在这里输入你的脚本或台词..."
          className="w-full h-64 bg-transparent border-none focus:ring-0 text-white text-lg resize-none placeholder:text-zinc-700"
        />
        <div className="flex justify-between items-center mt-4">
          <button 
            onClick={handleOpenKeyDialog}
            className={cn(
              "px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-all active:scale-95 relative z-20",
              apiKeySelected 
                ? "bg-zinc-800/50 text-zinc-400 hover:text-white border border-zinc-700/50" 
                : "bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-900/20 animate-pulse"
            )}
          >
            <Settings className={cn("w-4 h-4", !apiKeySelected && "animate-spin")} /> 
            {apiKeySelected ? "Veo API Key 已就绪 (点击修改)" : "设置 Veo API Key (必填)"}
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <button
              onClick={skipAnalysis}
              className="text-zinc-500 hover:text-zinc-300 text-sm font-medium transition-colors px-4 py-2"
            >
              跳过分析，直接添加分镜
            </button>
            <button
              onClick={analyzeScript}
              disabled={isAnalyzing || !script.trim()}
              className="bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-8 py-3 rounded-full font-semibold transition-all flex items-center gap-2 shadow-lg shadow-orange-900/20 active:scale-95 z-20"
            >
              {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
              开始分析脚本
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 text-red-400 animate-in fade-in zoom-in duration-300">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-xs hover:underline">忽略</button>
        </div>
      )}

      {isAnalyzing && (
        <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2 mb-4 text-zinc-500 text-xs font-bold uppercase tracking-widest">
            <Loader2 className="w-3 h-3 animate-spin" />
            {analysisStatus || "正在分析脚本并生成分镜数据..."}
          </div>
          <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden mb-4">
            <motion.div 
              className="h-full bg-orange-500"
              initial={{ width: "0%" }}
              animate={{ 
                width: analysisStatus.includes('完成') ? "100%" : 
                       analysisStatus.includes('构建') ? "80%" :
                       analysisStatus.includes('解析') ? "60%" :
                       analysisStatus.includes('分析') ? "40%" : "10%" 
              }}
            />
          </div>
          {streamingText && (
            <div className="font-mono text-xs text-zinc-400 whitespace-pre-wrap max-h-48 overflow-y-auto">
              {streamingText}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderStep1 = () => (
    <div className="max-w-6xl mx-auto py-8 space-y-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setCurrentStep(0)}
            className="text-zinc-400 hover:text-white flex items-center gap-2 transition-colors bg-zinc-900/50 px-4 py-2 rounded-lg border border-zinc-800"
          >
            <ChevronLeft className="w-5 h-5" /> 撤回 / 返回脚本
          </button>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">风格</span>
            <select 
              value={globalStyle}
              onChange={(e) => setGlobalStyle(e.target.value)}
              className="bg-transparent border-none text-xs text-white focus:ring-0 cursor-pointer"
            >
              {STYLES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <button 
            onClick={handleOpenKeyDialog}
            className={cn(
              "px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-all active:scale-95 relative z-20",
              apiKeySelected 
                ? "bg-zinc-800/50 text-zinc-400 hover:text-white border border-zinc-700/50" 
                : "bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-900/20 animate-pulse"
            )}
          >
            <Settings className={cn("w-4 h-4", !apiKeySelected && "animate-spin")} /> 
            {apiKeySelected ? "Veo API Key 已就绪" : "设置 Veo API Key"}
          </button>
          <button 
            onClick={startFinalPreview}
            disabled={!scenes.some(s => s.videoUrl)}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 rounded-full font-semibold flex items-center gap-2 border border-zinc-700 disabled:opacity-50 z-20"
          >
            <Play className="w-5 h-5" /> 预览最终成片
          </button>
          <button 
            onClick={generateAllImages}
            disabled={isGeneratingAllImages}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 rounded-full font-semibold flex items-center gap-2 border border-zinc-700 disabled:opacity-50"
          >
            {isGeneratingAllImages ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
            一键生成所有图片
          </button>
          <button 
            onClick={downloadAllAsZip}
            disabled={isDownloadingAll || !scenes.some(s => s.videoUrl)}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 rounded-full font-semibold flex items-center gap-2 border border-zinc-700 disabled:opacity-50"
          >
            {isDownloadingAll ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            打包下载所有视频
          </button>
          <button 
            onClick={generateAllVideos}
            className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-full font-semibold flex items-center gap-2 shadow-lg shadow-orange-900/20"
          >
            <Film className="w-5 h-5" /> 一键生成所有视频
          </button>
        </div>
      </div>

      {/* Character Design Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500/20 p-2 rounded-lg">
              <Sparkles className="w-5 h-5 text-orange-500" />
            </div>
            <h2 className="text-2xl font-bold text-white">角色设计 (Character Consistency)</h2>
          </div>
          <button 
            onClick={addCharacter}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm border border-zinc-700"
          >
            <Plus className="w-4 h-4" /> 添加角色
          </button>
        </div>
        <p className="text-zinc-500 text-sm">先生成角色形象，确保后续分镜中的角色长相一致。</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {characters.map((char) => (
            <div key={char.id} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 flex gap-4 group relative">
              <button 
                onClick={() => setCharacters(prev => prev.filter(c => c.id !== char.id))}
                className="absolute top-2 right-2 p-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-3 h-3" />
              </button>
              <div 
                className="w-24 h-24 bg-zinc-950 rounded-xl overflow-hidden flex-shrink-0 border border-zinc-800 relative cursor-pointer group/img"
                onClick={() => char.imageUrl && setModalImage(char.imageUrl)}
              >
                {char.imageUrl ? (
                  <>
                    <img src={char.imageUrl} alt={char.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                      <Maximize2 className="w-5 h-5 text-white" />
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-800">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                )}
                {char.imageStatus === 'generating' && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input 
                  value={char.name}
                  onChange={(e) => updateCharacter(char.id, { name: e.target.value })}
                  className="bg-transparent border-none text-white font-bold p-0 focus:ring-0 w-full"
                />
                <div className="relative group/prompt">
                  <textarea 
                    value={char.description}
                    onChange={(e) => updateCharacter(char.id, { description: e.target.value })}
                    className="bg-transparent border-none text-zinc-500 text-xs p-0 focus:ring-0 w-full resize-none h-12 pr-6"
                  />
                  <button 
                    onClick={() => regenerateCharacterPrompt(char.id)}
                    className="absolute top-0 right-0 p-1 text-zinc-600 hover:text-orange-500 opacity-0 group-hover/prompt:opacity-100 transition-opacity"
                    title="重新生成提示词"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => generateCharacterImage(char.id)}
                    disabled={char.imageStatus === 'generating'}
                    className="text-[10px] font-bold uppercase tracking-widest text-orange-500 hover:text-orange-400 disabled:text-zinc-600 transition-colors"
                  >
                    {char.imageStatus === 'completed' ? "重新生成形象" : "生成形象"}
                  </button>
                  {char.imageUrl && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadImage(char.imageUrl!, `${char.name}.png`);
                      }}
                      className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> 下载
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="h-px bg-zinc-800 w-full" />

      {/* Scenes Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/20 p-2 rounded-lg">
            <Film className="w-5 h-5 text-blue-500" />
          </div>
          <h2 className="text-2xl font-bold text-white">分镜制作 (Storyboarding)</h2>
        </div>
        
        <div className="grid grid-cols-1 gap-6">
          {scenes.map((scene, index) => (
          <motion.div 
            key={scene.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12"
          >
            <div className="lg:col-span-7 p-6 space-y-6">
              <div className="flex items-start gap-4">
                <div className="bg-zinc-800 text-zinc-400 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-mono text-sm">
                  {index + 1}
                </div>
                <div className="flex-1 space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                      <TypeIcon className="w-3 h-3" /> 台词 / 对白
                    </label>
                    <p className="text-white text-lg leading-relaxed">{scene.text}</p>
                  </div>

                  {scene.characterIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {scene.characterIds.map(id => {
                        const char = characters.find(c => c.id === id);
                        return char ? (
                          <span key={id} className="bg-zinc-800 text-zinc-400 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 border border-zinc-700">
                            <div className={cn("w-1.5 h-1.5 rounded-full", char.imageUrl ? "bg-orange-500" : "bg-zinc-600")} />
                            {char.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                        <Languages className="w-3 h-3" /> 分镜描述 (中文)
                      </label>
                      <textarea
                        value={scene.visualDescriptionCn}
                        onChange={(e) => setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, visualDescriptionCn: e.target.value } : s))}
                        onBlur={(e) => updateSceneCn(scene.id, e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-300 focus:border-orange-500 transition-colors h-24 resize-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                        <ImageIcon className="w-3 h-3" /> Image Prompt (EN)
                      </label>
                      <textarea
                        value={scene.visualDescriptionEn}
                        onChange={(e) => setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, visualDescriptionEn: e.target.value } : s))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-500 focus:border-orange-500 transition-colors h-24 resize-none italic"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button 
                      onClick={() => generateImage(scene.id)}
                      disabled={scene.imageStatus === 'generating'}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all",
                        scene.imageStatus === 'completed' ? "bg-zinc-800 text-zinc-300" : "bg-zinc-800 hover:bg-zinc-700 text-white"
                      )}
                    >
                      {scene.imageStatus === 'generating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                      {scene.imageStatus === 'completed' ? "重新生成图片" : "生成图片"}
                    </button>
                    
                    <button 
                      onClick={() => generateAudio(scene.id)}
                      disabled={scene.audioStatus === 'generating'}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all",
                        scene.audioStatus === 'completed' ? "bg-zinc-800 text-zinc-300" : "bg-zinc-800 hover:bg-zinc-700 text-white"
                      )}
                    >
                      {scene.audioStatus === 'generating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                      {scene.audioStatus === 'completed' ? "重新生成配音" : "生成配音"}
                    </button>

                    <button 
                      onClick={() => generateVideo(scene.id)}
                      disabled={scene.videoStatus === 'generating' || !scene.imageUrl}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all",
                        !scene.imageUrl ? "opacity-50 cursor-not-allowed bg-zinc-900 text-zinc-600" : 
                        scene.videoStatus === 'completed' ? "bg-zinc-800 text-zinc-300" : "bg-orange-600/20 text-orange-500 hover:bg-orange-600/30 border border-orange-500/30"
                      )}
                    >
                      {scene.videoStatus === 'generating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                      {scene.videoStatus === 'completed' ? "重新生成视频" : "生成视频"}
                    </button>

                    <button 
                      onClick={() => setScenes(prev => prev.filter(s => s.id !== scene.id))}
                      className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all bg-zinc-900 text-zinc-600 hover:text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                      删除分镜
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 bg-zinc-950 p-4 flex flex-col gap-4 border-l border-zinc-800">
              <div className="relative aspect-video bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 group">
                {scene.videoUrl ? (
                  <video src={scene.videoUrl} controls className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full relative bg-zinc-900">
                    {scene.imageUrl ? (
                      <img src={scene.imageUrl} alt="Storyboard Frame" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-800 gap-1">
                        <ImageIcon className="w-4 h-4" />
                        <span className="text-[8px] uppercase font-bold">分镜帧</span>
                      </div>
                    )}
                    {scene.imageStatus === 'generating' && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                      </div>
                    )}
                  </div>
                )}
                
                {/* Image Actions Overlay */}
                <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {scene.imageUrl && (
                    <button 
                      onClick={() => downloadImage(scene.imageUrl!, `scene-${index + 1}.png`)}
                      className="bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg backdrop-blur-md transition-all"
                      title="下载图片"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  <label className="bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg backdrop-blur-md transition-all cursor-pointer" title="上传图片">
                    <Upload className="w-4 h-4" />
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(scene.id, file);
                      }} 
                    />
                  </label>
                </div>

                {scene.videoStatus === 'generating' && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                    <span className="text-sm font-medium animate-pulse">正在生成 Veo 视频...</span>
                  </div>
                )}

                {scene.videoUrl && (
                  <a 
                    href={scene.videoUrl} 
                    download={`scene-${index + 1}.mp4`}
                    className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => generateImage(scene.id)}
                  disabled={scene.imageStatus === 'generating'}
                  className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase rounded-lg border border-zinc-800 transition-colors"
                >
                  {scene.imageStatus === 'generating' ? "生成中..." : "生成分镜帧"}
                </button>
              </div>

              {scene.audioUrl && (
                <div className="bg-zinc-900 rounded-xl p-3 flex flex-col gap-2 border border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="bg-orange-500/10 p-2 rounded-lg">
                      <Mic className="w-4 h-4 text-orange-500" />
                    </div>
                    <audio src={scene.audioUrl} controls className="flex-1 h-8" />
                    <span className="text-[10px] font-mono text-zinc-500">{scene.audioDuration?.toFixed(1)}s</span>
                  </div>
                  {scene.videoUrl && scene.videoDuration && (
                    <div className="flex items-center justify-between px-1 border-t border-zinc-800 pt-2">
                      <div className="flex items-center gap-2">
                        <Video className="w-3 h-3 text-zinc-600" />
                        <span className="text-[9px] text-zinc-500 uppercase font-bold">视频: {scene.videoDuration.toFixed(1)}s</span>
                      </div>
                      {scene.audioDuration && (
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-800",
                          Math.abs(scene.audioDuration - scene.videoDuration) < 0.2 ? "text-green-500" : "text-orange-500"
                        )}>
                          {Math.abs(scene.audioDuration - scene.videoDuration) < 0.2 ? "时长匹配" : `自动变速: ${(scene.videoDuration / scene.audioDuration).toFixed(2)}x`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ))}
        
        <button 
          onClick={() => {
            const newScene: Scene = {
              id: Math.random().toString(36).substr(2, 9),
              text: "新台词...",
              visualDescriptionCn: "新画面描述...",
              visualDescriptionEn: "New visual description...",
              characterIds: [],
              status: 'idle',
              imageStatus: 'idle',
              audioStatus: 'idle',
              videoStatus: 'idle',
            };
            setScenes([...scenes, newScene]);
          }}
          className="w-full py-8 border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-500 hover:text-white hover:border-zinc-700 hover:bg-zinc-900/50 transition-all flex flex-col items-center justify-center gap-2 group"
        >
          <div className="bg-zinc-900 p-3 rounded-full group-hover:scale-110 transition-transform">
            <Plus className="w-6 h-6" />
          </div>
          <span className="font-medium">添加新分镜</span>
        </button>
      </div>
    </section>
  </div>
);

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-orange-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-900/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-zinc-900/20 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 px-6 pb-24">
        {currentStep === 0 ? renderStep0() : renderStep1()}
      </main>

      <AnimatePresence>
        {showFinalPreview && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-8"
          >
            <div className="max-w-5xl w-full aspect-video bg-zinc-900 rounded-3xl overflow-hidden relative shadow-2xl border border-zinc-800">
              <video 
                ref={videoRef}
                className="w-full h-full object-contain"
                muted // Mute video to prioritize TTS audio
              />
              <audio 
                ref={audioRef}
                onEnded={handleAudioEnd}
                className="hidden"
              />
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 w-full px-12">
                <div className="bg-black/50 backdrop-blur-md px-6 py-3 rounded-full border border-zinc-700 flex items-center gap-4">
                  <span className="text-white font-mono text-sm">
                    SCENE {previewIndex + 1} / {scenes.length}
                  </span>
                  <div className="w-48 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-orange-500 transition-all duration-300" 
                      style={{ width: `${((previewIndex + 1) / scenes.length) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-white text-center text-lg font-medium drop-shadow-lg max-w-2xl">
                  {scenes[previewIndex]?.text}
                </div>
              </div>
              <button 
                onClick={() => setShowFinalPreview(false)}
                className="absolute top-8 right-8 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-colors"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Modal */}
      <AnimatePresence>
        {modalImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setModalImage(null)}
            className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={modalImage} 
                alt="Enlarged view" 
                className="w-full h-full object-contain rounded-2xl shadow-2xl border border-zinc-800"
                referrerPolicy="no-referrer"
              />
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => downloadImage(modalImage, 'character-design.png')}
                  className="bg-white text-black px-6 py-2 rounded-full font-bold flex items-center gap-2 hover:bg-zinc-200 transition-colors"
                >
                  <Download className="w-5 h-5" /> 下载图片
                </button>
                <button 
                  onClick={() => setModalImage(null)}
                  className="bg-zinc-800 text-white px-6 py-2 rounded-full font-bold flex items-center gap-2 hover:bg-zinc-700 transition-colors border border-zinc-700"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showKeyInputModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4"
            onClick={() => setShowKeyInputModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                  <Key className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">配置 API Key</h3>
                  <p className="text-xs text-zinc-500 uppercase tracking-widest mt-0.5">Manual API Configuration</p>
                </div>
              </div>
              
              <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                检测到您当前不在 AI Studio 预览环境运行。为了继续使用 AI 生成功能，请提供您的 Google Gemini API Key。
                您的 Key 将仅保存在本地浏览器中。
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-2 block">Gemini API Key</label>
                  <input 
                    type="password"
                    placeholder="输入您的 API Key..."
                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                    defaultValue={manualApiKey}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveManualKey((e.target as HTMLInputElement).value);
                      }
                    }}
                    id="manual-api-key-input"
                  />
                </div>
                
                <div className="flex flex-col gap-3 pt-2">
                  <button 
                    onClick={() => {
                      const input = document.getElementById('manual-api-key-input') as HTMLInputElement;
                      handleSaveManualKey(input.value);
                    }}
                    className="w-full bg-white text-black py-3 rounded-xl font-bold hover:bg-zinc-200 transition-colors"
                  >
                    保存并激活
                  </button>
                  <button 
                    onClick={() => setShowKeyInputModal(false)}
                    className="w-full bg-zinc-800 text-white py-3 rounded-xl font-bold hover:bg-zinc-700 transition-colors border border-zinc-700"
                  >
                    取消
                  </button>
                </div>
                
                <p className="text-[10px] text-center text-zinc-600 mt-4">
                  没有 API Key？前往 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-orange-500 hover:underline">Google AI Studio</a> 免费获取。
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-black/80 backdrop-blur-md border-t border-zinc-800/50 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-zinc-500">
          <div className="flex items-center gap-4">
            <button 
              onClick={handleOpenKeyDialog}
              className="flex items-center gap-1.5 hover:text-white transition-colors group"
            >
              <div className={cn("w-1.5 h-1.5 rounded-full transition-all group-hover:scale-125", apiKeySelected ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]")} />
              AI Studio API: {apiKeySelected ? "已就绪 (使用您的 Key)" : "未配置 (点击设置您的 Key)"}
            </button>
            <span className="flex items-center gap-1.5">
              <div className={cn("w-1.5 h-1.5 rounded-full", apiKeySelected ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-zinc-600")} />
              全功能支持: {apiKeySelected ? "已激活" : "等待配置"}
            </span>
          </div>
          <div>
            AI Video Script-to-Video Studio &copy; 2026
          </div>
        </div>
      </footer>
    </div>
  );
}
