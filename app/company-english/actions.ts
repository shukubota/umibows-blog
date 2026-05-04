"use server";

import AnthropicVertex from "@anthropic-ai/vertex-sdk";
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";

export interface MemberProfile {
  name: string;
  role: string;
  background: string;
}

export interface QAItem {
  memberName: string;
  memberRole: string;
  question: string;
  sampleAnswer: string;
  followUpQuestion: string;
}

export interface CompanyQAResult {
  companyInfo: string;
  members: MemberProfile[];
  qaList: QAItem[];
}

const GraphState = Annotation.Root({
  companyName: Annotation<string>({ reducer: (_, b) => b }),
  companyInfo: Annotation<string>({ reducer: (_, b) => b }),
  members: Annotation<MemberProfile[]>({ reducer: (_, b) => b }),
  qaList: Annotation<QAItem[]>({ reducer: (_, b) => b }),
});

async function callClaude(prompt: string): Promise<string> {
  const client = new AnthropicVertex({
    projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
    region: process.env.CLOUD_ML_REGION ?? "global",
  });
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

async function researchNode(state: typeof GraphState.State) {
  const companyInfo = await callClaude(
    `Research the company "${state.companyName}". Provide a comprehensive overview in English including:
- Industry and main business activities
- Company culture and core values
- Company size and key departments
- Notable characteristics or reputation

Respond in 2-3 plain text paragraphs. Do not use markdown formatting, bullet points, or headers.`,
  );
  return { companyInfo };
}

async function analyzeNode(state: typeof GraphState.State) {
  const content = await callClaude(
    `Based on this company information about "${state.companyName}":

${state.companyInfo}

Create 3 realistic hypothetical employee profiles who work at this company.
Respond ONLY with a JSON array, no other text:
[
  {
    "name": "Full Name",
    "role": "Job Title",
    "background": "Brief background (1-2 sentences about their experience and personality)"
  }
]`,
  );
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  const members: MemberProfile[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  return { members };
}

async function generateQANode(state: typeof GraphState.State) {
  const membersStr = state.members
    .map((m) => `- ${m.name} (${m.role}): ${m.background}`)
    .join("\n");

  const content = await callClaude(
    `Generate English conversation practice Q&A for someone meeting employees at ${state.companyName}.

Company overview:
${state.companyInfo}

Employees:
${membersStr}

For each employee, create one realistic English conversation scenario.
Make the questions natural and appropriate for a professional context (networking, interview, or business meeting).
Respond ONLY with a JSON array, no other text:
[
  {
    "memberName": "Name",
    "memberRole": "Role",
    "question": "A natural English question to ask this person",
    "sampleAnswer": "How this person would likely respond (1-3 sentences, in first person)",
    "followUpQuestion": "A natural follow-up question based on their answer"
  }
]`,
  );
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  const qaList: QAItem[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  return { qaList };
}

export async function generateCompanyQA(companyName: string): Promise<CompanyQAResult> {
  if (!process.env.ANTHROPIC_VERTEX_PROJECT_ID) {
    throw new Error("ANTHROPIC_VERTEX_PROJECT_ID is not set on the server.");
  }

  const workflow = new StateGraph(GraphState)
    .addNode("research", researchNode)
    .addNode("analyze", analyzeNode)
    .addNode("generateQA", generateQANode)
    .addEdge(START, "research")
    .addEdge("research", "analyze")
    .addEdge("analyze", "generateQA")
    .addEdge("generateQA", END);

  const app = workflow.compile();
  const result = await app.invoke({ companyName });

  return {
    companyInfo: result.companyInfo,
    members: result.members,
    qaList: result.qaList,
  };
}
