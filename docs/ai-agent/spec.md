# AI Agent 仕様書

## 概要

Claude を API（Anthropic SDK 経由）としてのみ利用し、エージェント機能（思考ループ、ツール選択、メモリ管理、計画立案、実行制御など）はすべて自作する AI エージェントシステム。
将来的に MCP（Model Context Protocol）クライアントおよび独自の Skill 機構を追加し、外部リソース・能力を拡張可能とする。

## 設計方針

### コア原則

- **Claude は推論エンジンとしてのみ利用**: Anthropic が提供する Agent SDK / Computer Use / built-in Tool Use ループには依存しない。`messages.create` を中心とした素の API のみ使用する。
- **エージェントロジックは完全自作**: 思考ループ、ツール選択、エラーハンドリング、リトライ、計画、メモリ管理は本リポジトリ内で実装する。
- **拡張性**: MCP 規格に準拠した MCP クライアント機能を後付け可能にする。Skill 機構は独自定義しつつ、MCP と双方向に接続できる構造とする。
- **可観測性**: 全 LLM 呼び出し、ツール呼び出し、エージェント状態遷移はログ・トレース可能にする。

### 非目標 (Non-goals)

- Anthropic Agent SDK / `claude-agent-sdk` の利用
- Claude 以外の LLM プロバイダ対応（初期フェーズ）
- マルチエージェント協調（将来検討）

## システム構成

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                       Application UI                        │
│                  (Next.js / Chat or CLI)                    │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Agent Core                            │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐    │
│  │  Planner   │  │   Loop     │  │   State / Memory   │    │
│  └────────────┘  └────────────┘  └────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐      │
│  │              Tool Dispatcher                      │      │
│  └─────────┬───────────────────┬────────────────────┘      │
└────────────┼───────────────────┼───────────────────────────┘
             │                   │
             ▼                   ▼
   ┌──────────────────┐   ┌────────────────────┐
   │  Built-in Tools  │   │   Skill Runtime    │
   │  (fs, http, ...) │   │   (custom DSL)     │
   └──────────────────┘   └─────────┬──────────┘
                                    │
                                    ▼
                          ┌────────────────────┐
                          │   MCP Client       │
                          │  (Anthropic spec)  │
                          └─────────┬──────────┘
                                    │ JSON-RPC over stdio / HTTP
                                    ▼
                          ┌────────────────────┐
                          │   MCP Servers      │
                          │  (3rd-party / 自作) │
                          └────────────────────┘

           ┌────────────────────────────────────┐
           │     Anthropic Claude API (SDK)     │
           │  messages.create / stream           │
           └────────────────────────────────────┘
                          ▲
                          │ 呼び出しはすべて Agent Core 経由
```

### 技術スタック

| レイヤ | 採用技術 |
|--------|----------|
| ランタイム | Node.js 24 LTS / TypeScript |
| LLM SDK | `@anthropic-ai/sdk` (Claude API クライアントのみ) |
| MCP クライアント | 自作（または `@modelcontextprotocol/sdk` を低レベルで利用） |
| 通信 | JSON-RPC 2.0 (MCP)、HTTPS (Claude API) |
| UI | Next.js 14 App Router（既存ブログと統合） |
| ロギング | 構造化 JSON ログ（pino を想定） |

## コンポーネント設計

### 1. Claude API ラッパ (`lib/llm/claude.ts`)

- 役割: `@anthropic-ai/sdk` を最小限ラップし、エージェント実装からモデル詳細を隠蔽
- 提供 API:
  - `complete(messages, { model, tools?, system?, maxTokens, stream? })`
  - `stream(messages, ...)`: AsyncIterable でデルタを返す
- ツール定義は Anthropic の `tools` パラメータ形式に準拠（`name` / `description` / `input_schema`）
- リトライ・レート制限・トークン使用量計測を内蔵

### 2. Agent Core (`lib/agent/`)

#### 2.1 Loop (`loop.ts`)

エージェントの中核となる思考ループ。Anthropic の組み込みエージェント機能には依存せず、以下を自前で実装する。

```
while not done:
    response = claude.complete(state.messages, tools=registry.specs())
    state.appendAssistant(response)
    if response.stop_reason == "tool_use":
        for tool_use in response.tool_uses:
            result = dispatcher.invoke(tool_use.name, tool_use.input)
            state.appendToolResult(tool_use.id, result)
    elif response.stop_reason == "end_turn":
        done = True
    else:
        handle(stop_reason)
```

- 最大ターン数 / 最大トークン数のガード
- ツール失敗時のリカバリ戦略（再試行・別ツール選択をモデルに委ねる）
- ストリーミング中の中断 (`AbortSignal`) に対応

#### 2.2 Planner (`planner.ts`)（フェーズ 2）

- 複雑タスクを LLM に要求する前にサブゴール分解
- 出力フォーマットは JSON Schema で固定、`tool_choice: { type: "tool", name: "plan" }` を使用

#### 2.3 State / Memory (`state.ts`, `memory.ts`)

- 短期メモリ: 現在のメッセージ列・ツール結果
- 長期メモリ: ベクタストア or ファイルベース（フェーズ 2 で選択）
- コンテキスト圧縮: 一定トークンを超えたら旧ターンを要約

#### 2.4 Tool Dispatcher (`dispatcher.ts`)

- ツール名 → ハンドラのレジストリ
- 入力スキーマ検証 (`zod`)
- 実行結果の正規化（成功 / 失敗 / 構造化エラー）

### 3. ビルトインツール (`lib/tools/`)

初期実装で同梱するツール群:

| 名前 | 説明 |
|------|------|
| `fs.read` | ファイル読込（許可リスト下） |
| `fs.write` | ファイル書込（許可リスト下） |
| `shell.exec` | コマンド実行（許可リスト下） |
| `http.fetch` | HTTPS GET/POST |
| `search.web` | Web 検索（プロバイダ差し替え可） |

各ツールは Anthropic Tool Use の JSON Schema 仕様で `input_schema` を定義し、Skill / MCP のツールと同一インターフェースに揃える。

### 4. MCP クライアント (`lib/mcp/`)

#### 4.1 準拠仕様

- 参照: Model Context Protocol 公式仕様 (https://modelcontextprotocol.io)
- トランスポート: `stdio`（プロセス起動）/ `streamable-http`
- JSON-RPC 2.0 メッセージ: `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`, `notifications/*`

#### 4.2 クライアント機能

- サーバ起動・接続管理（stdio コマンド起動 / HTTP エンドポイント接続）
- `tools/list` で取得したツール定義を、Tool Dispatcher のレジストリへ動的登録
- `tools/call` の呼び出しを Tool Dispatcher が透過的にプロキシ
- リソース・プロンプトも統一インターフェースで Agent に供給

#### 4.3 設定 (`mcp.config.json` 例)

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

### 5. Skill 機構 (`lib/skills/`)

#### 5.1 Skill とは

- 「ある目的を達成するための手順 + ツール参照 + プロンプト断片」をパッケージ化した自作ユニット
- LLM プロンプトに動的に注入されるドキュメント + 実行可能ツールから成る
- Anthropic Claude.ai の "Skill" 概念に着想を得るが、本システムは独自実装

#### 5.2 Skill の構造

```
skills/
  <skill-name>/
    skill.yaml          # メタ情報・トリガー条件・MCP/ツール依存
    SKILL.md            # LLM に渡す人間可読な説明
    scripts/            # ローカル実行スクリプト（任意）
    prompts/            # プロンプトテンプレート（任意）
```

`skill.yaml` の例:

```yaml
name: stock-analyze
description: 銘柄コードを受け取り、株価と指標を取得して短いレポートを返す
triggers:
  keywords: ["株価", "stock", "銘柄"]
tools:
  - source: builtin
    name: http.fetch
  - source: mcp
    server: stock
    name: get_quote
  - source: mcp
    server: stock
    name: get_indicators
entrypoint: scripts/run.ts  # 任意。あれば優先的に呼び出される
```

#### 5.3 Skill ↔ MCP 接続

- Skill は MCP サーバが公開するツールを `tools[].source: mcp` として参照可能
- Skill 実行時、ローダが MCP クライアントを通じて該当ツールをディスパッチ
- これにより MCP サーバが追加されるだけで Skill の能力を後付け拡張できる

#### 5.4 Skill 選択

- 初期実装: ルールベース（キーワードマッチ）で候補を抽出し、LLM に候補を提示して 1 つ選ばせる
- フェーズ 2: ベクタ類似度で候補抽出

## 実行フロー例

ユーザー入力: 「7203（トヨタ自動車）の今日の株価を教えて」

```
1. UI → Agent Core: user message を投入
2. Agent Core: Skill Loader が "stock-analyze" を候補として抽出
3. Agent Core: SKILL.md を system prompt に追記し、tools として
   builtin と MCP("stock") のツールを登録
4. Claude API 呼び出し → tool_use("get_quote", {symbol: "7203.T"})
5. Tool Dispatcher → MCP Client → stock サーバへ JSON-RPC `tools/call`
6. 結果を tool_result として注入し、再度 Claude API 呼び出し
7. Claude が end_turn で自然文レポートを返す
8. UI へストリーミング表示
```

## セキュリティ

- ツール実行はホワイトリスト方式（パス、ホスト、コマンド）
- MCP サーバの起動は設定ファイルに明示されたものに限定
- Claude API キーはサーバサイドのみで保持（Next.js Server Action 経由で呼び出し）
- ログには API キー・個人情報を含めない

## フェーズ計画

| フェーズ | 内容 |
|----------|------|
| Phase 0 | リポジトリ構成・ディレクトリ初期化、Claude API ラッパ、シングルターン呼び出し |
| Phase 1 | Tool Dispatcher + ビルトインツール（fs.read / http.fetch）+ ループ完成 |
| Phase 2 | MCP クライアント（stdio）+ 既存 `mcp-server/stock-mcp` 接続 |
| Phase 3 | Skill ローダ・SKILL.md 注入・MCP ツール参照 |
| Phase 4 | UI（Next.js）/ ストリーミング / 長期メモリ |
| Phase 5 | Planner、ベクタ検索による Skill 選択、評価ベンチ |

## ディレクトリ構成（予定）

```
/app/ai-agent/
  page.tsx
  actions.ts
/lib/agent/
  loop.ts
  dispatcher.ts
  state.ts
  memory.ts
  planner.ts
/lib/llm/
  claude.ts
/lib/tools/
  fs.ts
  http.ts
  shell.ts
  search.ts
/lib/mcp/
  client.ts
  transport-stdio.ts
  transport-http.ts
  types.ts
/lib/skills/
  loader.ts
  selector.ts
  types.ts
/skills/
  <skill-name>/
    skill.yaml
    SKILL.md
/mcp.config.json
/docs/ai-agent/
  spec.md   ← 本ファイル
```

## オープン項目

- 長期メモリのバックエンド（SQLite / Postgres / ベクタ DB）の選定
- Skill 形式のバージョニング戦略
- マルチエージェント協調を導入する場合のメッセージバス
- 評価ベンチマーク（タスク成功率、ターン数、トークン消費）
