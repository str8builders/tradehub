import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { createPcmBlob, decodeAudioData } from '../services/audioUtils';
import { AppMode } from '../types';

interface LiveInterfaceProps {
  onStateChange: (state: 'idle' | 'listening' | 'speaking' | 'thinking' | 'connected' | 'error') => void;
  onError: (msg: string) => void;
  registerAction?: (action: () => void) => void;
  onSwitchMode: (mode: AppMode) => void;
}

const switchModeTool: FunctionDeclaration = {
    name: "switchMode",
    description: "Switch the application mode to Chat, Live, or Visualizer.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: {
          type: Type.STRING,
          description: "The mode to switch to. Values: 'CHAT', 'LIVE', 'IMAGE_GEN'",
        }
      },
      required: ["mode"]
    }
};

const LiveInterface: React.FC<LiveInterfaceProps> = ({ onStateChange, onError, registerAction, onSwitchMode }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Refs for Audio Contexts and Session
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Cleanup function
  const stopSession = useCallback(() => {
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => session.close()).catch(() => {});
        sessionPromiseRef.current = null;
    }
    
    // Stop mic stream
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }

    // Stop audio processing
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close();
        inputAudioContextRef.current = null;
    }

    // Stop output
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
    
    if (outputAudioContextRef.current) {
        outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
    }

    setIsConnected(false);
    onStateChange('idle');
  }, [onStateChange]);

  const startSession = async () => {
    try {
      onStateChange('listening');
      setIsConnected(true);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Audio Setup
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputNode = inputAudioContextRef.current.createGain();
      // Mute logic could apply here to inputNode

      const source = inputAudioContextRef.current.createMediaStreamSource(stream);
      const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMuted) return; // Simple software mute
        
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmBlob = createPcmBlob(inputData);
        
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
            });
        }
      };

      source.connect(processor);
      processor.connect(inputAudioContextRef.current.destination);

      // Connect to Gemini Live
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log("Live Session Opened");
            onStateChange('listening');
          },
          onmessage: async (message: LiveServerMessage) => {
             // Handle Tool Call (Switch Mode)
             if (message.toolCall) {
                 const call = message.toolCall.functionCalls.find(fc => fc.name === 'switchMode');
                 if (call) {
                     const mode = (call.args as any).mode;
                     console.log("Switching mode to:", mode);
                     // We must close session before switching to prevent lingering audio
                     stopSession();
                     // Map string to AppMode enum if necessary, or just pass if matches
                     if (mode === 'CHAT') onSwitchMode(AppMode.CHAT);
                     if (mode === 'LIVE') onSwitchMode(AppMode.LIVE);
                     if (mode === 'IMAGE_GEN') onSwitchMode(AppMode.IMAGE_GEN);
                     return;
                 }
             }

             // Handle Audio Output
             const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (base64Audio && outputAudioContextRef.current) {
                onStateChange('speaking');
                
                try {
                    const audioBuffer = await decodeAudioData(
                        new Uint8Array(base64ToUint8Array(base64Audio)), // Helper needed here? No, decodeAudioData handles Uint8Array, we need base64->Uint8Array
                        outputAudioContextRef.current,
                        24000
                    );

                    // Sync playback
                    nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
                    
                    const sourceNode = outputAudioContextRef.current.createBufferSource();
                    sourceNode.buffer = audioBuffer;
                    sourceNode.connect(outputAudioContextRef.current.destination);
                    
                    sourceNode.addEventListener('ended', () => {
                        sourcesRef.current.delete(sourceNode);
                        if (sourcesRef.current.size === 0) {
                            onStateChange('listening'); // Back to listening when done speaking
                        }
                    });

                    sourceNode.start(nextStartTimeRef.current);
                    nextStartTimeRef.current += audioBuffer.duration;
                    sourcesRef.current.add(sourceNode);

                } catch (err) {
                    console.error("Audio Decode Error", err);
                }
             }

             // Handle Interruption
             if (message.serverContent?.interrupted) {
                 console.log("Interrupted");
                 sourcesRef.current.forEach(s => s.stop());
                 sourcesRef.current.clear();
                 nextStartTimeRef.current = 0;
                 onStateChange('listening');
             }
          },
          onclose: () => {
            console.log("Session Closed");
            stopSession();
          },
          onerror: (err: any) => {
            console.error("Session Error", err);
            
            let userMsg = "Connection error with Live API.";
            const errorStr = err?.message || err?.toString() || "";

            if (errorStr.includes("403") || errorStr.includes("PERMISSION_DENIED")) {
                userMsg = "Access denied (403). Please check your API key and billing settings.";
            } else if (errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED")) {
                userMsg = "Quota exceeded (429). The system is busy, please try again later.";
            } else if (errorStr.includes("503") || errorStr.includes("UNAVAILABLE")) {
                userMsg = "Service unavailable (503). The AI is momentarily overloaded.";
            }

            onError(userMsg);
            stopSession();
          }
        },
        config: {
            responseModalities: [Modality.AUDIO],
            tools: [{ functionDeclarations: [switchModeTool] }],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
            },
            systemInstruction: "You are TradePod. A helpful, rugged voice assistant for New Zealand tradespeople. Speak concisely. Use NZ industry standards (AS/NZS) and slang. If the user asks to switch to another mode (Chat, Visualizer/Image Gen, Live), call the switchMode function with the appropriate mode ('CHAT', 'IMAGE_GEN', 'LIVE')."
        }
      });

    } catch (e: any) {
      console.error(e);
      let userMsg = "Failed to start session.";
      const errorStr = e?.message || e?.toString() || "";

      if (errorStr.includes("NotAllowedError") || errorStr.includes("Permission denied")) {
        userMsg = "Microphone access denied. Please allow microphone permissions in your browser.";
      } else if (errorStr.includes("NotFoundError")) {
        userMsg = "No microphone found. Please connect an audio input device.";
      } else if (errorStr.includes("403") || errorStr.includes("permission")) {
        userMsg = "Access denied (403). Please reconnect your API key.";
      }
      
      onError(userMsg);
      stopSession();
    }
  };

  // Toggle Function exposed to Parent
  const toggleSession = useCallback(() => {
    if (isConnected) {
        stopSession();
    } else {
        startSession();
    }
  }, [isConnected, startSession, stopSession]); // deps logic: if isConnected changes, toggleSession re-defs, parent reg updates.

  // Register the action
  useEffect(() => {
    if (registerAction) {
        registerAction(toggleSession);
    }
    return () => {
        if (registerAction) registerAction(() => {});
    }
  }, [registerAction, toggleSession]);


  // Helper inside component to avoid import circular deps or duplication if not in utils
  function base64ToUint8Array(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
        stopSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center justify-center space-y-6 w-full max-w-md mx-auto p-4 z-20">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-white tracking-wide">Live Audio Mode</h2>
        <p className="text-slate-400 text-sm">Hands-free NZ trade assistance</p>
      </div>

      <div className="flex items-center space-x-6">
        {!isConnected ? (
           <button 
             onClick={startSession}
             className="w-16 h-16 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-600 hover:brightness-110 text-white flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all hover:scale-105"
           >
             <i className="fa-solid fa-phone text-2xl"></i>
           </button>
        ) : (
            <>
                <button 
                    onClick={() => setIsMuted(!isMuted)}
                    className={`w-12 h-12 rounded-full ${isMuted ? 'bg-red-500' : 'bg-slate-700'} text-white flex items-center justify-center transition-all`}
                >
                    <i className={`fa-solid ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                </button>

                <button 
                    onClick={stopSession}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all hover:scale-105"
                >
                    <i className="fa-solid fa-phone-slash text-2xl"></i>
                </button>
            </>
        )}
      </div>
    </div>
  );
};

export default LiveInterface;