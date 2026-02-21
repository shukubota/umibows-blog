"use client";

import { useState, useCallback, useRef } from "react";

interface ImageUploaderProps {
  onImageUpload: (files: File[], previews: string[]) => void;
  disabled?: boolean;
}

export default function ImageUploader({ onImageUpload, disabled = false }: ImageUploaderProps) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressImage = useCallback((file: File): Promise<File> => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions (max 1024px on any side)
        let { width, height } = img;
        const maxSize = 1024;

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          0.8 // 80% quality
        );
      };

      img.src = URL.createObjectURL(file);
    });
  }, []);

  const handleFiles = useCallback(
    async (newFiles: File[]) => {
      const validFiles: File[] = [];
      const validPreviews: string[] = [];

      for (const file of newFiles) {
        if (!file.type.startsWith("image/")) {
          alert(`${file.name} は画像ファイルではありません`);
          continue;
        }

        if (file.size > 10 * 1024 * 1024) {
          // 10MB
          alert(`${file.name} のファイルサイズが10MBを超えています`);
          continue;
        }

        validFiles.push(file);
      }

      if (validFiles.length === 0) return;

      // Compress all valid files
      const compressedFiles: File[] = [];
      for (const file of validFiles) {
        const compressed = await compressImage(file);
        compressedFiles.push(compressed);
      }

      // Process all compressed files
      let processedCount = 0;
      const tempPreviews: string[] = [];

      compressedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataURL = reader.result as string;
          tempPreviews[index] = dataURL;
          processedCount++;

          if (processedCount === compressedFiles.length) {
            const allFiles = [...files, ...compressedFiles];
            const allPreviews = [...previews, ...tempPreviews];
            setFiles(allFiles);
            setPreviews(allPreviews);
            onImageUpload(allFiles, allPreviews);
          }
        };
        reader.readAsDataURL(file);
      });
    },
    [onImageUpload, files, previews, compressImage]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      if (disabled) return;

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        handleFiles(droppedFiles);
      }
    },
    [handleFiles, disabled]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (selectedFiles && selectedFiles.length > 0) {
        handleFiles(Array.from(selectedFiles));
      }
    },
    [handleFiles]
  );

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
          ${
            disabled
              ? "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 cursor-not-allowed"
              : isDragOver
                ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20 scale-105"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled}
        />

        {previews.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {previews.map((preview, index) => (
                <div key={index} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-32 object-cover rounded-lg shadow-md"
                  />
                  {!disabled && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const newFiles = files.filter((_, i) => i !== index);
                        const newPreviews = previews.filter((_, i) => i !== index);
                        setFiles(newFiles);
                        setPreviews(newPreviews);
                        onImageUpload(newFiles, newPreviews);
                      }}
                      className="absolute top-2 right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!disabled && (
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                {previews.length}枚の画像を選択中 - クリックまたはドラッグで追加
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-6xl text-gray-400">{isDragOver ? "📤" : "📷"}</div>
            <div>
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
                {isDragOver ? "ここにドロップ" : "画像をアップロード"}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                {disabled
                  ? "画像生成中..."
                  : "ドラッグ&ドロップまたはクリックして選択（複数選択可）"}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                PNG, JPG, GIF対応 (最大10MB/枚・自動圧縮)
              </p>
            </div>
          </div>
        )}
      </div>

      {previews.length > 0 && !disabled && (
        <div className="flex justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFiles([]);
              setPreviews([]);
              onImageUpload([], []);
              if (fileInputRef.current) {
                fileInputRef.current.value = "";
              }
            }}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            すべての画像をクリア
          </button>
        </div>
      )}
    </div>
  );
}
