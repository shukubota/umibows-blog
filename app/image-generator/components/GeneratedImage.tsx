'use client';

import { ImageGenerationResponse } from '../types';

interface GeneratedImageProps {
  result: ImageGenerationResponse | null;
  isLoading: boolean;
}

export default function GeneratedImage({ result, isLoading }: GeneratedImageProps) {
  const downloadImage = () => {
    if (!result?.imageData) return;

    try {
      const link = document.createElement('a');
      link.href = `data:image/png;base64,${result.imageData}`;
      link.download = `generated-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download failed:', error);
      alert('ダウンロードに失敗しました');
    }
  };

  const copyToClipboard = () => {
    if (!result?.textResponse) return;

    navigator.clipboard.writeText(result.textResponse).then(() => {
      alert('テキストをクリップボードにコピーしました');
    }).catch(() => {
      alert('コピーに失敗しました');
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-lg font-medium text-gray-700">AI画像を生成中...</p>
        <p className="text-sm text-gray-500 mt-1">しばらくお待ちください</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <div className="text-6xl text-gray-400 mb-4">🎨</div>
        <p className="text-lg font-medium text-gray-700">生成結果がここに表示されます</p>
        <p className="text-sm text-gray-500 mt-1">画像をアップロードしてプロンプトを入力してください</p>
      </div>
    );
  }

  if (!result.success) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-start">
          <div className="text-red-500 mr-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-red-800 mb-2">エラーが発生しました</h3>
            <p className="text-red-700 text-sm">{result.error}</p>
            <div className="mt-3 text-xs text-red-600">
              処理時間: {(result.latency / 1000).toFixed(2)}秒
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* パフォーマンス情報 */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-green-800 font-medium">✅ 生成完了</span>
          <span className="text-green-700">
            処理時間: {(result.latency / 1000).toFixed(2)}秒
          </span>
        </div>
      </div>

      {/* 生成された画像 */}
      {result.imageData && (
        <div className="space-y-4">
          <div className="relative group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={`data:image/png;base64,${result.imageData}`}
              alt="Generated Image"
              className="w-full rounded-lg shadow-lg"
            />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all rounded-lg"></div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={downloadImage}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              ダウンロード
            </button>
            
            <button
              onClick={() => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();
                img.onload = () => {
                  canvas.width = img.width;
                  canvas.height = img.height;
                  ctx?.drawImage(img, 0, 0);
                  canvas.toBlob((blob) => {
                    if (blob) {
                      navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                      ]).then(() => {
                        alert('画像をクリップボードにコピーしました');
                      }).catch(() => {
                        alert('コピーに失敗しました');
                      });
                    }
                  });
                };
                img.src = `data:image/png;base64,${result.imageData}`;
              }}
              className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              コピー
            </button>
          </div>
        </div>
      )}

      {/* テキストレスポンス */}
      {result.textResponse && (
        <div className="space-y-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">AIからの応答</h3>
              <button
                onClick={copyToClipboard}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                コピー
              </button>
            </div>
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {result.textResponse}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}