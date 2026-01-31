# 画像生成システム 仕様書

## 概要
Google Gemini APIを使用した画像アップロード→プロンプト入力→画像生成のWebアプリケーション。ユーザーがベース画像をアップロードし、自由なプロンプトで画像変換・生成を行うシステム。

## 機能要件

### 基本機能
1. **画像アップロード**: ローカル画像ファイルの選択・プレビュー
2. **プロンプト入力**: 自由形式のテキスト入力による画像生成指示
3. **画像生成**: Google Gemini API による画像変換・生成
4. **結果表示**: 生成された画像のプレビューとダウンロード
5. **履歴管理**: 過去の生成履歴の閲覧

### 追加機能
- **プリセットプロンプト**: よく使われるプロンプトのテンプレート集
- **バッチ処理**: 複数の言語・スタイルでの一括変換
- **パフォーマンス表示**: API レスポンス時間の測定・表示

## プロジェクト構造
```
/app/image-generator/
├── page.tsx                    # メインページ
├── components/
│   ├── ImageUploader.tsx       # 画像アップロードコンポーネント
│   ├── PromptInput.tsx         # プロンプト入力コンポーネント
│   ├── GeneratedImage.tsx      # 生成画像表示コンポーネント
│   ├── HistoryPanel.tsx        # 履歴表示パネル
│   └── PresetPrompts.tsx       # プリセットプロンプト集
├── actions.ts                  # Server Actions (API呼び出し)
└── types.ts                    # TypeScript型定義
```

## UI/UX設計

### レイアウト
```
┌─────────────────────────────────────┐
│ Image Generator                      │
├─────────────────┬───────────────────┤
│                 │                   │
│ Upload Area     │ Generated Image   │
│ [Browse File]   │ [Loading/Result]  │
│                 │                   │
├─────────────────┼───────────────────┤
│                 │                   │
│ Prompt Input    │ Generation Info   │
│ [Text Area]     │ Time: 2.5s        │
│ [Generate]      │ Model: gemini-2.5 │
│                 │                   │
├─────────────────┴───────────────────┤
│ Preset Prompts                      │
│ [英語変換] [スタイル変更] [背景除去] │
├─────────────────────────────────────┤
│ Generation History                  │
│ [Previous Results...]               │
└─────────────────────────────────────┘
```

### インタラクション設計
1. **画像ドラッグ&ドロップ**: 直感的なファイルアップロード
2. **リアルタイムプレビュー**: アップロード画像の即座表示
3. **プロンプト入力支援**: 候補表示、履歴からの選択
4. **生成状態表示**: ローディング、進行状況、エラー表示
5. **結果のワンクリック保存**: 生成画像の簡単ダウンロード

## 技術仕様

### フロントエンド
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **State Management**: React hooks + useContext
- **File Upload**: React-Dropzone または HTML5 File API
- **Image Display**: Next.js Image component

### バックエンド
- **API**: Next.js Server Actions
- **AI Service**: Google Gemini API (`@google/genai`)
- **Image Processing**: Base64エンコーディング
- **Storage**: クライアントサイドのみ（No Database）

### データ型定義
```typescript
// types.ts
export interface ImageGenerationRequest {
  image: File;
  prompt: string;
  model?: string;
  language?: string;
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
```

## 主要コンポーネント実装例

### Server Actions (actions.ts)
```typescript
'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

export async function generateImage(
  imageData: string, // Base64
  prompt: string
): Promise<ImageGenerationResponse> {
  const startTime = Date.now();
  
  try {
    if (!process.env.GOOGLE_AI_API_KEY) {
      throw new Error('Google AI API Key not configured');
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    const imageParts = [
      {
        inlineData: {
          data: imageData,
          mimeType: "image/png"
        }
      }
    ];

    const response = await model.generateContent([prompt, ...imageParts]);
    const latency = Date.now() - startTime;

    // レスポンス処理
    if (!response.response.candidates) {
      throw new Error('No response generated');
    }

    const candidate = response.response.candidates[0];
    const parts = candidate.content.parts;

    for (const part of parts) {
      if (part.text) {
        return {
          success: true,
          textResponse: part.text,
          latency
        };
      }
      if (part.inlineData?.data) {
        return {
          success: true,
          imageData: part.inlineData.data,
          latency
        };
      }
    }

    throw new Error('Unexpected response format');

  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      latency
    };
  }
}
```

### 画像アップローダー (ImageUploader.tsx)
```tsx
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface ImageUploaderProps {
  onImageUpload: (file: File, preview: string) => void;
}

export default function ImageUploader({ onImageUpload }: ImageUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataURL = reader.result as string;
        setPreview(dataURL);
        onImageUpload(file, dataURL);
      };
      reader.readAsDataURL(file);
    }
  }, [onImageUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024 // 10MB
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive 
            ? 'border-blue-400 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
          }
        `}
      >
        <input {...getInputProps()} />
        {preview ? (
          <div className="space-y-4">
            <img 
              src={preview} 
              alt="Preview" 
              className="max-w-full max-h-64 mx-auto rounded"
            />
            <p className="text-sm text-gray-600">
              クリックまたはドラッグで画像を変更
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-4xl text-gray-400">📷</div>
            <p className="text-lg font-medium text-gray-700">
              画像をアップロード
            </p>
            <p className="text-sm text-gray-500">
              ドラッグ&ドロップまたはクリックして選択
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

### メインページ (page.tsx)
```tsx
'use client';

import { useState } from 'react';
import ImageUploader from './components/ImageUploader';
import PromptInput from './components/PromptInput';
import GeneratedImage from './components/GeneratedImage';
import { generateImage } from './actions';

export default function ImageGeneratorPage() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleImageUpload = (file: File, preview: string) => {
    setUploadedFile(file);
    setUploadPreview(preview);
    setResult(null); // Clear previous results
  };

  const handleGenerate = async () => {
    if (!uploadedFile || !prompt.trim()) return;

    setIsGenerating(true);
    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const base64Data = base64.split(',')[1]; // Remove data URL prefix
        
        const response = await generateImage(base64Data, prompt);
        setResult(response);
      };
      reader.readAsDataURL(uploadedFile);
    } catch (error) {
      console.error('Generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            AI Image Generator
          </h1>
          <p className="text-lg text-gray-600">
            画像をアップロードしてAIで変換・生成
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Input */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">画像アップロード</h2>
              <ImageUploader onImageUpload={handleImageUpload} />
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">プロンプト入力</h2>
              <PromptInput 
                value={prompt}
                onChange={setPrompt}
                onSubmit={handleGenerate}
                disabled={!uploadedFile || isGenerating}
                isLoading={isGenerating}
              />
            </div>
          </div>

          {/* Right Column: Output */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">生成結果</h2>
            <GeneratedImage 
              result={result}
              isLoading={isGenerating}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

## プリセットプロンプト例
```typescript
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
  }
];
```

## 環境変数
```bash
# .envrc
export GOOGLE_AI_API_KEY=your_google_ai_api_key_here
```

## セキュリティ考慮事項
- **API キー保護**: サーバーサイドでのみAPI キー使用
- **ファイルサイズ制限**: 10MB以下に制限
- **ファイル形式制限**: 画像ファイルのみ許可
- **レート制限**: API呼び出し頻度の制御
- **エラーハンドリング**: 適切なエラーメッセージ表示

## パフォーマンス最適化
- **画像圧縮**: アップロード前の自動リサイズ
- **遅延読み込み**: 大きな画像の段階的読み込み
- **キャッシング**: 生成結果のクライアントサイドキャッシュ
- **Progress表示**: 長時間処理の進行状況表示