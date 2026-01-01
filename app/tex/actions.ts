'use server';

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export async function generateTexFromImage(imageBase64: string): Promise<{ tex: string; error?: string }> {
    try {
        if (!process.env.ANTHROPIC_API_KEY) {
            return { tex: '', error: 'ANTHROPIC_API_KEY is not set on the server.' };
        }

        // Remove the data URL prefix if present (e.g., "data:image/jpeg;base64,")
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

        const message = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-latest',
            max_tokens: 1024,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/jpeg',
                                data: base64Data,
                            },
                        },
                        {
                            type: 'text',
                            text: 'Convert the handwritten mathematical expression in this image to valid LaTeX. Return ONLY the LaTeX code. Do not include markdown code blocks (like ```latex or ```), do not include any explanatory text. Just the raw LaTeX string.',
                        },
                    ],
                },
            ],
        });

        const textBlock = message.content[0];
        if (textBlock.type !== 'text') {
            throw new Error('Unexpected response format from Claude');
        }

        let cleanTex = textBlock.text.trim();

        console.log('Claude Response:', cleanTex);

        // Clean up response if it still has markdown
        if (cleanTex.startsWith('```latex')) {
            cleanTex = cleanTex.replace(/^```latex/, '').replace(/```$/, '').trim();
        } else if (cleanTex.startsWith('```')) {
            cleanTex = cleanTex.replace(/^```/, '').replace(/```$/, '').trim();
        }

        cleanTex = cleanTex.replace(/^\\\[/, '').replace(/\\\]$/, '').trim();
        cleanTex = cleanTex.replace(/^\$\$/, '').replace(/\$\$$/, '').trim();

        return { tex: cleanTex };
    } catch (error: any) {
        console.error('Error in generateTexFromImage:', error);
        return { tex: '', error: error.message || 'Failed to process image.' };
    }
}
