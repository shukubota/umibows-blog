# MCP Chat Client 仕様書

## 概要

独自チャットUIにMCP（Model Context Protocol）クライアント機能を統合し、カスタムMCPサーバーとの接続を可能にするシステム。ユーザーは自然言語でAIと会話しながら、MCPサーバー経由で様々な外部システムやツールにアクセスできる。

## MCPとは

Model Context Protocol (MCP) は、LLMアプリケーションがセキュアに外部データソースやツールにアクセスするためのオープンスタンダードプロトコル。Claude、ChatGPT等のAIアプリケーションが、ファイルシステム、データベース、API等のリソースに標準化された方法でアクセス可能。

### MCPの主要概念

- **MCPクライアント**: LLMホスト（この場合は独自チャットUI）
- **MCPサーバー**: リソース（ファイル、API、DB等）へのアクセスを提供
- **リソース**: ファイル、Web API、データベース等の外部システム
- **ツール**: MCPサーバーが提供する実行可能な機能
- **プロンプト**: MCPサーバーが提供する定型的なプロンプトテンプレート

## システム構成

### アーキテクチャ

```
┌─────────────────┐    MCP Protocol    ┌──────────────────┐
│   Chat Client   │◄──────────────────►│   MCP Server     │
│   (Next.js)     │                    │   (Custom)       │
└─────────────────┘                    └──────────────────┘
         │                                       │
         ▼                                       ▼
┌─────────────────┐                    ┌──────────────────┐
│   Claude API    │                    │ External Systems │
│   (Anthropic)   │                    │ (Files/APIs/DBs) │
└─────────────────┘                    └──────────────────┘
```

### 技術スタック

#### フロントエンド（Chat Client）
- **Next.js 14**: App Router + Server Actions
- **TypeScript**: 型安全性
- **Tailwind CSS**: UI デザイン
- **@modelcontextprotocol/sdk**: MCPクライアントSDK
- **WebSocket**: MCPサーバーとの通信
- **React Query**: サーバー状態管理

#### MCPサーバー
- **Node.js/TypeScript**: サーバー実装
- **@modelcontextprotocol/sdk**: MCPサーバーSDK
- **WebSocket/JSON-RPC**: 通信プロトコル
- **適切なライブラリ**: 接続先システムに応じて選択

## フロントエンド実装

### ディレクトリ構造

```
/app/chat-client/
├── page.tsx                 # チャットUI メインページ
├── layout.tsx               # 共通レイアウト
├── actions.ts               # Server Actions (Claude API呼び出し)
├── components/
│   ├── ChatInterface.tsx    # メインチャットインターフェース
│   ├── MessageList.tsx      # メッセージ表示
│   ├── MessageInput.tsx     # メッセージ入力
│   ├── MCPServerStatus.tsx  # MCPサーバー接続状況
│   ├── ToolCallDisplay.tsx  # ツール呼び出し表示
│   └── ResourceBrowser.tsx  # MCPリソース一覧
├── hooks/
│   ├── useMCPClient.ts      # MCPクライアント管理
│   ├── useChat.ts           # チャット状態管理
│   └── useMCPTools.ts       # MCPツール管理
└── lib/
    ├── mcp-client.ts        # MCP クライアント実装
    ├── types.ts             # 型定義
    └── utils.ts             # ユーティリティ
```

### MCPクライアント実装

```typescript
// lib/mcp-client.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  CallToolRequest,
  CallToolResult,
  ListResourcesRequest,
  ListToolsRequest
} from '@modelcontextprotocol/sdk/types.js';

export interface MCPClientConfig {
  serverExecutable: string;
  serverArgs?: string[];
  serverEnv?: Record<string, string>;
}

export class MCPClientManager {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async connect(config: MCPClientConfig): Promise<void> {
    this.transport = new StdioClientTransport({
      command: config.serverExecutable,
      args: config.serverArgs || [],
      env: config.serverEnv || {}
    });

    this.client = new Client({
      name: "umibows-chat-client",
      version: "1.0.0"
    }, {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      }
    });

    await this.client.connect(this.transport);
  }

  async disconnect(): Promise<void> {
    await this.client?.close();
    this.client = null;
    this.transport = null;
  }

  async listTools() {
    if (!this.client) throw new Error('MCPクライアントが接続されていません');

    const response = await this.client.request(
      { method: "tools/list" },
      ListToolsRequest
    );
    return response.tools;
  }

  async listResources() {
    if (!this.client) throw new Error('MCPクライアントが接続されていません');

    const response = await this.client.request(
      { method: "resources/list" },
      ListResourcesRequest
    );
    return response.resources;
  }

  async callTool(name: string, args: any): Promise<CallToolResult> {
    if (!this.client) throw new Error('MCPクライアントが接続されていません');

    const response = await this.client.request(
      {
        method: "tools/call",
        params: {
          name,
          arguments: args
        }
      },
      CallToolRequest
    );
    return response;
  }

  async readResource(uri: string) {
    if (!this.client) throw new Error('MCPクライアントが接続されていません');

    return await this.client.request({
      method: "resources/read",
      params: { uri }
    });
  }
}
```

### React Hooks実装

```typescript
// hooks/useMCPClient.ts
import { useState, useEffect, useCallback } from 'react';
import { MCPClientManager, MCPClientConfig } from '@/lib/mcp-client';

export function useMCPClient() {
  const [client] = useState(() => new MCPClientManager());
  const [isConnected, setIsConnected] = useState(false);
  const [tools, setTools] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);

  const connect = useCallback(async (config: MCPClientConfig) => {
    try {
      await client.connect(config);
      setIsConnected(true);

      // ツールとリソースの一覧を取得
      const [toolsList, resourcesList] = await Promise.all([
        client.listTools(),
        client.listResources()
      ]);

      setTools(toolsList);
      setResources(resourcesList);
    } catch (error) {
      console.error('MCP接続エラー:', error);
      setIsConnected(false);
    }
  }, [client]);

  const disconnect = useCallback(async () => {
    await client.disconnect();
    setIsConnected(false);
    setTools([]);
    setResources([]);
  }, [client]);

  const callTool = useCallback(async (name: string, args: any) => {
    return await client.callTool(name, args);
  }, [client]);

  const readResource = useCallback(async (uri: string) => {
    return await client.readResource(uri);
  }, [client]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    callTool,
    readResource,
    isConnected,
    tools,
    resources
  };
}
```

### チャットインターフェース

```typescript
// components/ChatInterface.tsx
'use client';

import { useState } from 'react';
import { useMCPClient } from '@/hooks/useMCPClient';
import { useChat } from '@/hooks/useChat';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import MCPServerStatus from './MCPServerStatus';
import ToolCallDisplay from './ToolCallDisplay';

export default function ChatInterface() {
  const {
    connect,
    disconnect,
    callTool,
    readResource,
    isConnected,
    tools,
    resources
  } = useMCPClient();

  const { messages, addMessage, isLoading } = useChat();
  const [mcpConfig, setMCPConfig] = useState({
    serverExecutable: 'node',
    serverArgs: ['path/to/your/mcp-server.js'],
  });

  const handleMCPConnect = async () => {
    await connect(mcpConfig);
  };

  const handleSendMessage = async (content: string) => {
    addMessage({ role: 'user', content });

    // Claude APIに送信（MCPツールの情報も含める）
    // Server Actionで実装
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [...messages, { role: 'user', content }],
        tools: tools,
        mcpContext: { isConnected, resources }
      })
    });

    const result = await response.json();
    addMessage({ role: 'assistant', content: result.content });

    // ツール呼び出しがある場合は実行
    if (result.toolCalls) {
      for (const toolCall of result.toolCalls) {
        const toolResult = await callTool(toolCall.name, toolCall.args);
        // ツール実行結果を表示
      }
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* サイドバー */}
      <div className="w-80 bg-gray-800 p-4 overflow-y-auto">
        <MCPServerStatus
          isConnected={isConnected}
          onConnect={handleMCPConnect}
          onDisconnect={disconnect}
          config={mcpConfig}
          onConfigChange={setMCPConfig}
        />

        {isConnected && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">利用可能なツール</h3>
            <div className="space-y-2">
              {tools.map((tool, index) => (
                <div key={index} className="p-2 bg-gray-700 rounded">
                  <div className="font-medium">{tool.name}</div>
                  <div className="text-sm text-gray-300">{tool.description}</div>
                </div>
              ))}
            </div>

            <h3 className="text-lg font-semibold mt-6 mb-3">リソース</h3>
            <div className="space-y-2">
              {resources.map((resource, index) => (
                <div key={index} className="p-2 bg-gray-700 rounded">
                  <div className="font-medium">{resource.name}</div>
                  <div className="text-sm text-gray-300">{resource.description}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* メインチャットエリア */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <MessageList messages={messages} />
        </div>
        <div className="border-t border-gray-700">
          <MessageInput
            onSendMessage={handleSendMessage}
            disabled={!isConnected || isLoading}
          />
        </div>
      </div>
    </div>
  );
}
```

## MCPサーバー実装例

### 基本的なMCPサーバー

```typescript
// mcp-server/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

class CustomMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "custom-mcp-server",
        version: "1.0.0"
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        }
      }
    );

    this.setupToolHandlers();
    this.setupResourceHandlers();
  }

  private setupToolHandlers() {
    // ツール一覧の提供
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "file_search",
            description: "ファイルシステム内でファイルを検索",
            inputSchema: {
              type: "object",
              properties: {
                pattern: { type: "string", description: "検索パターン" },
                directory: { type: "string", description: "検索ディレクトリ" }
              },
              required: ["pattern"]
            }
          },
          {
            name: "api_call",
            description: "外部APIを呼び出し",
            inputSchema: {
              type: "object",
              properties: {
                url: { type: "string", description: "API URL" },
                method: { type: "string", description: "HTTPメソッド" },
                data: { type: "object", description: "送信データ" }
              },
              required: ["url", "method"]
            }
          }
        ]
      };
    });

    // ツール実行
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "file_search":
          return await this.handleFileSearch(args);
        case "api_call":
          return await this.handleApiCall(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private setupResourceHandlers() {
    // リソース一覧の提供
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: "file://./config.json",
            name: "設定ファイル",
            description: "アプリケーション設定",
            mimeType: "application/json"
          }
        ]
      };
    });

    // リソース読み込み
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === "file://./config.json") {
        const fs = await import('fs');
        const content = fs.readFileSync('./config.json', 'utf8');
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: content
            }
          ]
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });
  }

  private async handleFileSearch(args: any) {
    const { pattern, directory = "./" } = args;
    const glob = await import('glob');

    const files = glob.sync(pattern, { cwd: directory });

    return {
      content: [
        {
          type: "text",
          text: `検索結果: ${files.length}個のファイルが見つかりました\n${files.join('\n')}`
        }
      ]
    };
  }

  private async handleApiCall(args: any) {
    const { url, method, data } = args;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: data ? JSON.stringify(data) : undefined
      });

      const result = await response.json();

      return {
        content: [
          {
            type: "text",
            text: `API呼び出し成功\nステータス: ${response.status}\nレスポンス: ${JSON.stringify(result, null, 2)}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `API呼び出しエラー: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// サーバー起動
const server = new CustomMCPServer();
server.start().catch(console.error);
```

## セキュリティ考慮事項

### 認証・認可
- MCPサーバーへのアクセス制御
- APIキーやトークンの安全な管理
- ユーザー権限に基づくツール制限

### データ保護
- MCPクライアント-サーバー間通信の暗号化
- 機密データの適切な処理
- ログ出力時の個人情報マスキング

### サンドボックス化
- MCPサーバーの実行環境隔離
- ファイルシステムアクセスの制限
- ネットワークアクセス制御

## 開発・デプロイ

### 開発環境

```bash
# フロントエンド開発
npm run dev

# MCPサーバー開発
cd mcp-server
npm run dev

# 統合テスト
npm run test:mcp
```

### 本番環境

- MCPサーバーのプロセス管理（PM2等）
- ログ監視・アラート設定
- パフォーマンス監視
- 自動復旧機能

## 今後の拡張計画

### 機能拡張
- 複数MCPサーバーの同時接続
- MCPサーバーのプラグインアーキテクチャ
- カスタムツールの動的登録
- リアルタイムコラボレーション

### パフォーマンス最適化
- MCPコネクションプール
- ツール実行結果のキャッシュ
- ストリーミングレスポンス対応
- バックグラウンドタスク処理