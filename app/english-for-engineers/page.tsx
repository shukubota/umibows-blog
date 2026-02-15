'use client';

import React, { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, PlayIcon, PauseIcon } from '@heroicons/react/24/outline';

interface DialogueLine {
  speaker: string;
  text: string;
  japanese: string;
  role: 'engineer' | 'manager' | 'client' | 'teammate';
}

interface Scenario {
  id: string;
  title: string;
  situation: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  dialogue: DialogueLine[];
  keyPhrases: Array<{
    english: string;
    japanese: string;
    usage: string;
  }>;
}

const scenarios: Scenario[] = [
  {
    id: 'daily-standup',
    title: 'Daily Standup Meeting',
    situation: 'チームの朝会でのやりとり',
    difficulty: 'Beginner',
    dialogue: [
      {
        speaker: 'Scrum Master (Sarah)',
        text: "Good morning everyone! Let's start our daily standup. Hiroshi, would you like to go first?",
        japanese: '皆さん、おはようございます！日次スタンドアップを始めましょう。ヒロシさん、最初にお願いできますか？',
        role: 'manager'
      },
      {
        speaker: 'Hiroshi (Backend Engineer)',
        text: "Sure! Yesterday I completed the user authentication API. Today I'm working on the payment integration. No blockers so far.",
        japanese: 'はい！昨日はユーザー認証APIを完了しました。今日は決済統合に取り組んでいます。今のところブロッカーはありません。',
        role: 'engineer'
      },
      {
        speaker: 'Mei (Frontend Engineer)',
        text: "Thanks Hiroshi! Yesterday I finished the login page UI. Today I'll integrate it with Hiroshi's API. I have a question about the error handling though.",
        japanese: 'ありがとう、ヒロシさん！昨日はログインページのUIを完成させました。今日はヒロシさんのAPIと統合します。ただ、エラーハンドリングについて質問があります。',
        role: 'engineer'
      },
      {
        speaker: 'Hiroshi',
        text: "Sure, let's discuss that after the standup. I can walk you through the error response format.",
        japanese: 'もちろんです。スタンドアップ後に話しましょう。エラーレスポンスの形式について説明できます。',
        role: 'engineer'
      }
    ],
    keyPhrases: [
      {
        english: "No blockers so far",
        japanese: "今のところブロッカーはない",
        usage: "進捗報告で問題がないことを伝える時"
      },
      {
        english: "Let's discuss that after the standup",
        japanese: "スタンドアップ後に話しましょう",
        usage: "会議中に詳細な議論を後回しにする時"
      },
      {
        english: "I can walk you through...",
        japanese: "...について説明できます",
        usage: "何かを詳しく説明する意思を示す時"
      }
    ]
  },
  {
    id: 'code-review',
    title: 'Code Review Discussion',
    situation: 'コードレビューでのフィードバック',
    difficulty: 'Intermediate',
    dialogue: [
      {
        speaker: 'Takeshi (Senior Engineer)',
        text: "I've reviewed your pull request. Overall it looks good, but I have a few suggestions for improvement.",
        japanese: 'プルリクエストをレビューしました。全体的に良いですが、改善のための提案がいくつかあります。',
        role: 'engineer'
      },
      {
        speaker: 'Linda (Junior Engineer)',
        text: "Thanks for the review! I'm open to feedback. What would you like me to change?",
        japanese: 'レビューありがとうございます！フィードバックは歓迎です。何を変更すれば良いでしょうか？',
        role: 'engineer'
      },
      {
        speaker: 'Takeshi',
        text: "First, consider extracting this logic into a separate function for better readability. Also, we should add some error handling here.",
        japanese: 'まず、可読性を向上させるために、このロジックを別の関数に抽出することを検討してください。また、ここにエラーハンドリングを追加すべきです。',
        role: 'engineer'
      },
      {
        speaker: 'Linda',
        text: "That makes sense. Should I also add unit tests for the new function?",
        japanese: 'それは理にかなっていますね。新しい関数にユニットテストも追加すべきでしょうか？',
        role: 'engineer'
      },
      {
        speaker: 'Takeshi',
        text: "Absolutely! That would be great. Let me know if you need help with the test setup.",
        japanese: 'もちろんです！それは素晴らしいですね。テストセットアップで手助けが必要でしたら教えてください。',
        role: 'engineer'
      }
    ],
    keyPhrases: [
      {
        english: "I'm open to feedback",
        japanese: "フィードバックは歓迎です",
        usage: "建設的な批判を受け入れる意思を示す時"
      },
      {
        english: "Consider extracting this logic",
        japanese: "このロジックを抽出することを検討してください",
        usage: "リファクタリングを提案する時"
      },
      {
        english: "That makes sense",
        japanese: "それは理にかなっています",
        usage: "相手の提案に同意する時"
      }
    ]
  },
  {
    id: 'client-meeting',
    title: 'Client Requirements Discussion',
    situation: 'クライアントとの要件定義',
    difficulty: 'Advanced',
    dialogue: [
      {
        speaker: 'Mr. Johnson (Client)',
        text: "We need to discuss the timeline for the new feature. Our marketing team is pushing for an earlier release date.",
        japanese: '新機能のタイムラインについて話し合う必要があります。マーケティングチームがより早いリリース日を求めています。',
        role: 'client'
      },
      {
        speaker: 'Yuki (Project Manager)',
        text: "I understand the urgency. However, rushing the development might compromise the quality. Let me explain our current estimation.",
        japanese: '緊急性は理解しています。しかし、開発を急ぐと品質に影響が出る可能性があります。現在の見積もりを説明させてください。',
        role: 'manager'
      },
      {
        speaker: 'Kenji (Lead Engineer)',
        text: "Based on our technical analysis, we need at least 6 weeks for proper implementation and testing. We could potentially reduce it to 4 weeks, but that would require additional resources.",
        japanese: '技術的分析に基づくと、適切な実装とテストには最低6週間必要です。4週間に短縮することも可能ですが、追加のリソースが必要になります。',
        role: 'engineer'
      },
      {
        speaker: 'Mr. Johnson',
        text: "What kind of additional resources are we talking about? And what are the risks of the accelerated timeline?",
        japanese: 'どのような追加リソースが必要でしょうか？また、短縮スケジュールのリスクは何ですか？',
        role: 'client'
      },
      {
        speaker: 'Kenji',
        text: "We'd need two more developers and might have to cut some edge cases from testing. The main risk is potential bugs in production.",
        japanese: '2名の追加開発者が必要で、テストからいくつかのエッジケースを削る必要があるかもしれません。主なリスクは本番環境での潜在的なバグです。',
        role: 'engineer'
      }
    ],
    keyPhrases: [
      {
        english: "I understand the urgency",
        japanese: "緊急性は理解しています",
        usage: "クライアントのプレッシャーを理解していることを示す時"
      },
      {
        english: "Rushing the development might compromise the quality",
        japanese: "開発を急ぐと品質に影響が出る可能性があります",
        usage: "スケジュール短縮のリスクを説明する時"
      },
      {
        english: "Based on our technical analysis",
        japanese: "技術的分析に基づくと",
        usage: "技術的な根拠を示して説明する時"
      }
    ]
  },
  {
    id: 'bug-escalation',
    title: 'Bug Escalation to Management',
    situation: 'バグ報告とエスカレーション',
    difficulty: 'Intermediate',
    dialogue: [
      {
        speaker: 'Alex (QA Engineer)',
        text: "I need to escalate a critical bug we found in the payment system. It's affecting about 15% of transactions.",
        japanese: '決済システムで見つかった重大なバグをエスカレーションする必要があります。取引の約15％に影響しています。',
        role: 'engineer'
      },
      {
        speaker: 'Manager (David)',
        text: "That sounds serious. Can you walk me through what's happening exactly?",
        japanese: 'それは深刻ですね。具体的に何が起きているか説明してもらえますか？',
        role: 'manager'
      },
      {
        speaker: 'Alex',
        text: "When users try to pay with certain credit cards, the transaction fails silently. They think it went through, but no payment is processed.",
        japanese: '特定のクレジットカードで支払おうとすると、取引が静かに失敗します。ユーザーは成功したと思いますが、実際には決済処理されていません。',
        role: 'engineer'
      },
      {
        speaker: 'David',
        text: "Do we know what's causing this? And what's our immediate action plan?",
        japanese: '原因は分かっていますか？そして、緊急対応計画は何ですか？',
        role: 'manager'
      },
      {
        speaker: 'Raj (Backend Engineer)',
        text: "I'm investigating the root cause. For now, we should add better error logging and user feedback. I can have a hotfix ready in 2 hours.",
        japanese: '根本原因を調査しています。とりあえず、より良いエラーログとユーザーフィードバックを追加すべきです。2時間でホットフィックスを準備できます。',
        role: 'engineer'
      }
    ],
    keyPhrases: [
      {
        english: "I need to escalate a critical bug",
        japanese: "重大なバグをエスカレーションする必要があります",
        usage: "重要な問題を上司に報告する時"
      },
      {
        english: "The transaction fails silently",
        japanese: "取引が静かに失敗します",
        usage: "エラーが表面化しない問題を説明する時"
      },
      {
        english: "I can have a hotfix ready",
        japanese: "ホットフィックスを準備できます",
        usage: "緊急修正の対応時間を伝える時"
      }
    ]
  },
  {
    id: 'architecture-discussion',
    title: 'Architecture Design Meeting',
    situation: 'システム設計の議論',
    difficulty: 'Advanced',
    dialogue: [
      {
        speaker: 'Emma (Solutions Architect)',
        text: "We need to decide on the architecture for our microservices migration. I've prepared a few options for discussion.",
        japanese: 'マイクロサービス移行のアーキテクチャを決める必要があります。議論用にいくつかの選択肢を用意しました。',
        role: 'engineer'
      },
      {
        speaker: 'Chen (DevOps Engineer)',
        text: "What are the main considerations we should keep in mind? Scalability, maintenance cost, or development speed?",
        japanese: '主に考慮すべき要素は何でしょうか？スケーラビリティ、メンテナンスコスト、それとも開発速度ですか？',
        role: 'engineer'
      },
      {
        speaker: 'Emma',
        text: "All of those are important, but I think our primary concern should be maintainability. We want to avoid creating a distributed monolith.",
        japanese: 'それらはすべて重要ですが、主な関心事は保守性だと思います。分散モノリスの作成は避けたいです。',
        role: 'engineer'
      },
      {
        speaker: 'Priya (Senior Engineer)',
        text: "I agree. We should also consider the team's learning curve. Not everyone has experience with containerized deployments.",
        japanese: '同感です。チームの学習曲線も考慮すべきです。全員がコンテナ化されたデプロイメントの経験があるわけではありません。',
        role: 'engineer'
      },
      {
        speaker: 'Emma',
        text: "Good point. We could start with a hybrid approach - migrate the most independent modules first while keeping the core monolith intact.",
        japanese: '良い指摘ですね。ハイブリッドアプローチから始めることができます。最も独立性の高いモジュールを最初に移行し、コアのモノリスはそのままにしておきます。',
        role: 'engineer'
      }
    ],
    keyPhrases: [
      {
        english: "We need to decide on the architecture",
        japanese: "アーキテクチャを決める必要があります",
        usage: "技術的な設計決定が必要な時"
      },
      {
        english: "We want to avoid creating a distributed monolith",
        japanese: "分散モノリスの作成は避けたいです",
        usage: "アンチパターンを避ける意図を示す時"
      },
      {
        english: "We could start with a hybrid approach",
        japanese: "ハイブリッドアプローチから始めることができます",
        usage: "段階的な移行戦略を提案する時"
      }
    ]
  }
];

export default function EnglishForEngineersPage() {
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [expandedLine, setExpandedLine] = useState<number | null>(null);
  const [showKeyPhrases, setShowKeyPhrases] = useState(false);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Beginner':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'Intermediate':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'Advanced':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'engineer':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'manager':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'client':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'teammate':
        return 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            English for Software Engineers
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            アジア圏のソフトウェアエンジニア向けの実践的な英会話学習。
            実際の職場でよく使われるシーンごとの会話を学習できます。
          </p>
        </div>

        {/* シナリオ一覧 */}
        {!selectedScenario ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {scenarios.map((scenario) => (
              <div
                key={scenario.id}
                onClick={() => setSelectedScenario(scenario.id)}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700"
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {scenario.title}
                  </h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(scenario.difficulty)}`}>
                    {scenario.difficulty}
                  </span>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {scenario.situation}
                </p>
                <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                  {scenario.dialogue.length} つの会話 →
                </div>
              </div>
            ))}
          </div>
        ) : (
          // 選択されたシナリオの詳細表示
          (() => {
            const scenario = scenarios.find(s => s.id === selectedScenario);
            if (!scenario) return null;

            return (
              <div className="space-y-6">
                {/* 戻るボタンとタイトル */}
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => setSelectedScenario(null)}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    ← 戻る
                  </button>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {scenario.title}
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">{scenario.situation}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getDifficultyColor(scenario.difficulty)}`}>
                    {scenario.difficulty}
                  </span>
                </div>

                {/* 会話内容 */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Dialogue / 会話
                  </h3>
                  <div className="space-y-4">
                    {scenario.dialogue.map((line, index) => (
                      <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {line.speaker}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(line.role)}`}>
                            {line.role}
                          </span>
                        </div>
                        <div 
                          className="cursor-pointer"
                          onClick={() => setExpandedLine(expandedLine === index ? null : index)}
                        >
                          <p className="text-gray-800 dark:text-gray-200 mb-2 leading-relaxed">
                            {line.text}
                          </p>
                          {expandedLine === index && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-3 rounded">
                              🇯🇵 {line.japanese}
                            </p>
                          )}
                          <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {expandedLine === index ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                            <span className="ml-1">日本語を見る</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* キーフレーズ */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
                  <div 
                    className="p-6 cursor-pointer"
                    onClick={() => setShowKeyPhrases(!showKeyPhrases)}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Key Phrases / 重要表現
                      </h3>
                      {showKeyPhrases ? <ChevronDownIcon className="w-5 h-5" /> : <ChevronRightIcon className="w-5 h-5" />}
                    </div>
                  </div>
                  {showKeyPhrases && (
                    <div className="px-6 pb-6 space-y-4">
                      {scenario.keyPhrases.map((phrase, index) => (
                        <div key={index} className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                          <div className="font-medium text-blue-600 dark:text-blue-400 mb-1">
                            "{phrase.english}"
                          </div>
                          <div className="text-gray-800 dark:text-gray-200 mb-2">
                            🇯🇵 {phrase.japanese}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            💡 使用場面: {phrase.usage}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 学習のヒント */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
                    💡 学習のヒント
                  </h3>
                  <ul className="space-y-2 text-blue-800 dark:text-blue-200">
                    <li>• まずは英語だけで理解を試み、必要に応じて日本語を確認しましょう</li>
                    <li>• 自分の役職や状況に近いキャラクターの発言を重点的に練習しましょう</li>
                    <li>• キーフレーズを実際の会話で使ってみることを心がけましょう</li>
                    <li>• 同僚との英語練習でこれらのシナリオを再現してみましょう</li>
                  </ul>
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}