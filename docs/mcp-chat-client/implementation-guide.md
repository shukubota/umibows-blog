# MCP Chat Client 実装ガイド

## 開発手順

### 1. 依存関係のインストール

```bash
# MCPクライアントSDKのインストール
npm install @modelcontextprotocol/sdk

# 追加の依存関係
npm install ws uuid
npm install -D @types/ws @types/uuid
```

### 2. 環境変数設定

```bash
# .env.local
ANTHROPIC_API_KEY=your_anthropic_api_key
MCP_SERVER_PATH=./mcp-server/dist/server.js
```

### 3. TypeScript設定更新

```json
// tsconfig.json
{
  "compilerOptions": {
    // ... 既存設定
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true
  }
}
```

### 4. MCPサーバーの作成

```bash
# MCPサーバー用ディレクトリ作成
mkdir -p mcp-server/src
cd mcp-server

# package.json作成
npm init -y
npm install @modelcontextprotocol/sdk glob
npm install -D typescript @types/node ts-node

# TypeScript設定
npx tsc --init
```

### 5. 開発スクリプト追加

```json
// package.json
{
  "scripts": {
    "dev": "next dev",
    "dev:mcp": "cd mcp-server && npm run dev",
    "dev:all": "concurrently \"npm run dev\" \"npm run dev:mcp\"",
    "build:mcp": "cd mcp-server && npm run build"
  },
  "devDependencies": {
    "concurrently": "^8.2.0"
  }
}
```

## 段階的実装アプローチ

### Phase 1: 基本チャットUI

1. **簡単なチャットインターフェース作成**
   - メッセージ表示
   - 入力フォーム
   - Claude APIとの基本的な連携

2. **コンポーネント分離**
   - MessageList
   - MessageInput
   - ChatContainer

### Phase 2: MCPクライアント統合

1. **MCPクライアントマネージャー実装**
   - 基本的な接続・切断機能
   - エラーハンドリング

2. **設定UI追加**
   - MCPサーバー接続設定
   - 接続状態表示

### Phase 3: ツール統合

1. **ツール表示・実行機能**
   - 利用可能ツール一覧
   - ツール呼び出しUI
   - 実行結果表示

2. **Claude APIとの統合**
   - ツール情報をClaude APIに送信
   - ツール呼び出し指示の処理

### Phase 4: リソース管理

1. **リソースブラウザー**
   - 利用可能リソース表示
   - リソース内容プレビュー

2. **リソース参照機能**
   - チャット内でのリソース参照
   - 動的リソース読み込み

## テスト戦略

### 単体テスト

```typescript
// __tests__/mcp-client.test.ts
import { MCPClientManager } from '@/lib/mcp-client';

describe('MCPClientManager', () => {
  let client: MCPClientManager;

  beforeEach(() => {
    client = new MCPClientManager();
  });

  test('should connect to MCP server', async () => {
    const config = {
      serverExecutable: 'node',
      serverArgs: ['test-server.js']
    };

    await expect(client.connect(config)).resolves.not.toThrow();
  });

  test('should list available tools', async () => {
    // テスト実装
  });
});
```

### 統合テスト

```typescript
// __tests__/integration/chat-mcp.test.ts
import { render, screen } from '@testing-library/react';
import ChatInterface from '@/components/ChatInterface';

describe('Chat + MCP Integration', () => {
  test('should display MCP tools after connection', async () => {
    render(<ChatInterface />);

    // MCP接続をシミュレート
    // ツール一覧の表示を確認
  });
});
```

## トラブルシューティング

### よくある問題と解決策

1. **MCP接続エラー**
   - サーバーパスの確認
   - 権限設定の確認
   - ログ出力の確認

2. **ツール実行エラー**
   - ツールパラメータの検証
   - タイムアウト設定の調整
   - エラーハンドリングの改善

3. **パフォーマンス問題**
   - コネクション再利用
   - レスポンスキャッシュ
   - バックグラウンド処理

### デバッグ設定

```typescript
// lib/debug.ts
export const DEBUG = {
  MCP_CLIENT: process.env.DEBUG_MCP_CLIENT === 'true',
  TOOL_CALLS: process.env.DEBUG_TOOL_CALLS === 'true',
  API_CALLS: process.env.DEBUG_API_CALLS === 'true'
};

export function debugLog(category: keyof typeof DEBUG, message: string, data?: any) {
  if (DEBUG[category]) {
    console.log(`[${category}] ${message}`, data);
  }
}
```

## パフォーマンス最適化

### 1. コネクション管理

```typescript
// lib/mcp-connection-pool.ts
export class MCPConnectionPool {
  private connections = new Map<string, MCPClientManager>();
  private maxConnections = 5;

  async getConnection(config: MCPClientConfig): Promise<MCPClientManager> {
    const key = this.getConfigKey(config);

    if (this.connections.has(key)) {
      return this.connections.get(key)!;
    }

    if (this.connections.size >= this.maxConnections) {
      await this.closeOldestConnection();
    }

    const client = new MCPClientManager();
    await client.connect(config);
    this.connections.set(key, client);

    return client;
  }

  private getConfigKey(config: MCPClientConfig): string {
    return `${config.serverExecutable}:${config.serverArgs?.join(',')}`;
  }

  private async closeOldestConnection(): Promise<void> {
    // LRU実装
  }
}
```

### 2. キャッシュ戦略

```typescript
// lib/mcp-cache.ts
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class MCPCache {
  private cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, data: T, ttlMs: number = 300000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  invalidate(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}
```

## セキュリティ実装

### 1. 入力検証

```typescript
// lib/validation.ts
import { z } from 'zod';

export const ToolCallSchema = z.object({
  name: z.string().min(1).max(100),
  arguments: z.record(z.any()).optional()
});

export const MCPConfigSchema = z.object({
  serverExecutable: z.string().min(1),
  serverArgs: z.array(z.string()).optional(),
  serverEnv: z.record(z.string()).optional()
});

export function validateToolCall(data: unknown) {
  return ToolCallSchema.parse(data);
}

export function validateMCPConfig(data: unknown) {
  return MCPConfigSchema.parse(data);
}
```

### 2. アクセス制御

```typescript
// lib/permissions.ts
export interface PermissionConfig {
  allowedTools: string[];
  allowedResources: string[];
  maxRequestsPerMinute: number;
}

export class PermissionManager {
  constructor(private config: PermissionConfig) {}

  canUseTool(toolName: string): boolean {
    return this.config.allowedTools.includes(toolName) ||
           this.config.allowedTools.includes('*');
  }

  canAccessResource(resourceUri: string): boolean {
    return this.config.allowedResources.some(pattern =>
      this.matchPattern(resourceUri, pattern)
    );
  }

  private matchPattern(str: string, pattern: string): boolean {
    // パターンマッチング実装
    return str.match(new RegExp(pattern.replace('*', '.*'))) !== null;
  }
}
```

## デプロイメント

### 1. Docker設定

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# フロントエンド依存関係
COPY package*.json ./
RUN npm ci --only=production

# MCPサーバー依存関係
COPY mcp-server/package*.json ./mcp-server/
RUN cd mcp-server && npm ci --only=production

# ソースコード
COPY . .

# ビルド
RUN npm run build
RUN npm run build:mcp

EXPOSE 3000

CMD ["npm", "start"]
```

### 2. 環境設定

```yaml
# docker-compose.yml
version: '3.8'
services:
  chat-client:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

### 3. 監視設定

```typescript
// lib/monitoring.ts
export class MonitoringService {
  static trackMCPConnection(serverId: string, success: boolean) {
    // メトリクス収集
  }

  static trackToolCall(toolName: string, duration: number, success: boolean) {
    // パフォーマンス追跡
  }

  static trackError(error: Error, context: string) {
    // エラー追跡
  }
}
```