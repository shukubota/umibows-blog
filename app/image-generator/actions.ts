'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { ImageGenerationResponse } from './types';

export async function generateImage(
  imageDataArray: string[], // Base64 array
  prompt: string
): Promise<ImageGenerationResponse> {
  const startTime = Date.now();
  
  try {
    if (!process.env.GOOGLE_AI_API_KEY) {
      throw new Error('Google AI API Key not configured');
    }

    console.log('Starting image generation with Gemini API...');
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({
      // model: "gemini-2.5-flash-image",
      model: "gemini-3-pro-image-preview",
    });

    const imageParts = imageDataArray.map(imageData => ({
      inlineData: {
        data: imageData,
        mimeType: "image/png"
      }
    }));

    console.log('Sending request to Gemini API...');
    const response = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { text: `Based on the uploaded ${imageDataArray.length > 1 ? 'images' : 'image'}, ${prompt}

IMPORTANT: You must generate and return an actual image file, not a text description. Please create a new image that fulfills this request.${imageDataArray.length > 1 ? ' Use all the provided images as reference.' : ''}` },
          ...imageParts
        ]
      }],
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 8192,
      }
    });
    const latency = Date.now() - startTime;
    console.log(`API response received in ${latency}ms`);

    // レスポンス処理
    if (!response.response.candidates || response.response.candidates.length === 0) {
      throw new Error('No response generated from Gemini API');
    }

    const candidate = response.response.candidates[0];
    if (!candidate.content || !candidate.content.parts) {
      throw new Error('Invalid response format from Gemini API');
    }

    const parts = candidate.content.parts;

    // 画像データを優先的に探す
    let generatedImageData: string | undefined;
    let textResponse: string | undefined;

    console.log('Response parts count:', parts.length);
    for (const part of parts) {
      console.log('Part type:', Object.keys(part));
      if (part.inlineData?.data) {
        console.log('Image data received, size:', part.inlineData.data.length);
        generatedImageData = part.inlineData.data;
      }
      if (part.text) {
        console.log('Text response received:', part.text.substring(0, 100) + '...');
        textResponse = part.text;
      }
    }

    // 画像データがある場合は画像を返す
    if (generatedImageData) {
      return {
        success: true,
        imageData: generatedImageData,
        textResponse, // 説明があれば一緒に返す
        latency
      };
    }

    // 画像データがなくてテキストがある場合はテキストを返す
    if (textResponse) {
      return {
        success: true,
        textResponse,
        latency
      };
    }

    // どちらも見つからない場合はエラー
    throw new Error('No valid content found in API response');

  } catch (error) {
    const latency = Date.now() - startTime;
    console.error('Image generation error:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      latency
    };
  }
}
