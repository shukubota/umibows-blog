'use client';

import { useState, useCallback, useRef } from 'react';

interface ImageUploaderProps {
  onImageUpload: (file: File, preview: string) => void;
  disabled?: boolean;
}

export default function ImageUploader({ onImageUpload, disabled = false }: ImageUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB
      alert('ファイルサイズが10MBを超えています');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataURL = reader.result as string;
      setPreview(dataURL);
      onImageUpload(file, dataURL);
    };
    reader.readAsDataURL(file);
  }, [onImageUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile, disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleClick = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  return (
    <div className="space-y-4">
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200
          ${disabled 
            ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 cursor-not-allowed' 
            : isDragOver 
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 scale-105' 
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled}
        />
        
        {preview ? (
          <div className="space-y-4">
            <div className="relative">
              <img 
                src={preview} 
                alt="Preview" 
                className="max-w-full max-h-64 mx-auto rounded-lg shadow-md"
              />
              {!disabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-20 transition-all rounded-lg">
                  <div className="text-white opacity-0 hover:opacity-100 transition-opacity">
                    <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm mt-2">変更</p>
                  </div>
                </div>
              )}
            </div>
            {!disabled && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                クリックまたはドラッグで画像を変更
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-6xl text-gray-400">
              {isDragOver ? '📤' : '📷'}
            </div>
            <div>
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
                {isDragOver ? 'ここにドロップ' : '画像をアップロード'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                {disabled 
                  ? '画像生成中...' 
                  : 'ドラッグ&ドロップまたはクリックして選択'
                }
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                PNG, JPG, GIF対応 (最大10MB)
              </p>
            </div>
          </div>
        )}
      </div>
      
      {preview && !disabled && (
        <div className="flex justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPreview(null);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            画像をクリア
          </button>
        </div>
      )}
    </div>
  );
}