import React, { useState, useRef, useEffect, useCallback } from 'react';
import { generateImage } from '../services/geminiService';
import { ImageSize, AppMode } from '../types';

interface ImageGenInterfaceProps {
    onStateChange: (state: 'idle' | 'thinking' | 'listening' | 'speaking' | 'connected' | 'error') => void;
    onSwitchMode: (mode: AppMode) => void;
    onError: (error: any) => void;
    registerAction?: (action: () => void) => void;
}

const ImageGenInterface: React.FC<ImageGenInterfaceProps> = ({ onStateChange, onSwitchMode, onError, registerAction }) => {
    const [prompt, setPrompt] = useState('');
    const [size, setSize] = useState<ImageSize>('1K');
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [imageLoaded, setImageLoaded] = useState(false);
    
    // Voice
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);

    // Progress Simulation
    useEffect(() => {
        let interval: any;
        if (isLoading) {
            setProgress(5);
            // Simulate progress up to 90%
            interval = setInterval(() => {
                setProgress((prev) => {
                    const increment = Math.random() * 10;
                    const next = prev + increment;
                    return next > 90 ? 90 : next;
                });
            }, 600);
        } else {
            setProgress(100);
        }
        return () => clearInterval(interval);
    }, [isLoading]);

    const getStatusText = () => {
        if (progress < 30) return "Generating concept...";
        if (progress < 60) return "Analyzing geometry...";
        if (progress < 85) return "Rendering details...";
        return "Finalizing pixel data...";
    };

    const handleGenerate = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!prompt) return;

        setIsLoading(true);
        setImageLoaded(false); // Reset refinement state
        onStateChange('thinking');
        setResultUrl(null);

        try {
            const url = await generateImage(prompt, size);
            setResultUrl(url);
        } catch (error) {
            console.error(error);
            // Propagate error to App for global handling (specifically auth/permissions)
            onError(error);
        } finally {
            setIsLoading(false);
            onStateChange('idle');
        }
    };

    const handleVoiceInput = useCallback(() => {
        if (isListening && recognitionRef.current) {
            recognitionRef.current.stop();
            return;
        }
        
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-NZ';

        recognition.onstart = () => {
            setIsListening(true);
            onStateChange('listening');
        };

        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            const lower = transcript.toLowerCase();

            // Check for mode switching commands
            if (lower.includes('switch to chat') || lower.includes('open chat') || lower.includes('chat mode')) {
                onSwitchMode(AppMode.CHAT);
                return;
            }
            if (lower.includes('switch to live') || lower.includes('open live') || lower.includes('live mode')) {
                onSwitchMode(AppMode.LIVE);
                return;
            }

            // Otherwise assume prompt
            setPrompt(transcript);
        };

        recognition.onerror = () => {
            setIsListening(false);
            onStateChange('idle');
        };

        recognition.onend = () => {
            setIsListening(false);
            onStateChange('idle');
        };

        recognitionRef.current = recognition;
        recognition.start();

    }, [isListening, onStateChange, onSwitchMode]);

    // Register Orb click as voice trigger
    useEffect(() => {
        if (registerAction) {
            registerAction(handleVoiceInput);
        }
        return () => {
            if (registerAction) registerAction(() => {});
        }
    }, [registerAction, handleVoiceInput]);

    return (
        <div className="flex flex-col items-center w-full max-w-md mx-auto space-y-6 z-20 p-4">
            <h2 className="text-xl font-bold text-white tracking-wide">Job Site Visualizer</h2>
            
            <form onSubmit={handleGenerate} className="w-full space-y-4 bg-slate-800/50 p-6 rounded-2xl border border-slate-700 backdrop-blur-sm">
                <div>
                    <label className="block text-slate-400 text-xs uppercase font-bold mb-2 flex justify-between">
                        <span>Prompt</span>
                        {isListening && <span className="text-red-400 animate-pulse">Listening...</span>}
                    </label>
                    <textarea 
                        className="w-full bg-slate-900 text-white rounded-lg p-3 border border-slate-600 focus:ring-2 focus:ring-pod-accent focus:outline-none h-24 resize-none"
                        placeholder="e.g. A modern kitchen island with pendant lighting, photorealistic (or Tap Orb to speak)"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                    />
                </div>

                <div>
                    <label className="block text-slate-400 text-xs uppercase font-bold mb-2">Resolution</label>
                    <div className="flex space-x-2">
                        {(['1K', '2K', '4K'] as ImageSize[]).map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setSize(s)}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${size === s ? 'bg-pod-accent text-slate-900 border-pod-accent' : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'}`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                <button 
                    type="submit" 
                    disabled={isLoading}
                    className="w-full py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
                >
                    {isLoading ? 'Processing...' : 'Visualize'}
                </button>
            </form>

            {/* Result Display */}
            <div className="w-full min-h-[300px] bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden relative group">
                {isLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center space-y-5 bg-slate-900/90 z-10 backdrop-blur-sm">
                        {/* Animated Icon */}
                        <div className="relative">
                            <div className="absolute inset-0 bg-pod-accent/20 blur-xl rounded-full animate-pulse"></div>
                            <i className="fa-solid fa-wand-magic-sparkles text-4xl text-pod-accent animate-bounce relative z-10"></i>
                        </div>
                        
                        {/* Status Text */}
                        <div className="text-center space-y-1">
                             <p className="text-white font-semibold tracking-wide transition-all duration-300 min-w-[150px]">{getStatusText()}</p>
                             <div className="flex items-center justify-center space-x-1">
                                <span className="text-slate-400 text-xs">Processing pixels</span>
                                <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce delay-0"></span>
                                <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce delay-150"></span>
                                <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce delay-300"></span>
                             </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden relative shadow-inner">
                             <div 
                                className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_10px_rgba(6,182,212,0.6)] transition-all duration-300 ease-linear"
                                style={{ width: `${progress}%` }}
                             />
                        </div>
                    </div>
                )}
                
                {resultUrl ? (
                    <>
                        {/* Image with progressive refinement animation */}
                        <img 
                            src={resultUrl} 
                            alt="Generated result" 
                            onLoad={() => {
                                // Short delay to ensure the blur transition is noticeable and smooth
                                setTimeout(() => setImageLoaded(true), 50);
                            }}
                            className={`w-full h-full object-contain transition-all duration-[2000ms] ease-out will-change-[filter,transform,opacity]
                                ${imageLoaded ? 'blur-0 scale-100 opacity-100 grayscale-0' : 'blur-xl scale-110 opacity-80 grayscale'}`} 
                        />
                        
                        {/* Download Button (Only visible after load) */}
                        <div className={`absolute top-2 right-2 transition-all duration-500 ${imageLoaded ? 'opacity-0 group-hover:opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
                             <a href={resultUrl} download="tradepod-visual.png" className="bg-slate-800/80 p-2 rounded-lg text-white hover:bg-slate-700 backdrop-blur-md border border-slate-600 shadow-lg">
                                <i className="fa-solid fa-download"></i>
                             </a>
                        </div>
                    </>
                ) : (
                    !isLoading && (
                        <div className="flex flex-col items-center text-slate-600 space-y-2">
                             <i className="fa-regular fa-image text-3xl opacity-50"></i>
                             <p className="text-sm">Generated image will appear here</p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

export default ImageGenInterface;