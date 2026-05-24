# AI Agent 仕様書

本ドキュメントは「自作 AI エージェント」の **概要 / 技術選定 / 基本設計 / 詳細設計 / フェーズ計画** を一つにまとめた仕様書である。

---

## 1. 概要

Claude を API（Anthropic SDK 経由）としてのみ利用し、エージェント機能（思考ループ、ツール選択、メモリ管理、計画立案、実行制御など）はすべて自作する AI エージェントシステム。
将来的に MCP（Model Context Protocol）クライアントおよび独自の Skill 機構を追加し、外部リソース・能力を拡張可能とする。

### 1.1 設計原則

- **Claude は推論エンジンとしてのみ利用**: Anthropic が提供する Agent SDK / Computer Use / built-in Tool Use ループには依存しない。`messages.create` を中心とした素の API のみ使用する。
- **エージェントロジックは完全自作**: 思考ループ、ツール選択、エラーハンドリング、リトライ、計画、メモリ管理は本リポジトリ内で実装する。
- **拡張性**: MCP 規格に準拠した MCP クライアント機能を後付け可能にする。Skill 機構は独自定義しつつ、MCP と双方向に接続できる構造とする。
- **可観測性**: 全 LLM 呼び出し、ツール呼び出し、エージェント状態遷移はログ・トレース可能にする。
- **段階的構築**: Phase 0 → 5 の順で薄く積み上げ、各フェーズで実動作する状態を保つ。

### 1.2 非目標 (Non-goals)

- Anthropic Agent SDK / `claude-agent-sdk` の利用
- Claude 以外の LLM プロバイダ対応（初期フェーズ）
- マルチエージェント協調（将来検討）
- 完全自律な長時間タスク（最大ターン数で必ず制約）

### 1.3 用語

| 用語 | 意味 |
|------|------|
| Agent Core | 思考ループ・ツール呼び出し・状態管理を司る本体 |
| Tool | エージェントが呼び出せる外部機能。`builtin` / `mcp` / `skill` の 3 出自 |
| MCP | Model Context Protocol。Anthropic 公開の LLM ツール接続規格 |
| Skill | 「目的 + プロンプト断片 + ツール参照」をパッケージ化した独自ユニット |
| Turn | LLM 呼び出し 1 回 + ツール呼び出し N 回の組 |

---

## 2. 技術選定

### 2.1 採用技術と選定理由

| レイヤ | 採用 | 主な理由 | 代替案と却下理由 |
|--------|------|----------|------------------|
| ランタイム | **Node.js 24 LTS** | 既存リポジトリが Next.js 14 / TypeScript ベース。Vercel デプロイと整合 | Python (FastAPI)：再実装コスト、既存資産と分断 |
| 言語 | **TypeScript 5.x (strict)** | 型安全 + 既存コードと統一 | JavaScript：ツール定義の型安全性が落ちる |
| LLM SDK | **`@anthropic-ai/sdk` (最新)** | Anthropic 公式・低レベル `messages.create` を直接利用可能 | `claude-agent-sdk`：自作の方針に反する。LangChain：ブラックボックス化 |
| LLM モデル | **Claude Opus 4.7 (主) / Sonnet 4.6 (副)** | ツール選択精度と日本語品質。コスト最適化のため副モデルを併用 | Haiku：複雑タスクで精度不足 |
| MCP SDK | **`@modelcontextprotocol/sdk` を低レベル利用** | Anthropic 規格準拠を担保しつつ、上位ロジックは自作 | 完全自作：プロトコル更新追随コストが高い |
| バリデーション | **Zod 3.x** | TypeScript 推論と密接、JSON Schema 変換が容易 | Yup：型推論が弱い。手書き：保守困難 |
| ロギング | **pino** | 構造化 JSON、低オーバヘッド、Next.js でも実績多 | winston：パフォーマンス劣後 |
| トレース | **OpenTelemetry (任意導入)** | 標準。後付け可能 | 独自スパン：可搬性なし |
| HTTP クライアント | **fetch (Node 標準)** | 追加依存なし | axios/got：不要 |
| プロセス起動 (MCP stdio) | **`node:child_process` (spawn)** | 標準 API、依存最小 | execa：依存追加見合わず |
| 永続層（短期） | **ファイル / SQLite (better-sqlite3)** | ローカル運用、軽量 | Postgres：初期は過剰 |
| 永続層（長期メモリ） | **未確定（Phase 4 で決定）。候補: Postgres + pgvector / SQLite + sqlite-vss / Upstash Vector** | フェーズで切り替えやすい構造にしておく | — |
| ベクタ埋め込み | **Voyage AI / OpenAI text-embedding-3-small（要件により選定）** | Claude と独立、コスト最適 | Claude embeddings：未提供 |
| UI | **Next.js 14 App Router + Server Actions** | 既存ブログと統合 | 別途 SPA：運用 2 系統化 |
| ストリーミング | **Server-Sent Events (SSE) / ReadableStream** | Next.js Server Action と相性良 | WebSocket：不要な双方向性 |
| 設定ファイル | **`mcp.config.json` + `agent.config.ts`** | JSON は人間/ツール両用、TS は型付き設定 | YAML：JSON Schema 連携が手間 |
| パッケージ管理 | **npm (既存準拠)** | リポジトリ既存設定維持 | pnpm/bun：移行コスト |
| テスト | **Vitest + msw** | 高速、Next.js と親和 | Jest：起動が遅い |

### 2.2 採用しないもの（明示）

- **LangChain / LlamaIndex**: 抽象が厚く、ブラックボックス化する。自作方針と衝突。
- **LangGraph**: フレームワーク自体は柔軟（ノード=関数で書ける）でカスタマイズ性は高い。採用しない理由は別にある:
  1. **自作要件との衝突**: 本プロジェクトの主旨が「思考ループ・状態遷移を自作する」こと。LangGraph はまさにその領域を肩代わりするため、要件と直接ぶつかる。
  2. **MCP / Skill との責務重複**: 本システムの差別化点は MCP クライアントと独自 Skill 機構。LangGraph はそこに概念を持たず、結局アダプタを自作する必要があり、依存だけ増える。
  3. **TS 版の成熟度**: 主流は Python (`langgraph`)。TypeScript (`@langchain/langgraph`) はドキュメント・周辺機能で見劣りする時期があるため、本プロジェクトの TS 一本化方針とリスクが噛み合わない。
  4. **依存ツリーの重さ**: `@langchain/core` を含む推移依存が大きく、軽量に保ちたい方針と合わない。
  5. **規模感**: 想定するツール数・ターン数では、グラフ DSL より素のループの方が透明で読みやすい。
  > 将来 Planner が複雑化し、分岐・並行・チェックポイントが本格的に必要になった場合は、`lib/agent/loop.ts` だけを LangGraph に差し替える余地を残す（疎結合維持）。
- **Anthropic Agent SDK / Computer Use**: ループを自作する方針と衝突。
- **OpenAI Functions / Assistants API**: 本プロジェクトでは Claude のみ。

### 2.3 依存パッケージ（予定）

```jsonc
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.x",
    "@modelcontextprotocol/sdk": "^1.x",
    "zod": "^3.x",
    "pino": "^9.x",
    "better-sqlite3": "^11.x",
    "yaml": "^2.x"
  },
  "devDependencies": {
    "vitest": "^2.x",
    "msw": "^2.x",
    "@types/better-sqlite3": "^7.x"
  }
}
```

---

## 3. 基本設計

### 3.1 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                       Application UI                        │
│                  (Next.js / Chat or CLI)                    │
└─────────────────────────────┬───────────────────────────────┘
                              │ Server Action / SSE
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Agent Core                            │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐    │
│  │  Planner   │  │   Loop     │  │   State / Memory   │    │
│  └────────────┘  └────────────┘  └────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐      │
│  │              Tool Dispatcher                      │      │
│  └─────────┬───────────────┬───────────────┬────────┘      │
└────────────┼───────────────┼───────────────┼───────────────┘
             │               │               │
             ▼               ▼               ▼
   ┌──────────────────┐ ┌──────────────┐ ┌────────────────────┐
   │  Built-in Tools  │ │ Skill Runtime│ │   MCP Client       │
   │  (fs, http, ...) │ │ (custom DSL) │ │  (Anthropic spec)  │
   └──────────────────┘ └──────┬───────┘ └────────┬───────────┘
                               │                  │ JSON-RPC
                               └───────► uses ────┤
                                                  ▼
                                        ┌────────────────────┐
                                        │   MCP Servers      │
                                        └────────────────────┘

      ┌────────────────────────────────────┐
      │     Anthropic Claude API (SDK)     │
      │  messages.create / stream           │
      └────────────────────────────────────┘
```

### 3.2 レイヤと責務

| レイヤ | 責務 | 公開 I/F |
|--------|------|----------|
| UI | ユーザ入力受付・ストリーミング表示 | HTTP / Server Action |
| Agent Core | 思考ループ・ツール呼び分け・状態保持 | `runAgent(input, opts)` |
| Tool Dispatcher | ツール名 → ハンドラの解決・実行 | `invoke(name, input)` |
| LLM Wrapper | Claude API 呼び出し抽象化 | `complete()` / `stream()` |
| MCP Client | MCP サーバとの接続・呼び出し | `listTools()` / `callTool()` |
| Skill Runtime | Skill ローダ・選択器・実行 | `loadSkill()` / `selectSkill()` |
| Memory | 短期/長期メモリ | `append()` / `recall()` |

### 3.3 主要ユースケース

1. **シングルターン Q&A**: ツール不要のテキスト応答（Phase 0 で動作）
2. **ツール利用タスク**: ファイル読み + Web fetch + 応答生成（Phase 1）
3. **MCP 連携タスク**: 既存 `stock-mcp` を呼び出して株価レポート生成（Phase 2）
4. **Skill 経由タスク**: 「株価分析」Skill が MCP ツール群をオーケストレーションして実行（Phase 3）

### 3.4 制約と前提

- API キーはサーバサイド環境変数 `ANTHROPIC_API_KEY` のみで保持
- 最大ターン数: デフォルト 20、設定で上書き可
- 最大入力トークン: モデルコンテキスト上限の 80%
- 1 セッションあたり推定上限コストをログに記録（運用予防策）

### 3.5 非機能要件

| 項目 | 要件 |
|------|------|
| 応答開始レイテンシ | < 2 秒（ストリーミング開始まで） |
| ツール呼び出しタイムアウト | デフォルト 30 秒、設定で変更可 |
| エラー再試行 | API/ネットワーク系のみ指数バックオフで最大 3 回 |
| ログ保存 | 7 日（ローカル開発時はファイルローテーション） |
| セキュリティ | ツール許可リスト / API キー漏洩防止 / シークレットマスキング |

### 3.6 セッション基本フロー（シーケンス）

```
User → UI : "7203の株価を教えて"
UI → Agent : runAgent({input, sessionId})
Agent → Memory : load(sessionId)
Agent → SkillSelector : select(input)        ; stock-analyze 検出
Agent → Claude : messages.create(messages, tools=[get_quote, ...])
Claude → Agent : stop_reason=tool_use(get_quote, {symbol:"7203.T"})
Agent → Dispatcher : invoke("get_quote", {...})
Dispatcher → MCPClient : tools/call("get_quote")
MCPClient → MCPServer : JSON-RPC request
MCPServer → MCPClient : result
Agent → Claude : messages.create(... + tool_result)
Claude → Agent : stop_reason=end_turn (text)
Agent → UI : stream text
Agent → Memory : save(sessionId, turns)
```

---

## 4. 詳細設計

### 4.1 ディレクトリ構成

```
/app/ai-agent/
  page.tsx                     ; チャット UI
  actions.ts                   ; Server Action (runAgent)
/lib/agent/
  loop.ts                      ; 思考ループ
  dispatcher.ts                ; Tool Dispatcher
  state.ts                     ; メッセージ列の管理
  memory.ts                    ; 長期メモリ I/F
  planner.ts                   ; Planner (Phase 5)
  errors.ts                    ; エラー型
  types.ts                     ; 共有型
/lib/llm/
  claude.ts                    ; Anthropic SDK ラッパ
  prompt.ts                    ; system prompt 構築
/lib/tools/
  registry.ts                  ; builtin 登録
  fs.ts
  http.ts
  shell.ts
  search.ts
/lib/mcp/
  client.ts                    ; MCP クライアント
  transport-stdio.ts
  transport-http.ts
  config.ts                    ; mcp.config.json ローダ
  types.ts
/lib/skills/
  loader.ts
  selector.ts
  runner.ts
  types.ts
/skills/
  <skill-name>/
    skill.yaml
    SKILL.md
    scripts/                   ; 任意
/mcp.config.json
/agent.config.ts
/docs/ai-agent/
  spec.md                      ← 本ファイル
```

### 4.2 型定義（抜粋）

#### 4.2.1 メッセージ・ツール

```ts
// lib/agent/types.ts
export type Role = "user" | "assistant" | "tool";

export interface TextBlock { type: "text"; text: string; }
export interface ToolUseBlock {
  type: "tool_use"; id: string; name: string; input: unknown;
}
export interface ToolResultBlock {
  type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean;
}
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface Message { role: Role; content: ContentBlock[]; }

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: JsonSchema;        // Anthropic Tool Use 互換
  source: "builtin" | "mcp" | "skill";
  origin?: { server?: string; skill?: string };
}

export interface ToolHandler {
  invoke(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolResult {
  ok: boolean;
  content: string;                  // Claude に渡す文字列（JSON or 自然文）
  raw?: unknown;                    // ログ・デバッグ用
  error?: { code: string; message: string };
}

export interface ToolContext {
  sessionId: string;
  signal: AbortSignal;
  logger: Logger;
}
```

#### 4.2.2 セッション・状態

```ts
export interface SessionState {
  sessionId: string;
  messages: Message[];
  tokensUsed: { input: number; output: number };
  turnCount: number;
  startedAt: number;
  metadata: Record<string, unknown>;
}

export interface RunOptions {
  model?: string;                   // "claude-opus-4-7"
  maxTurns?: number;                // default 20
  maxTokens?: number;                // per call
  tools?: ToolSpec[];               // 明示注入
  skillHints?: string[];            // セレクタにヒントを与える
  systemPrompt?: string;            // 末尾に追記する追加指示
  signal?: AbortSignal;
}
```

### 4.3 Claude API ラッパ (`lib/llm/claude.ts`)

#### 4.3.1 関数シグネチャ

```ts
export interface CompleteParams {
  model: string;
  system: string;
  messages: Message[];
  tools?: ToolSpec[];
  maxTokens: number;
  temperature?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface CompleteResult {
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  content: ContentBlock[];
  usage: { input_tokens: number; output_tokens: number };
}

export async function complete(p: CompleteParams): Promise<CompleteResult>;
export function stream(p: CompleteParams): AsyncIterable<StreamEvent>;
```

#### 4.3.2 振る舞い

- `tools` が与えられた場合は Anthropic の `tools` パラメータへ変換（`source` は内部メタとして剥がす）
- レート制限 (429) は指数バックオフで最大 3 回再試行
- `usage` を `SessionState.tokensUsed` に加算
- ロガーに `model`, `usage`, `latencyMs`, `stopReason` を出力
- API キーは `process.env.ANTHROPIC_API_KEY` のみ参照、無ければ起動時に失敗

### 4.4 思考ループ (`lib/agent/loop.ts`)

#### 4.4.1 擬似コード

```ts
export async function runAgent(input: string, opts: RunOptions = {}) {
  const state = await loadOrCreateSession(opts.sessionId);
  state.messages.push({ role: "user", content: [{ type: "text", text: input }] });

  const tools = await collectTools(opts);             // builtin + mcp + skill
  const systemPrompt = buildSystemPrompt(opts, tools);

  for (let turn = 0; turn < (opts.maxTurns ?? 20); turn++) {
    state.turnCount = turn + 1;

    const res = await llm.complete({
      model: opts.model ?? "claude-opus-4-7",
      system: systemPrompt,
      messages: state.messages,
      tools,
      maxTokens: opts.maxTokens ?? 4096,
      signal: opts.signal,
    });

    state.messages.push({ role: "assistant", content: res.content });
    accumulateUsage(state, res.usage);

    if (res.stopReason === "end_turn") return finalize(state);
    if (res.stopReason === "tool_use") {
      const toolUses = res.content.filter(isToolUse);
      const results = await Promise.all(
        toolUses.map((tu) => dispatcher.invoke(tu.name, tu.input, { ... }))
      );
      state.messages.push({
        role: "user",
        content: toolUses.map((tu, i) => ({
          type: "tool_result",
          tool_use_id: tu.id,
          content: results[i].content,
          is_error: !results[i].ok,
        })),
      });
      continue;
    }
    throw new AgentError("UnsupportedStopReason", res.stopReason);
  }
  throw new AgentError("MaxTurnsExceeded");
}
```

#### 4.4.2 例外と中断

- `signal.aborted` を毎ターン先頭で確認 → `AgentError("Aborted")`
- ツールがタイムアウト → `tool_result` に `is_error: true` を入れて続行（モデルにリカバリさせる）
- LLM 呼び出しの致命的失敗 → セッションを保存して例外を上位へ

### 4.5 Tool Dispatcher (`lib/agent/dispatcher.ts`)

#### 4.5.1 仕様

- `register(spec: ToolSpec, handler: ToolHandler)`
- `invoke(name, input, ctx)`:
  1. レジストリから `spec` を引く（無ければ `ToolNotFound`）
  2. `input_schema` を Zod に変換してバリデーション
  3. `signal` 付きで `handler.invoke(input, ctx)` を呼び出し、30s タイムアウト
  4. 結果を `ToolResult` に正規化（失敗時は `is_error` セット）
  5. ログに `{ tool, latencyMs, ok, bytes }` を出力（input/output は要約のみ）

#### 4.5.2 名前空間

- ビルトイン: `fs.read`, `fs.write`, `http.fetch`, `shell.exec`, `search.web`
- MCP: `mcp__<server>__<tool>` （Claude Code の慣習に合わせる）
- Skill: `skill__<skill>__<step>`（Skill が公開する場合）

### 4.6 ビルトインツール (`lib/tools/*`)

| ツール | input | output | 制約 |
|--------|-------|--------|------|
| `fs.read` | `{path:string, maxBytes?:number}` | ファイル内容（utf-8） | 許可ルート配下のみ |
| `fs.write` | `{path:string, content:string}` | `{bytes:number}` | 許可ルート配下のみ |
| `http.fetch` | `{url, method?, headers?, body?, timeoutMs?}` | `{status, headers, body}` | 許可ホストリスト |
| `shell.exec` | `{cmd:string, args:string[], cwd?:string}` | `{exitCode, stdout, stderr}` | 許可コマンドリスト |
| `search.web` | `{query, topK?}` | `{results: {title,url,snippet}[]}` | プロバイダ抽象 |

許可リストは `agent.config.ts` で定義する。

### 4.7 MCP クライアント (`lib/mcp/*`)

#### 4.7.1 準拠仕様

- 参照: Model Context Protocol 公式仕様
- JSON-RPC 2.0 over **stdio** (Phase 2) → **streamable HTTP** (Phase 4)
- 実装メソッド: `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`, `notifications/initialized`, `notifications/tools/list_changed`

#### 4.7.2 クライアント I/F

```ts
export interface McpClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  listTools(): Promise<ToolSpec[]>;       // 内部で source:"mcp" を付与
  callTool(name: string, input: unknown): Promise<ToolResult>;
  listResources(): Promise<Resource[]>;
  readResource(uri: string): Promise<string>;
}

export function createClient(config: McpServerConfig): McpClient;
```

#### 4.7.3 設定ファイル `mcp.config.json`

```json
{
  "servers": {
    "filesystem": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    },
    "stock": {
      "transport": "stdio",
      "command": "node",
      "args": ["./mcp-server/stock-mcp/dist/index.js"]
    }
  }
}
```

#### 4.7.4 ライフサイクル

```
起動: spawn(command, args) → write {jsonrpc, method:"initialize"} → 受信 → notifications/initialized
利用: tools/list → tools/call ... (随時)
終了: close → 子プロセス SIGTERM → 5s 後 SIGKILL
障害: stderr を logger.warn、再起動はリクエスト時に on-demand
```

### 4.8 Skill 機構 (`lib/skills/*`, `skills/`)

#### 4.8.1 ディレクトリ規約

```
skills/<skill-name>/
  skill.yaml      ; メタ情報・依存ツール・トリガ
  SKILL.md        ; LLM に注入する人間可読な説明
  scripts/        ; 任意（プログラム的 Skill）
  prompts/        ; 任意
```

#### 4.8.2 `skill.yaml` スキーマ

```yaml
name: stock-analyze                  # 必須・kebab-case
version: 0.1.0
description: 銘柄コードを受け取り株価と指標を取得して短いレポートを返す
triggers:
  keywords: ["株価", "stock", "銘柄"]
  schema: # 任意。Planner が JSON 抽出するための形
    type: object
    properties:
      symbol: { type: string }
    required: [symbol]
tools:
  - { source: builtin, name: http.fetch }
  - { source: mcp, server: stock, name: get_quote }
  - { source: mcp, server: stock, name: get_indicators }
prompt: SKILL.md                     # 既定値
entrypoint: scripts/run.ts           # 任意。あれば優先
```

#### 4.8.3 ローダ・セレクタ・ランナー

- `loader.ts`: `skills/` を走査し `skill.yaml` を Zod でバリデート、`Skill` オブジェクト化
- `selector.ts`:
  - Phase 3: `triggers.keywords` を入力に対し正規表現マッチ → 候補抽出 → LLM に「最適な Skill を 1 つ選べ」と問う
  - Phase 5: ベクタ類似度（埋め込み）で候補抽出
- `runner.ts`:
  - `entrypoint` があれば Node.js で `dynamic import` し、`run({input, tools, llm, logger})` を呼ぶ
  - 無ければ `SKILL.md` を system prompt 末尾へ注入し、宣言ツールだけを公開して通常ループへ委譲

#### 4.8.4 Skill ↔ MCP の接続

- `tools[].source: mcp` を見つけたら `McpClient` 経由のハンドラを Dispatcher に動的登録
- Skill 終了時に動的登録ツールは外す（メモリリーク・誤露出防止）

### 4.9 メモリ (`lib/agent/memory.ts`)

| 種別 | 保存先 (初期) | 内容 |
|------|---------------|------|
| 短期 | プロセスメモリ | 現セッションの `Message[]`、ツール結果 |
| 中期 | SQLite (`./.data/agent.db`) | セッション履歴・要約・使用トークン |
| 長期 | (Phase 4 で確定) ベクタ DB | 過去会話の埋め込み・知識スニペット |

I/F:

```ts
export interface Memory {
  load(sessionId: string): Promise<SessionState | null>;
  save(state: SessionState): Promise<void>;
  recall(query: string, k?: number): Promise<MemoryHit[]>;   // Phase 4+
  summarizeIfNeeded(state: SessionState): Promise<void>;     // tokens 超過時に旧ターン要約
}
```

### 4.10 設定 (`agent.config.ts`)

```ts
import type { AgentConfig } from "@/lib/agent/types";

const config: AgentConfig = {
  model: { primary: "claude-opus-4-7", secondary: "claude-sonnet-4-6" },
  loop: { maxTurns: 20, maxTokens: 4096 },
  tools: {
    fs: { roots: ["./workspace"] },
    http: { allowHosts: ["api.example.com"] },
    shell: { allowCmds: ["git", "ls", "cat"] },
  },
  logging: { level: "info", redact: ["ANTHROPIC_API_KEY"] },
  memory: { sqlitePath: "./.data/agent.db" },
};

export default config;
```

### 4.11 ロギング・観測

- すべての LLM/ツール呼び出しは `traceId, sessionId, turn` を含む構造化ログ
- 機密フィールドは pino の `redact` でマスク
- 失敗時のスタックトレース・入力サンプルを保存
- 任意で OTLP エクスポータ追加可能

### 4.12 エラーモデル

| クラス | 意味 | 上位への振る舞い |
|--------|------|------------------|
| `AgentError("Aborted")` | クライアント中断 | 200 / partial 結果 |
| `AgentError("MaxTurnsExceeded")` | ループ上限 | 500 / 部分結果 + メッセージ |
| `ToolError(code, message)` | ツール失敗 | `tool_result.is_error` でモデルに通知し継続 |
| `LlmError(retryable, cause)` | API 失敗 | retryable なら指数バックオフ |

### 4.13 セキュリティ詳細

- API キーは `process.env` のみ・クライアントへ漏洩させない
- `fs.*` は許可ルート配下を `path.resolve` で正規化し祖先一致チェック
- `http.fetch` は `URL` で正規化し許可ホストの完全一致 or サフィックス一致
- `shell.exec` は `args` を必ず配列で受け、`shell:true` で起動しない（コマンドインジェクション防止）
- MCP サーバの起動コマンドは `mcp.config.json` のみから採用、UI 入力では決定させない
- ログのリダクション対象に API キー、Bearer トークン、Cookie を含める

### 4.14 テスト戦略

| レイヤ | テスト |
|--------|--------|
| LLM Wrapper | msw で `messages.create` をモック、再試行・ストリームを単体テスト |
| Dispatcher | スキーマ違反・タイムアウト・例外伝搬の単体テスト |
| ビルトインツール | 許可リスト違反、正常系、エラー系 |
| MCP Client | スタブサーバ（stdio）で `initialize` / `tools/list` / `tools/call` 往復テスト |
| Skill | YAML パース、セレクタ、`entrypoint` あり/なし両系統 |
| 統合 | 「ユーザ入力 → ツール 1 回 → 終了」の e2e（mock LLM） |

---

## 5. フェーズ計画

| フェーズ | 目標 | 主な成果物 | 受け入れ基準 |
|----------|------|-----------|--------------|
| **Phase 0** | 骨組み + シングルターン応答 | `lib/llm/claude.ts`、`lib/agent/loop.ts` 最小版、`/app/ai-agent` 雛形 | 「こんにちは」に応答が返る |
| **Phase 1** | ループ + ビルトインツール | Dispatcher、`fs.read` / `http.fetch`、Zod 検証 | 「URL を fetch して要約」が動く |
| **Phase 2** | MCP クライアント (stdio) | `lib/mcp/`、`mcp.config.json`、`stock-mcp` 連携 | 「7203 の株価」が MCP 経由で返る |
| **Phase 3** | Skill 機構 | `lib/skills/`、`skills/stock-analyze/` | Skill 経由で同じタスクが SKILL.md + MCP で実行される |
| **Phase 4** | UI 強化 + メモリ | ストリーミング、SQLite 永続、要約圧縮 | 長会話で context が破綻しない |
| **Phase 5** | Planner + 評価 | `planner.ts`、ベクタ検索 Skill 選択、ベンチ | タスク成功率を継続計測できる |

---

## 6. オープン項目

- 長期メモリ DB の最終選定（pgvector vs sqlite-vss vs Upstash Vector）
- Skill 形式のバージョニング・互換戦略
- マルチエージェント協調を導入する場合のメッセージバス
- 評価ベンチマーク（タスク成功率、ターン数、トークン消費）の自動化基盤
- MCP の HTTP transport 対応時期（Phase 2 stdio 完了後）
