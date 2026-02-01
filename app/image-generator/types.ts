export interface ImageGenerationRequest {
  image: File;
  prompt: string;
  model?: string;
}

export interface ImageGenerationResponse {
  success: boolean;
  imageData?: string; // Base64
  textResponse?: string;
  latency: number;
  error?: string;
}

export interface GenerationHistory {
  id: string;
  timestamp: Date;
  originalImage: string; // Base64
  prompt: string;
  result: ImageGenerationResponse;
}

export interface PresetPrompt {
  id: string;
  title: string;
  prompt: string;
  category: string;
  examples?: string[];
}

export const presetPrompts: PresetPrompt[] = [
  {
    id: 'translate-english',
    title: '英語変換',
    prompt: 'この画像内の日本語テキストを英語に翻訳して、同じデザインで新しい画像を生成してください。',
    category: '翻訳'
  },
  {
    id: 'style-anime',
    title: 'アニメ風変換',
    prompt: 'この画像をアニメ風のイラストスタイルに変換してください。',
    category: 'スタイル'
  },
  {
    id: 'remove-background',
    title: '背景除去',
    prompt: 'この画像から背景を除去して、主要な被写体のみを残してください。',
    category: '編集'
  },
  {
    id: 'enhance-quality',
    title: '画質向上',
    prompt: 'この画像の解像度と画質を向上させて、より鮮明にしてください。',
    category: '加工'
  },
  {
    id: 'photorealistic',
    title: '写実的変換',
    prompt: 'この画像をより写実的でリアルなスタイルに変換してください。',
    category: 'スタイル'
  },
  {
    id: 'vintage-style',
    title: 'ヴィンテージ風',
    prompt: 'この画像をヴィンテージ・レトロな雰囲気に変換してください。',
    category: 'スタイル'
  }
];