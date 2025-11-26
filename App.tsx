import React, { useState, useRef, useEffect } from 'react';
import { AppMode } from './types';
import Orb from './components/Orb';
import ChatInterface from './components/ChatInterface';
import LiveInterface from './components/LiveInterface';
import ImageGenInterface from './components/ImageGenInterface';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.CHAT);
  const [orbState, setOrbState] = useState<'idle' | 'listening' | 'speaking' | 'thinking' | 'connected' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // API Key State
  const [apiKeyVerified, setApiKeyVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);

  // Ref to hold the trigger action from the active child component
  const actionRef = useRef<() => void>(() => {});

  // Initial Key Check
  useEffect(() => {
    const verifyKey = async () => {
      try {
        const aistudio = (window as any).aistudio;
        if (aistudio && aistudio.hasSelectedApiKey) {
          const hasKey = await aistudio.hasSelectedApiKey();
          setApiKeyVerified(hasKey);
        } else {
          // If aistudio is not available, we assume dev mode or pre-configured env
          // However, for 403 errors, we will fallback to false if checked later
          setApiKeyVerified(false); 
        }
      } catch (e) {
        console.error("Key verification failed", e);
        setApiKeyVerified(false);
      } finally {
        setIsVerifying(false);
      }
    };
    verifyKey();
  }, []);

  const handleSelectKey = async () => {
    try {
        const aistudio = (window as any).aistudio;
        if (aistudio && aistudio.openSelectKey) {
            await aistudio.openSelectKey();
            // Assume success to mitigate race condition
            setApiKeyVerified(true);
        }
    } catch (e) {
        console.error("Failed to select key", e);
        setErrorMsg("Failed to open key selector.");
    }
  };

  const handleError = (err: any) => {
    const msg = typeof err === 'string' ? err : err.message || JSON.stringify(err);
    console.error("App Error:", msg);

    // Check for auth/billing errors to trigger re-auth
    if (
        msg.includes("Requested entity was not found") || 
        msg.includes("PERMISSION_DENIED") || 
        msg.includes("403") ||
        msg.includes("The caller does not have permission")
    ) {
        setApiKeyVerified(false);
        setErrorMsg("Connection invalid. Please reconnect your API key.");
        // We do not return here, we still show the error toast briefly while switching screens
    }

    let displayMsg = typeof err === 'string' ? err : "An error occurred.";
    if (msg.includes("500") || msg.includes("INTERNAL")) {
        displayMsg = "System overloaded. Please try again in a moment.";
    }

    setErrorMsg(displayMsg);
    setOrbState('error');
    setTimeout(() => {
        setErrorMsg(null);
        setOrbState('idle');
    }, 5000);
  };

  const handleOrbClick = () => {
    // If in error state, clicking resets it
    if (orbState === 'error') {
        setErrorMsg(null);
        setOrbState('idle');
        return;
    }

    if (actionRef.current) {
        actionRef.current();
    }
  };

  const handleModeChange = (newMode: AppMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    // Reset state/action when mode changes
    setOrbState('idle');
    actionRef.current = () => {}; 
  };

  // Loading Screen
  if (isVerifying) {
    return (
        <div className="min-h-screen bg-pod-bg flex items-center justify-center">
            <div className="flex flex-col items-center space-y-4">
                <div className="w-12 h-12 border-4 border-pod-accent border-t-transparent rounded-full animate-spin"></div>
                <p className="text-pod-accent animate-pulse font-mono text-sm">INITIALIZING PROTOCOL...</p>
            </div>
        </div>
    );
  }

  // API Key Selection Screen
  if (!apiKeyVerified) {
    return (
        <div className="min-h-screen bg-pod-bg text-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
             {/* Background Decor */}
             <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-slate-800/20 rounded-full blur-[80px]"></div>
             </div>
             
             <div className="z-10 max-w-md text-center space-y-8 animate-in fade-in zoom-in duration-500">
                <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center shadow-[0_0_40px_rgba(34,211,238,0.4)] animate-float">
                    <i className="fa-solid fa-hammer text-slate-900 text-4xl"></i>
                </div>
                
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight">Trade<span className="text-pod-accent">Pod</span> <span className="text-sm text-slate-500 ml-1">NZ</span></h1>
                    <p className="text-slate-400">Advanced AI Assistance for the Job Site</p>
                </div>

                <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 backdrop-blur-sm shadow-xl">
                    <p className="text-sm text-slate-300 mb-6 leading-relaxed">
                        To access Pro features like <span className="text-pod-accent font-semibold">Nano Banana Pro Visualizer</span> and <span className="text-pod-accent font-semibold">Live Audio</span>, you need to connect a billing-enabled Google Cloud Project.
                    </p>
                    <button 
                        onClick={handleSelectKey}
                        className="w-full py-3 rounded-lg bg-pod-accent text-slate-900 font-bold hover:bg-sky-400 transition-all shadow-[0_0_20px_rgba(56,189,248,0.3)] flex items-center justify-center active:scale-95"
                    >
                        <i className="fa-brands fa-google mr-2"></i> Connect API Key
                    </button>
                    <p className="mt-4 text-[10px] text-slate-500">
                        Select a paid project. See billing docs at <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline hover:text-slate-400">ai.google.dev/gemini-api/docs/billing</a>
                    </p>
                </div>
             </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-pod-bg text-white flex flex-col relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
         <div className="absolute -top-20 -right-20 w-96 h-96 bg-purple-900/20 rounded-full blur-3xl"></div>
         <div className="absolute bottom-0 -left-20 w-80 h-80 bg-cyan-900/20 rounded-full blur-3xl"></div>
         <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-slate-800/20 rounded-full blur-[100px]"></div>
      </div>

      {/* Header */}
      <header className="w-full p-4 flex justify-between items-center z-30 bg-slate-900/50 backdrop-blur-md sticky top-0 border-b border-slate-800">
        <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center">
                <i className="fa-solid fa-hammer text-slate-900 text-sm"></i>
            </div>
            <h1 className="text-xl font-bold tracking-tight">Trade<span className="text-pod-accent">Pod</span> <span className="text-xs text-slate-500 font-normal ml-1">NZ</span></h1>
        </div>
        <div className="text-xs text-slate-500 border border-slate-700 rounded-full px-3 py-1 bg-slate-800">
           {mode === AppMode.CHAT && "AI Assistant"}
           {mode === AppMode.LIVE && "Voice Uplink"}
           {mode === AppMode.IMAGE_GEN && "Nano Banana Pro"}
        </div>
      </header>

      {/* Error Toast */}
      {errorMsg && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-500/90 text-white px-4 py-2 rounded-lg shadow-xl z-50 text-sm font-medium animate-bounce w-max max-w-[90%] text-center">
            <i className="fa-solid fa-triangle-exclamation mr-2"></i> {errorMsg}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center relative z-10 w-full max-w-4xl mx-auto min-h-0">
         
         {/* The Orb */}
         <div className="flex-shrink-0 mt-4 mb-2">
            <Orb state={orbState} onClick={handleOrbClick} />
         </div>

         {/* Mode Interfaces */}
         {/* Changed h-full to min-h-0 to fix flexbox scrolling issues */}
         <div className="flex-1 w-full min-h-0 flex flex-col overflow-hidden">
            {mode === AppMode.CHAT && (
                <ChatInterface 
                    onStateChange={setOrbState} 
                    onError={handleError} 
                    registerAction={(fn) => actionRef.current = fn}
                    onSwitchMode={handleModeChange}
                />
            )}
            {mode === AppMode.LIVE && (
                <LiveInterface 
                    onStateChange={setOrbState} 
                    onError={handleError} 
                    registerAction={(fn) => actionRef.current = fn}
                    onSwitchMode={handleModeChange}
                />
            )}
            {mode === AppMode.IMAGE_GEN && (
                <ImageGenInterface 
                    onStateChange={setOrbState} 
                    onError={handleError}
                    onSwitchMode={handleModeChange}
                    registerAction={(fn) => actionRef.current = fn}
                />
            )}
         </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="w-full bg-slate-900 border-t border-slate-800 p-2 z-30 pb-safe">
        <div className="flex justify-around items-center max-w-md mx-auto">
            <button 
                onClick={() => handleModeChange(AppMode.CHAT)}
                className={`flex flex-col items-center p-2 rounded-xl transition-colors ${mode === AppMode.CHAT ? 'text-pod-accent' : 'text-slate-500 hover:text-slate-300'}`}
            >
                <i className="fa-solid fa-message text-xl mb-1"></i>
                <span className="text-[10px] font-medium">Chat</span>
            </button>
            
            <button 
                onClick={() => handleModeChange(AppMode.LIVE)}
                className={`flex flex-col items-center p-2 rounded-xl transition-colors ${mode === AppMode.LIVE ? 'text-pod-accent' : 'text-slate-500 hover:text-slate-300'}`}
            >
                <div className={`w-12 h-12 -mt-8 rounded-full bg-slate-800 border-4 border-slate-900 flex items-center justify-center shadow-lg ${mode === AppMode.LIVE ? 'bg-pod-accent text-slate-900 shadow-pod-accent/50' : ''}`}>
                    <i className="fa-solid fa-microphone-lines text-xl"></i>
                </div>
                <span className="text-[10px] font-medium mt-1">Live</span>
            </button>

            <button 
                onClick={() => handleModeChange(AppMode.IMAGE_GEN)}
                className={`flex flex-col items-center p-2 rounded-xl transition-colors ${mode === AppMode.IMAGE_GEN ? 'text-pod-accent' : 'text-slate-500 hover:text-slate-300'}`}
            >
                <i className="fa-solid fa-image text-xl mb-1"></i>
                <span className="text-[10px] font-medium">Visualizer</span>
            </button>
        </div>
      </nav>
    </div>
  );
};

export default App;