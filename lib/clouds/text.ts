// 本文中の $...$ をインライン数式として切り出す。描画とテストの両方で使う。

export type TextPart = { kind: "text"; value: string } | { kind: "math"; value: string };

export function splitInlineMath(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const pieces = text.split("$");
  pieces.forEach((value, i) => {
    if (value === "") return;
    parts.push({ kind: i % 2 === 1 ? "math" : "text", value });
  });
  return parts;
}

/** $ が対になっているか（奇数個なら閉じ忘れ） */
export function hasBalancedDollars(text: string): boolean {
  return (text.split("$").length - 1) % 2 === 0;
}
