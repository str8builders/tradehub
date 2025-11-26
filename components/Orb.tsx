import React from 'react';

interface OrbProps {
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'connected' | 'error';
  onClick?: () => void;
}

const Orb: React.FC<OrbProps> = ({ state, onClick }) => {
  // Dynamic classes based on state
  const getOrbStyle = () => {
    switch (state) {
      case 'listening':
        return 'scale-110 shadow-[0_0_60px_20px_rgba(56,189,248,0.6)] animate-pulse-slow bg-gradient-to-tr from-cyan-500 to-blue-600';
      case 'thinking':
        return 'scale-95 animate-spin-slow shadow-[0_0_80px_30px_rgba(168,85,247,0.5)] bg-gradient-to-br from-purple-500 via-pink-500 to-red-500';
      case 'speaking':
        return 'scale-110 animate-speaking shadow-[0_0_60px_20px_rgba(56,189,248,0.8)] bg-gradient-to-r from-sky-400 to-indigo-500';
      case 'connected':
        return 'scale-100 animate-breathing shadow-[0_0_60px_15px_rgba(45,212,191,0.4)] bg-gradient-to-b from-teal-700 to-slate-900 border border-teal-400/60';
      case 'error':
        return 'scale-100 animate-shake shadow-[0_0_50px_20px_rgba(239,68,68,0.6)] bg-gradient-to-br from-red-600 to-red-900 border border-red-500';
      case 'idle':
      default:
        return 'animate-float shadow-[0_0_30px_5px_rgba(56,189,248,0.3)] bg-gradient-to-b from-slate-700 to-slate-900 border border-slate-600';
    }
  };

  const getInnerCoreStyle = () => {
     switch(state) {
        case 'thinking': return 'opacity-80 animate-pulse';
        case 'speaking': return 'opacity-100 scale-90 duration-300 animate-pulse';
        case 'connected': return 'opacity-70 scale-90 duration-1000 animate-pulse bg-teal-100';
        case 'error': return 'opacity-100 scale-90 bg-red-200 duration-75';
        default: return 'opacity-40';
     }
  }

  return (
    <div className="relative flex justify-center items-center h-64 w-64 md:h-80 md:w-80 transition-all duration-700 ease-in-out">
        {/* Outer Glow Ring */}
        <div className={`absolute inset-0 rounded-full blur-2xl opacity-50 transition-colors duration-500 
            ${state === 'thinking' ? 'bg-purple-600' : state === 'connected' ? 'bg-teal-500' : state === 'error' ? 'bg-red-600' : 'bg-sky-600'}`}>
        </div>

        {/* The Orb */}
        <div 
            onClick={onClick}
            className={`relative h-48 w-48 md:h-56 md:w-56 rounded-full transition-all duration-700 ${getOrbStyle()} flex items-center justify-center overflow-hidden cursor-pointer active:scale-95 z-10`}
            title={state === 'error' ? 'Error - Tap to retry' : 'Tap to talk'}
        >
            
            {/* Inner Glare/Detail */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.4),transparent_50%)] pointer-events-none"></div>
            
            {/* Core Pulse */}
            <div className={`h-24 w-24 bg-white rounded-full blur-xl mix-blend-overlay transition-all duration-300 pointer-events-none ${getInnerCoreStyle()}`}></div>
            
            {/* Icon Overlay (Subtle hint) */}
            {state === 'connected' && (
                 <div className="absolute opacity-30 text-teal-100 text-4xl animate-pulse">
                    <i className="fa-solid fa-wifi"></i>
                </div>
            )}
            {state === 'error' && (
                 <div className="absolute opacity-80 text-white text-5xl animate-bounce">
                    <i className="fa-solid fa-exclamation"></i>
                </div>
            )}
        </div>

        {/* State Label (Optional/Stylistic) */}
        <div className={`absolute -bottom-10 text-xs font-mono tracking-widest uppercase transition-colors duration-300 ${state === 'error' ? 'text-red-400 font-bold' : 'text-slate-400'}`}>
            {state === 'idle' ? 'Tap Orb to Speak' : state === 'error' ? 'System Error' : state}
        </div>
    </div>
  );
};

export default Orb;