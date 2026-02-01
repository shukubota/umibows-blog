'use client';

import { useState } from 'react';
import { presetPrompts } from '../types';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  canSubmit?: boolean;
}

export default function PromptInput({ 
  value, 
  onChange, 
  onSubmit, 
  disabled = false, 
  isLoading = false,
  canSubmit = true
}: PromptInputProps) {
  const [showPresets, setShowPresets] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) {
      onSubmit();
    }
  };

  const handlePresetSelect = (prompt: string) => {
    onChange(prompt);
    setShowPresets(false);
  };

  // デバッグ用ログ
  console.log('PromptInput Debug:', {
    value: value.trim(),
    disabled,
    isLoading,
    canSubmit,
    valueLength: value.length
  });

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            プロンプト
          </label>
          <textarea
            id="prompt"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="画像に対して何をしたいか詳しく説明してください..."
            className="w-full h-32 p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            disabled={disabled}
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className={`
              flex-1 px-6 py-3 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2
              ${canSubmit
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                生成中...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                画像を生成
              </>
            )}
          </button>
          
          <button
            type="button"
            onClick={() => setShowPresets(!showPresets)}
            disabled={disabled}
            className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
        </div>
      </form>

      {/* プリセットプロンプト */}
      {showPresets && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">プリセットプロンプト</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {presetPrompts.map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  console.log('Preset selected:', preset.prompt);
                  handlePresetSelect(preset.prompt);
                }}
                disabled={disabled}
                className="text-left p-3 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <div className="font-medium text-sm text-gray-800 dark:text-gray-200">{preset.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{preset.category}</div>
                <div className="text-xs text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">
                  {preset.prompt.length > 60 
                    ? `${preset.prompt.substring(0, 60)}...` 
                    : preset.prompt
                  }
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* プロンプト例 */}
      {!showPresets && value.length === 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          <p className="mb-2">例：</p>
          <ul className="space-y-1 pl-4">
            <li>• この画像をアニメ風にしてください</li>
            <li>• 背景を青空に変更してください</li>
            <li>• 画像内の文字を英語に翻訳してください</li>
            <li>• より鮮明で高画質にしてください</li>
          </ul>
        </div>
      )}
    </div>
  );
}