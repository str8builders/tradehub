export enum AppMode {
  CHAT = 'CHAT',
  LIVE = 'LIVE',
  IMAGE_GEN = 'IMAGE_GEN',
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string; // Generic URL for the file (blob or base64 data uri)
  fileType?: string; // e.g. 'image/png', 'application/pdf'
  fileName?: string; // e.g. 'plans.pdf'
  groundingMetadata?: GroundingMetadata;
  isLoading?: boolean;
}

export interface GroundingMetadata {
  groundingChunks?: {
    web?: { uri: string; title: string };
    maps?: { uri: string; title: string; placeAnswerSources?: any };
  }[];
}

export type ImageSize = '1K' | '2K' | '4K';

export interface ChatConfig {
  useSearch: boolean;
  useMaps: boolean;
  userLocation?: { latitude: number; longitude: number };
}