'use client';

import { useState } from 'react';
import ImageUploader from './components/ImageUploader';
import PromptInput from './components/PromptInput';
import GeneratedImage from './components/GeneratedImage';
import { generateImage } from './actions';
import { ImageGenerationResponse } from './types';

export default function ImageGeneratorPage() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<ImageGenerationResponse | null>(null);

  const handleImageUpload = (file: File, preview: string) => {
    setUploadedFile(file);
    setUploadPreview(preview);
    setResult(null); // Clear previous results
  };

  const handleGenerate = async () => {
    if (!uploadedFile || !prompt.trim()) {
      alert('画像とプロンプトの両方を入力してください');
      return;
    }

    setIsGenerating(true);
    setResult(null);

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const base64Data = base64.split(',')[1]; // Remove data URL prefix
          
          console.log('Starting image generation...');
          const response = await generateImage(base64Data, prompt);
          console.log('Generation response:', response);
          
          setResult(response);
        } catch (error) {
          console.error('Generation error:', error);
          setResult({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            latency: 0
          });
        } finally {
          setIsGenerating(false);
        }
      };
      
      reader.onerror = () => {
        setIsGenerating(false);
        setResult({
          success: false,
          error: 'ファイルの読み込みに失敗しました',
          latency: 0
        });
      };
      
      reader.readAsDataURL(uploadedFile);
    } catch (error) {
      console.error('File reading error:', error);
      setIsGenerating(false);
      setResult({
        success: false,
        error: 'ファイルの処理に失敗しました',
        latency: 0
      });
    }
  };

  const canGenerate = uploadedFile && prompt.trim() && !isGenerating;
  
  // デバッグ用ログ
  console.log('Debug - canGenerate:', {
    uploadedFile: !!uploadedFile,
    prompt: prompt.trim(),
    isGenerating,
    canGenerate
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <header className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              AI Image Generator
            </h1>
            <p className="text-lg text-gray-600">
              Google Gemini AIを使った画像生成・変換ツール
            </p>
          </header>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Input */}
          <div className="space-y-6">
            {/* Image Upload */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                <span className="text-2xl">📷</span>
                画像アップロード
              </h2>
              <ImageUploader 
                onImageUpload={handleImageUpload} 
                disabled={isGenerating}
              />
            </div>

            {/* Prompt Input */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                <span className="text-2xl">✏️</span>
                プロンプト入力
              </h2>
              <PromptInput 
                value={prompt}
                onChange={setPrompt}
                onSubmit={handleGenerate}
                disabled={isGenerating}
                isLoading={isGenerating}
                canSubmit={canGenerate}
              />
            </div>
          </div>

          {/* Right Column: Output */}
          <div className="space-y-6">
            {/* Generated Image */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                <span className="text-2xl">🎨</span>
                生成結果
              </h2>
              <GeneratedImage 
                result={result}
                isLoading={isGenerating}
              />
            </div>

            {/* Debug Panel */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-xs">
              <h3 className="font-medium text-yellow-800 mb-2">デバッグ情報</h3>
              <div className="space-y-1 text-yellow-700">
                <div>画像アップロード済み: {uploadedFile ? '✅' : '❌'}</div>
                <div>プロンプト入力済み: {prompt.trim() ? '✅' : '❌'} (長さ: {prompt.length})</div>
                <div>生成中: {isGenerating ? '✅' : '❌'}</div>
                <div>ボタン有効: {canGenerate ? '✅' : '❌'}</div>
              </div>
            </div>

            {/* Info Panel */}
            {!result && !isGenerating && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-blue-800 mb-3">使い方</h3>
                <ol className="text-sm text-blue-700 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-blue-600">1.</span>
                    <span>変換・生成したい画像をアップロード</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-blue-600">2.</span>
                    <span>どのような変更を加えたいかプロンプトで指示</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-blue-600">3.</span>
                    <span>「画像を生成」ボタンをクリックしてAI処理を実行</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-blue-600">4.</span>
                    <span>結果をダウンロードまたはコピーして利用</span>
                  </li>
                </ol>
                
                <div className="mt-4 p-3 bg-blue-100 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">💡 ヒント:</span> 
                    具体的で詳細なプロンプトほど、より期待に近い結果が得られます。
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-12 text-center text-gray-500 text-sm">
          <p>Powered by Google Gemini AI | 最大ファイルサイズ: 10MB</p>
        </div>
      </div>
    </div>
  );
}