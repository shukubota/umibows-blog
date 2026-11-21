import React from "react";
import AtmosphericWaves from "../../components/AtmosphericWaves";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "大気の波 — 慣性波・重力波・筋雲 | Umibows Blog",
  description:
    "コリオリ力が復元力の慣性波、浮力が復元力の重力波、そして山岳波が山脈の風下に筋状の雲を並べるしくみをシミュレーションで確かめる。",
};

export default function AtmosphericWavesPage() {
  return (
    <main>
      <AtmosphericWaves />
    </main>
  );
}
