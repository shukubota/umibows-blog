# エンジニア向け英語学習システム 仕様書

## 概要

アジア（台湾・ベトナム）でソフトウェアエンジニアとして働くために必要な英語力を最短で習得するためのWebベース学習システム。技術的なコミュニケーションに特化し、Reading と Listening を重点的に強化する。

## 学習目的と対象者

### 主な学習目標

- **技術文書の読解力向上** - 仕様書、API ドキュメント、技術ブログの理解
- **会議でのリスニング力向上** - スクラムミーティング、技術議論、レビューへの参加
- **コードレビューでの英語力** - Pull Request のコメント理解と返答
- **国際チームでのコミュニケーション** - Slack、Zoom、メールでの効果的なやり取り

### 対象者

- 日本のソフトウェアエンジニア
- アジア圏での転職・出向を目指す技術者
- 英語での技術コミュニケーションが必要な開発者
- TOEIC 400-600点程度の中級学習者

## プロジェクト構造

```
/app/english-learning/
├── page.tsx                    # メインハブページ
├── layout.tsx                  # 共通レイアウト
├── components/
│   ├── Navigation.tsx          # 内部ナビゲーション
│   ├── ProgressTracker.tsx     # 学習進捗表示
│   ├── AudioPlayer.tsx         # 音声再生コンポーネント
│   └── common/                 # 共通UIコンポーネント
├── reading/                    # 技術文書読解
│   ├── page.tsx               # 読解練習メイン
│   ├── technical-docs/        # 技術文書コンテンツ
│   └── components/            # 読解専用コンポーネント
├── listening/                  # 技術会議リスニング
│   ├── page.tsx               # リスニング練習メイン
│   ├── meeting-scenarios/     # 会議音声コンテンツ
│   └── components/            # リスニング専用コンポーネント
├── vocabulary/                 # 技術英単語
│   ├── page.tsx               # 単語学習メイン
│   └── tech-words/            # 技術単語データベース
└── practice/                   # 総合練習
    ├── page.tsx               # 模擬面接・実践練習
    └── scenarios/             # シナリオ別練習
```

## コア機能

### 1. 技術文書読解 (Reading)

#### 1.1 技術文書の種類

- **API ドキュメント**: REST API、GraphQL の仕様書読解
- **技術仕様書**: PRD (Product Requirements Document) 理解
- **コードレビュー**: GitHub Pull Request コメントの理解
- **技術ブログ**: Medium、Dev.to の技術記事
- **リリースノート**: 新機能・変更内容の把握

#### 1.2 読解練習機能

- **段階的難易度**: 初級→中級→上級の技術文書
- **重要語彙ハイライト**: 技術用語の即座な意味確認
- **読解速度測定**: WPM (Words Per Minute) 計測
- **理解度テスト**: 内容確認のための選択問題
- **要約練習**: 文書の要点を英語でまとめる練習

#### 1.3 専門分野別コンテンツ

- **フロントエンド**: React、Vue.js、Angular の技術文書
- **バックエンド**: Node.js、Python、Java の API ドキュメント
- **インフラ**: AWS、Docker、Kubernetes の設定ガイド
- **データベース**: PostgreSQL、MongoDB のクエリ仕様
- **DevOps**: CI/CD、監視ツールの設定文書

### 2. 技術会議リスニング (Listening)

#### 2.1 会議シナリオ

- **デイリースクラム**: 進捗報告、ブロッカー共有
- **スプリント計画**: ストーリーポイント見積もり、タスク分割
- **技術レビュー**: アーキテクチャ議論、設計相談
- **インシデント対応**: 障害報告、原因分析、対策検討
- **1on1ミーティング**: キャリア相談、フィードバック

#### 2.2 リスニング練習機能

- **音声速度調整**: 0.7x、1.0x、1.2x での再生
- **字幕表示**: 英語字幕の段階的表示（単語→フレーズ→全文）
- **聞き取り穴埋め**: 重要な技術用語の聞き取り練習
- **会議メモ作成**: 聞いた内容を要点としてまとめる練習
- **応答練習**: 適切な質問・回答の選択練習

#### 2.3 アクセント対応

- **アメリカ英語**: シリコンバレー系企業の標準的な発音
- **イギリス英語**: ヨーロッパ系企業とのやり取り
- **インド英語**: オフショア開発でよく聞くアクセント
- **非ネイティブ**: 台湾、ベトナム、中国の同僚の英語

### 3. 技術英単語 (Vocabulary)

#### 3.1 分野別単語集

- **プログラミング基礎**: variable, function, class, method
- **Web開発**: endpoint, middleware, authentication, session
- **データベース**: query, index, transaction, migration
- **インフラ**: deployment, scaling, load balancer, monitoring
- **プロジェクト管理**: sprint, backlog, retrospective, stakeholder

#### 3.2 学習機能

- **スペースド・リピティション**: 忘却曲線に基づく復習スケジュール
- **文脈学習**: 実際のコード例、技術文書での使用例
- **発音練習**: Web Speech API を使用した発音チェック
- **コロケーション**: よく一緒に使われる単語の組み合わせ
- **同義語・類義語**: 同じ意味の技術用語の使い分け

### 4. 実践練習 (Practice)

#### 4.1 模擬面接

- **技術面接**: アルゴリズム問題の英語での説明
- **システム設計**: アーキテクチャの英語でのプレゼンテーション
- **行動面接**: STAR法を使った経験の説明
- **質疑応答**: 技術的な質問への適切な回答

#### 4.2 日常業務シミュレーション

- **コードレビュー**: 英語でのフィードバック作成・理解
- **技術相談**: 問題の英語での説明と解決策の議論
- **ドキュメント作成**: README、技術仕様書の英語での作成
- **チームコミュニケーション**: Slack でのやり取り練習

## 技術要件

### 必要な技術スタック

- **音声処理**: Web Audio API、Web Speech API
- **AI統合**: Anthropic Claude API (既存セットアップ活用)
- **状態管理**: React hooks、LocalStorage
- **スタイリング**: Tailwind CSS
- **音声ファイル**: MP3/WebM形式の圧縮音声

### データ構造

```typescript
// 学習コンテンツの型定義
interface TechnicalDocument {
  id: string;
  title: string;
  category: "api" | "spec" | "blog" | "review";
  difficulty: "beginner" | "intermediate" | "advanced";
  content: string;
  vocabularyHighlights: string[];
  comprehensionQuestions: Question[];
  estimatedReadingTime: number;
}

interface ListeningContent {
  id: string;
  title: string;
  scenario: "scrum" | "review" | "incident" | "planning";
  audioUrl: string;
  transcript: string;
  exercises: ListeningExercise[];
  speakers: Speaker[];
  duration: number;
}

interface TechVocabulary {
  word: string;
  definition: string;
  category: string;
  difficulty: number;
  examples: CodeExample[];
  pronunciation: string;
  collocations: string[];
}
```

### パフォーマンス要件

- **音声ファイル**: 遅延読み込み、プリロード機能
- **コンテンツ**: セクション別の分割読み込み
- **オフライン対応**: Service Worker による重要コンテンツのキャッシュ
- **モバイル最適化**: 通勤時間での学習を想定

## 学習効果測定

### 進捗指標

- **読解速度の向上**: 技術文書のWPM測定
- **理解度の改善**: 読解テストの正答率推移
- **語彙力の拡大**: 習得した技術用語数
- **リスニング正答率**: 会議内容の理解度

### 学習継続支援

- **学習ストリーク**: 連続学習日数
- **週次目標**: カスタマイズ可能な学習目標
- **達成バッジ**: 分野別の習得レベル表示
- **学習時間記録**: 日別・週別の学習時間追跡

## 成功指標

- **学習継続率**: 4週間以上の継続学習者の割合
- **スキル向上**: 読解速度・理解度の具体的な改善
- **実務応用**: 学習内容の実際の業務での活用
- **転職成功**: アジア圏での転職達成者数
