## 個人blog実装のためのプロンプト集

### 機能を定義する
- ブログ一覧表示
- ブログ詳細表示
- ブログ投稿画面
  - 認証はserver側で行う
  - next-auth使う

### 一覧のページ
ブログ一覧を
```shell
- ブログ一覧表示
- ブログ詳細表示
- ブログ投稿画面
  - 認証はserver側で行う
  - next-auth使う
```
のように作ろうと思います。
まずはNext.jsのapp routerでapp/page.tsxに一覧表示をしてみてください。
ブログのタイトルは適当に3個作ってみてください。
tailwindでstylingはしてください。
現状のpage.tsxは
```tsx
import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
    </main>
  );
}
```
です。