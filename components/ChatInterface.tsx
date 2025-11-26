import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Message, ChatConfig, GroundingMetadata, AppMode } from '../types';
import { generateChatResponseStream, generateSpeech } from '../services/geminiService';
import { decodeAudioData, base64ToUint8Array } from '../services/audioUtils';

interface ChatInterfaceProps {
  onStateChange: (state: 'idle' | 'listening' | 'speaking' | 'thinking' | 'connected' | 'error') => void;
  onError: (msg: string) => void;
  registerAction?: (action: () => void) => void;
  onSwitchMode: (mode: AppMode) => void;
}

// Sub-component for displaying dimensions
const DimensionsCard: React.FC<{ data: any }> = memo(({ data }) => {
    if (!data) return null;

    return (
        <div className="mt-4 bg-slate-900/60 rounded-xl border border-pod-accent/30 overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="bg-pod-accent/10 px-4 py-2 border-b border-pod-accent/20 flex items-center justify-between">
                <span className="text-xs font-bold text-pod-accent uppercase tracking-wider">
                    <i className="fa-solid fa-ruler-combined mr-2"></i>Key Dimensions
                </span>
                {data.total_footprint && (
                    <span className="text-xs text-white font-mono bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        {data.total_footprint}
                    </span>
                )}
            </div>
            
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Ceiling Height */}
                {data.ceiling_height && (
                    <div className="flex items-center space-x-3 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                            <i className="fa-solid fa-arrows-up-down text-sm"></i>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Ceiling Height</p>
                            <p className="text-sm font-semibold text-white">{data.ceiling_height}</p>
                        </div>
                    </div>
                )}

                {/* Rooms Grid */}
                {data.key_rooms && Array.isArray(data.key_rooms) && (
                    <div className="col-span-1 md:col-span-2 space-y-2">
                        <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Room Sizes</p>
                        <div className="grid grid-cols-2 gap-2">
                            {data.key_rooms.map((room: any, idx: number) => (
                                <div key={idx} className="bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700/50 flex justify-between items-center">
                                    <span className="text-xs text-slate-300 font-medium truncate pr-2">{room.name}</span>
                                    <span className="text-xs text-pod-accent font-mono whitespace-nowrap">{room.dimensions}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

// Render Grounding Sources
const GroundingSources: React.FC<{ metadata: GroundingMetadata }> = memo(({ metadata }) => {
     if (!metadata?.groundingChunks) return null;
     
     const sources = metadata.groundingChunks.map((chunk, idx) => {
        if (chunk.web) {
            return (
                <a key={idx} href={chunk.web.uri} target="_blank" rel="noopener noreferrer" 
                   className="inline-flex items-center px-2 py-1 mr-2 mt-2 bg-slate-700 hover:bg-slate-600 rounded text-xs text-pod-accent border border-slate-600 transition-colors">
                   <i className="fa-brands fa-google mr-1"></i> {chunk.web.title}
                </a>
            );
        }
        if (chunk.maps) {
            return (
                 <a key={idx} href={chunk.maps.uri} target="_blank" rel="noopener noreferrer" 
                   className="inline-flex items-center px-2 py-1 mr-2 mt-2 bg-slate-700 hover:bg-slate-600 rounded text-xs text-green-400 border border-slate-600 transition-colors">
                   <i className="fa-solid fa-map-location-dot mr-1"></i> {chunk.maps.title}
                </a>
            );
        }
        return null;
     });

     if (sources.length === 0) return null;

     return (
        <div className="mt-2 pt-2 border-t border-slate-700/50">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Sources</p>
            <div className="flex flex-wrap">{sources}</div>
        </div>
     );
});

// Helper to parse JSON from message content
const parseMessageContent = (text: string) => {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    let displayContent = text;
    let dimensionsData = null;

    if (jsonMatch) {
        try {
            dimensionsData = JSON.parse(jsonMatch[1]);
            displayContent = text.replace(jsonMatch[0], '').trim();
        } catch (e) {
            console.warn("Found JSON block but failed to parse", e);
        }
    }
    return { displayContent, dimensionsData };
};

// Memoized Message Bubble to prevent unnecessary re-renders during streaming
const MessageBubble: React.FC<{ 
    msg: Message, 
    playingMessageId: string | null, 
    isAudioLoading: boolean, 
    onPlayAudio: (text: string, id: string) => void 
}> = memo(({ msg, playingMessageId, isAudioLoading, onPlayAudio }) => {
    
    const { displayContent, dimensionsData } = (msg.role === 'model') 
        ? parseMessageContent(msg.text) 
        : { displayContent: msg.text, dimensionsData: null };

    return (
        <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 ${msg.role === 'user' ? 'bg-pod-accent text-slate-900 rounded-br-none' : 'bg-slate-800/80 backdrop-blur-md text-slate-100 rounded-bl-none border border-slate-700'}`}>
                {msg.image && (
                    msg.fileType === 'application/pdf' ? (
                        <div className="flex items-center space-x-3 bg-slate-900/50 p-3 rounded-lg border border-slate-700 mb-2 border-black/10">
                            <div className="w-10 h-10 flex items-center justify-center bg-red-900/50 rounded-lg text-red-400">
                                <i className="fa-solid fa-file-pdf text-xl"></i>
                            </div>
                            <div className="flex flex-col overflow-hidden">
                                <span className="text-sm font-bold opacity-90 truncate max-w-[150px]">{msg.fileName || 'Plan.pdf'}</span>
                                <span className="text-xs opacity-60">PDF Document</span>
                            </div>
                        </div>
                    ) : (
                        <img src={msg.image} alt="User upload" className="w-48 h-48 object-cover rounded-lg mb-2 border border-black/10" />
                    )
                )}
                <p className="whitespace-pre-wrap text-sm md:text-base leading-relaxed">{displayContent}</p>
                
                {/* Render extracted dimensions card if available */}
                {dimensionsData && <DimensionsCard data={dimensionsData} />}

                {/* Audio Play Button for Model Messages */}
                {msg.role === 'model' && msg.text && (
                    <div className="mt-2 flex items-center justify-end">
                        <button 
                            onClick={() => onPlayAudio(displayContent, msg.id)}
                            className={`transition-colors p-1.5 rounded-full ${playingMessageId === msg.id ? 'text-pod-accent bg-slate-700' : 'text-slate-500 hover:text-pod-accent'}`}
                            title={playingMessageId === msg.id ? "Stop Reading" : "Read Aloud"}
                        >
                            {playingMessageId === msg.id && isAudioLoading ? (
                                <div className="w-3 h-3 border-2 border-pod-accent border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <i className={`fa-solid ${playingMessageId === msg.id ? 'fa-stop' : 'fa-volume-high'} text-xs`}></i>
                            )}
                        </button>
                    </div>
                )}

                {msg.groundingMetadata && <GroundingSources metadata={msg.groundingMetadata} />}
            </div>
        </div>
    );
});


const ChatInterface: React.FC<ChatInterfaceProps> = ({ onStateChange, onError, registerAction, onSwitchMode }) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'model', text: 'Kia ora. Ready for the job site. Upload plans (PDF) or ask about NZ codes.' }
  ]);
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Scroll Ref
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);
  const prevMessagesLengthRef = useRef(messages.length);

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Voice Input State
  const [isMicActive, setIsMicActive] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Audio Playback State
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Tools Configuration
  const [config, setConfig] = useState<ChatConfig>({
    useSearch: false,
    useMaps: false,
  });

  // Scroll Handler
  const handleScroll = useCallback(() => {
      if (!chatContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      // Determine if we are near the bottom (within 50px)
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      isUserAtBottomRef.current = isAtBottom;
  }, []);

  // Auto scroll effect
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const isNewMessage = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    // Force scroll only on new messages or initial loading state
    if (isNewMessage || isLoading) {
        isUserAtBottomRef.current = true;
        // Use requestAnimationFrame for smoother timing with rendering
        requestAnimationFrame(() => {
             container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        });
    } 
    // For streaming updates (re-renders without length change), scroll only if user was already at bottom
    else if (isUserAtBottomRef.current) {
         requestAnimationFrame(() => {
             // Instant scroll to prevent stutter
             container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
         });
    }
  }, [messages, isLoading]);

  // Handle Geolocation for Maps
  useEffect(() => {
    if (config.useMaps && !config.userLocation) {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setConfig(prev => ({
                        ...prev,
                        userLocation: {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude
                        }
                    }));
                },
                (err) => console.warn("Geolocation failed", err)
            );
        }
    }
  }, [config.useMaps, config.userLocation]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const playTextAsAudio = useCallback(async (text: string, messageId: string) => {
    // If clicking the currently playing message, stop it.
    if (playingMessageId === messageId && !isAudioLoading) {
        stopAudio(); // Reset to idle
        return;
    }

    stopAudio(false);

    try {
        setPlayingMessageId(messageId);
        setIsAudioLoading(true);
        onStateChange('thinking');
        
        const base64Audio = await generateSpeech(text);
        if (!base64Audio) throw new Error("No audio generated");

        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }

        const audioBuffer = await decodeAudioData(
            base64ToUint8Array(base64Audio),
            audioContextRef.current,
            24000
        );

        setIsAudioLoading(false);
        onStateChange('speaking');

        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => {
            setPlayingMessageId(null);
            onStateChange('idle');
            currentSourceRef.current = null;
        };
        source.start();
        currentSourceRef.current = source;

    } catch (e) {
        console.error("Audio playback error", e);
        setPlayingMessageId(null);
        setIsAudioLoading(false);
        onStateChange('idle');
        onError("Could not play audio.");
    }
  }, [playingMessageId, isAudioLoading, onStateChange, onError]);

  const stopAudio = (resetState = true) => {
      if (currentSourceRef.current) {
          try {
             currentSourceRef.current.stop();
          } catch(e) {}
          currentSourceRef.current = null;
      }
      setPlayingMessageId(null);
      setIsAudioLoading(false);
      if (resetState) {
          onStateChange('idle');
      }
  };

  const checkVoiceCommands = (text: string): boolean => {
      const lower = text.toLowerCase();
      if (lower.includes('switch to live') || lower.includes('open live') || lower.includes('enable live mode')) {
          onSwitchMode(AppMode.LIVE);
          return true;
      }
      if (lower.includes('switch to visualizer') || lower.includes('open visualizer') || lower.includes('create image')) {
          onSwitchMode(AppMode.IMAGE_GEN);
          return true;
      }
      
      // Upload commands
      if (lower.includes('upload plan') || 
          lower.includes('attach plan') || 
          lower.includes('upload file') || 
          lower.includes('add pdf') || 
          lower.includes('upload pdf') || 
          lower.includes('scan plan') || 
          lower.includes('import plan')) {
          
          if (fileInputRef.current) {
              fileInputRef.current.click();
              return true;
          }
      }

      return false;
  };

  const handleMicClick = useCallback(() => {
    if (recognitionRef.current && isMicActive) {
      recognitionRef.current.stop();
      return;
    }

    if (isLoading) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onError("Voice dictation is not supported on this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-NZ';

    recognition.onstart = () => {
      setIsMicActive(true);
      onStateChange('listening');
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (checkVoiceCommands(transcript)) return;
      setInput(prev => (prev ? prev + ' ' : '') + transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsMicActive(false);
      onStateChange('idle');
    };

    recognition.onend = () => {
      setIsMicActive(false);
      onStateChange('idle');
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isMicActive, isLoading, onStateChange, onError, onSwitchMode]);

  useEffect(() => {
    if (registerAction) {
        registerAction(handleMicClick);
    }
    return () => {
        if (registerAction) registerAction(() => {});
    };
  }, [registerAction, handleMicClick]);

  const sendMessage = async (textToSend: string) => {
    if ((!textToSend.trim() && !selectedFile) || isLoading) return;
    
    stopAudio();

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      image: previewUrl || undefined,
      fileType: selectedFile?.type,
      fileName: selectedFile?.name
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    onStateChange('thinking');

    try {
      let filePart;
      let promptToSend = userMsg.text;

      if (selectedFile) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
            reader.onload = (e) => {
                const result = e.target?.result as string;
                const base64 = result.split(',')[1];
                resolve(base64);
            };
        });
        reader.readAsDataURL(selectedFile);
        const base64Data = await base64Promise;
        filePart = {
            inlineData: {
                data: base64Data,
                mimeType: selectedFile.type
            }
        };

        if (selectedFile.name) {
            promptToSend = `[Attached File: ${selectedFile.name}] ${promptToSend}`;
            if (selectedFile.type === 'application/pdf') {
                promptToSend += "\n\n[System Note: Use Visual OCR to read text and dimensions from the document images. Do not rely only on embedded text streams. Analyze the pixels directly.]";
            }
        }
      }

      const stream = await generateChatResponseStream(promptToSend, filePart, config);
      
      const modelMsgId = (Date.now() + 1).toString();
      const initialModelMsg: Message = {
        id: modelMsgId,
        role: 'model',
        text: '',
      };
      setMessages(prev => [...prev, initialModelMsg]);

      setIsLoading(false);

      let fullText = '';
      let finalMetadata: GroundingMetadata | undefined;

      for await (const chunk of stream) {
         const chunkText = chunk.text;
         if (chunkText) {
             fullText += chunkText;
             // Functional update to avoid dependency issues during stream
             setMessages(prev => {
                const newMessages = [...prev];
                const targetMsg = newMessages.find(m => m.id === modelMsgId);
                if (targetMsg) {
                    targetMsg.text = fullText;
                }
                return newMessages;
             });
         }
         
         if (chunk.candidates?.[0]?.groundingMetadata) {
             finalMetadata = chunk.candidates[0].groundingMetadata;
         }
      }

      setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, groundingMetadata: finalMetadata } : m));
      
      if (autoSpeak) {
        playTextAsAudio(fullText, modelMsgId);
      } else {
         onStateChange('idle');
      }

      clearFile();

    } catch (err: any) {
      console.error(err);
      onError(err.message || "Failed to get response");
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Sorry, I ran into a snag. Try again?" }]);
      setIsLoading(false);
      onStateChange('idle');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSummarize = () => {
      const prompt = `Perform a deep technical analysis of this PDF plan using Visual OCR.

CRITICAL OCR INSTRUCTIONS:
1.  **Scan Mode**: Treat every page as a high-resolution image. Do not rely solely on embedded text layers.
2.  **Text Extraction**: Identify and transcribe all room labels, dimension numbers, and material notes, even if handwritten or low contrast.
3.  **Pattern Recognition**: Identify standard architectural symbols (electrical, plumbing fixtures) and correlate them with the legend.

Based on this extraction, provide the structured summary:

### 1. Project Dimensions & Layout
*   **Total Footprint**: Calculate approx sq meters.
*   **Key Room Dimensions**: List main areas (Living, Kitchen, Master Bed) with exact dimensions found via OCR.
*   **Ceiling Heights**: Extract stud heights or ceiling levels.

### 2. Materials Specification
*   **Cladding**: Exterior materials.
*   **Roofing**: Material and pitch.
*   **Internal**: Flooring or lining notes.

### 3. Structural & Framing
*   **Foundation**: Concrete slab/Ribraft or piles?
*   **Framing**: Timber grades (e.g., SG8) or steel elements.
*   **Load Bearing**: Identify clear load-bearing lines.

### 4. Services (Electrical & Plumbing)
*   **Hot Water**: Cylinder location/type or gas califont.
*   **Electrical**: Switchboard location, notable high-draw items (induction, EV charger).

### 5. NZ Compliance & Standards
*   **NZBC**: Note any specific clauses mentioned (e.g., H1 Energy Efficiency, E2 External Moisture).
*   **Standards**: List referenced standards (AS/NZS 3000, 3500, 3604).
*   **Warnings**: Flag any missing details required for consent or construction.

FINALLY, strictly output the extracted dimensions in this JSON format wrapped in triple backticks at the very end of your response:
\`\`\`json
{
  "total_footprint": "approx sq m",
  "key_rooms": [
      { "name": "Living", "dimensions": "5.4m x 4.2m" },
      { "name": "Kitchen", "dimensions": "3.0m x 2.8m" }
  ],
  "ceiling_height": "2.4m"
}
\`\`\`
`;
      sendMessage(prompt);
  };

  return (
    <div className="flex flex-col h-full w-full max-w-2xl mx-auto z-20 relative">
        {/* Chat Area - Added pb-32 for extra bottom spacing and overscroll-behavior */}
        <div 
            className="flex-1 overflow-y-scroll p-4 space-y-4 mb-4 min-h-0 overscroll-contain pb-32 touch-pan-y"
            ref={chatContainerRef}
            onScroll={handleScroll}
            style={{ scrollBehavior: 'smooth' }}
        >
            {messages.map((msg) => (
                <MessageBubble 
                    key={msg.id} 
                    msg={msg} 
                    playingMessageId={playingMessageId} 
                    isAudioLoading={isAudioLoading} 
                    onPlayAudio={playTextAsAudio} 
                />
            ))}
            
            {isLoading && (
                 <div className="flex justify-start">
                    <div className="bg-slate-800/50 rounded-2xl rounded-bl-none p-4 flex items-center space-x-2">
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-150"></div>
                        <span className="text-xs text-slate-500 ml-2 animate-pulse">Analysing...</span>
                    </div>
                 </div>
            )}
        </div>

        {/* Controls */}
        <div className="bg-slate-900/90 border-t border-slate-800 p-3 pb-6 md:pb-3 rounded-t-3xl backdrop-blur-lg">
            
            {/* Tool Toggles and PDF Actions */}
            <div className="flex justify-between items-center mb-3 px-2">
                <div className="flex space-x-3 items-center">
                    <label className={`flex items-center space-x-1.5 text-xs cursor-pointer ${config.useSearch ? 'text-pod-accent' : 'text-slate-500'}`}>
                        <input type="checkbox" checked={config.useSearch} onChange={e => setConfig(c => ({...c, useSearch: e.target.checked, useMaps: false}))} className="hidden" />
                        <i className="fa-brands fa-google"></i>
                        <span>Search</span>
                    </label>
                    <label className={`flex items-center space-x-1.5 text-xs cursor-pointer ${config.useMaps ? 'text-green-400' : 'text-slate-500'}`}>
                        <input type="checkbox" checked={config.useMaps} onChange={e => setConfig(c => ({...c, useMaps: e.target.checked, useSearch: false}))} className="hidden" />
                        <i className="fa-solid fa-map"></i>
                        <span>Maps</span>
                    </label>
                    
                    {/* Divider */}
                    <div className="h-4 w-[1px] bg-slate-700 mx-1"></div>

                    {/* Auto Speak Toggle */}
                    <button 
                        onClick={() => setAutoSpeak(!autoSpeak)}
                        className={`flex items-center space-x-1.5 text-xs transition-colors ${autoSpeak ? 'text-pod-accent' : 'text-slate-500'}`}
                        title="Auto-read answers"
                    >
                        <i className={`fa-solid ${autoSpeak ? 'fa-volume-high' : 'fa-volume-xmark'}`}></i>
                        <span>{autoSpeak ? 'Read On' : 'Read Off'}</span>
                    </button>
                </div>

                {/* Summarize Button for PDFs */}
                {selectedFile?.type === 'application/pdf' && (
                    <button
                        type="button"
                        onClick={handleSummarize}
                        disabled={isLoading}
                        className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-pod-accent text-[10px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-lg border border-slate-700 transition-all hover:scale-105 shadow-lg border-pod-accent/20"
                    >
                        <i className="fa-solid fa-wand-magic-sparkles text-xs"></i>
                        <span>Summarize Plan (OCR)</span>
                    </button>
                )}
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
                {/* File Input */}
                <div className="relative">
                    <input type="file" id="file-upload" ref={fileInputRef} className="hidden" accept="image/*,application/pdf" onChange={handleFileChange} />
                    <label htmlFor="file-upload" className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 cursor-pointer transition-colors border border-slate-700" title="Upload Image or PDF Plans">
                        <i className="fa-solid fa-paperclip"></i>
                    </label>
                    
                    {/* File Preview in Input - Enhanced Card */}
                    {previewUrl && (
                        <div className="absolute bottom-full mb-4 left-0 min-w-[240px] max-w-sm bg-slate-800 border border-slate-600 rounded-xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-2 duration-300 z-50">
                            <div className="flex items-start p-3 gap-3">
                                {/* Icon/Thumbnail */}
                                {selectedFile?.type === 'application/pdf' ? (
                                    <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-red-500/10 rounded-lg text-red-400 border border-red-500/20">
                                        <i className="fa-solid fa-file-pdf text-xl"></i>
                                    </div>
                                ) : (
                                    <img src={previewUrl} alt="preview" className="w-10 h-10 object-cover rounded-lg border border-slate-600" />
                                )}
                                
                                {/* Info */}
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-xs font-bold text-white truncate w-full">
                                        {selectedFile?.name}
                                    </span>
                                    <span className={`text-[10px] font-medium mt-0.5 flex items-center gap-1.5 ${isLoading ? 'text-pod-accent' : 'text-green-400'}`}>
                                        {isLoading ? (
                                            <>
                                                <span className="w-1.5 h-1.5 rounded-full bg-pod-accent animate-pulse"></span>
                                                Analyzing Plan...
                                            </>
                                        ) : (
                                            <>
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                                                File Ready
                                            </>
                                        )}
                                    </span>
                                </div>

                                {/* Close Button */}
                                <button type="button" onClick={clearFile} className="w-6 h-6 flex-shrink-0 bg-slate-700 hover:bg-red-500/80 text-slate-400 hover:text-white rounded-full flex items-center justify-center transition-all">
                                    <i className="fa-solid fa-xmark text-xs"></i>
                                </button>
                            </div>
                            
                            {/* Contextual Hint for PDFs */}
                            {selectedFile?.type === 'application/pdf' && !isLoading && (
                                <div className="bg-slate-900/50 px-3 py-2 border-t border-slate-700/50 flex items-center gap-2">
                                     <i className="fa-solid fa-wand-magic-sparkles text-pod-accent text-xs"></i>
                                     <span className="text-[10px] text-slate-400">
                                        Pro Tip: Use "Summarize Plan" for a breakdown.
                                     </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Mic Input */}
                <button 
                    type="button" 
                    onClick={handleMicClick}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border ${isMicActive ? 'bg-red-500/20 text-red-500 border-red-500 animate-pulse' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'}`}
                >
                    <i className={`fa-solid ${isMicActive ? 'fa-stop' : 'fa-microphone'}`}></i>
                </button>

                {/* Text Input */}
                <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={isMicActive ? "Listening..." : "Ask about plans, wiring, plumbing..."}
                    className={`flex-1 bg-slate-800 border-none text-white placeholder-slate-500 rounded-2xl py-3 px-4 focus:ring-2 focus:ring-pod-accent focus:outline-none ${isMicActive ? 'ring-1 ring-red-500/50' : ''}`}
                />

                {/* Submit */}
                <button type="submit" disabled={isLoading || isMicActive} className="w-12 h-10 rounded-2xl bg-pod-accent text-slate-900 hover:bg-sky-400 disabled:opacity-50 font-bold transition-colors">
                    <i className="fa-solid fa-paper-plane"></i>
                </button>
            </form>
        </div>
    </div>
  );
};

export default ChatInterface;