import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ChatConfig, ImageSize } from "../types";

// Initialize the client once if possible, but we use process.env.API_KEY directly.
const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = "You are TradePod, an intelligent assistant for New Zealand tradespeople. Your primary goal is to provide accurate, standards-compliant advice for the NZ construction industry.\n\nCRITICAL: You MUST prioritize and reference the following standards:\n1. Electrical: AS/NZS 3000 (Wiring Rules).\n2. Plumbing: AS/NZS 3500.\n3. Building: New Zealand Building Code (NZBC) and NZS 3604.\n\nIf the user uploads PDF plans, use your advanced reasoning to analyze them pixel-by-pixel. Perform OCR if necessary to extract dimensions from scanned drawings. Cross-reference symbol legends with floor plans.\n\nTone: Professional, direct, and rugged. Use Kiwi trade slang where natural (e.g., 'sparky', 'chippie', 'drainlayer'). Assume all queries refer to New Zealand regulations unless specified otherwise.";

const getCommonConfig = (config?: ChatConfig) => {
    let model = 'gemini-2.5-flash';
    const tools: any[] = [];
    const toolConfig: any = {};

    if (config?.useSearch) {
        model = 'gemini-2.5-flash';
        tools.push({ googleSearch: {} });
    }

    if (config?.useMaps) {
        model = 'gemini-2.5-flash';
        tools.push({ googleMaps: {} });
        if (config.userLocation) {
            toolConfig.retrievalConfig = {
                latLng: {
                    latitude: config.userLocation.latitude,
                    longitude: config.userLocation.longitude
                }
            };
        }
    }
    return { model, tools, toolConfig };
};

export const generateChatResponse = async (
  prompt: string,
  filePart?: { inlineData: { data: string; mimeType: string } },
  config?: ChatConfig
) => {
  const ai = getClient();
  const { model, tools, toolConfig } = getCommonConfig(config);

  const contentParts: any[] = [];
  if (filePart) {
    contentParts.push(filePart);
  }
  contentParts.push({ text: prompt });
  
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: contentParts },
      config: {
        tools: tools.length > 0 ? tools : undefined,
        toolConfig: Object.keys(toolConfig).length > 0 ? toolConfig : undefined,
        systemInstruction: SYSTEM_INSTRUCTION
      }
    });

    return {
      text: response.text || "I processed that but couldn't generate a text response.",
      groundingMetadata: response.candidates?.[0]?.groundingMetadata
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const generateChatResponseStream = async (
    prompt: string,
    filePart?: { inlineData: { data: string; mimeType: string } },
    config?: ChatConfig
) => {
    const ai = getClient();
    const { model, tools, toolConfig } = getCommonConfig(config);

    const contentParts: any[] = [];
    if (filePart) {
        contentParts.push(filePart);
    }
    contentParts.push({ text: prompt });

    try {
        const streamResult = await ai.models.generateContentStream({
            model: model,
            contents: { parts: contentParts },
            config: {
                tools: tools.length > 0 ? tools : undefined,
                toolConfig: Object.keys(toolConfig).length > 0 ? toolConfig : undefined,
                systemInstruction: SYSTEM_INSTRUCTION
            }
        });
        return streamResult;
    } catch (error) {
        console.error("Gemini Stream API Error:", error);
        throw error;
    }
};

export const generateImage = async (prompt: string, size: ImageSize) => {
  const ai = getClient();
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: {
            imageSize: size,
            aspectRatio: "1:1" // Default square for the "Pod" feel
        }
      }
    });

    // Extract image
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  } catch (error) {
    console.error("Image Gen Error:", error);
    throw error;
  }
};

export const generateSpeech = async (text: string) => {
    const ai = getClient();
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });
        
        // Return base64 audio data
        return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    } catch (error) {
        console.error("TTS Error:", error);
        throw error;
    }
};