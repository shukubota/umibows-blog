"use client";

import { useEffect, useState } from "react";
import type { Liff } from "@line/liff";

type Profile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
};

type EnvInfo = {
  liffVersion: string;
  lineVersion: string | null;
  os: string;
  language: string;
  isInClient: boolean;
  isLoggedIn: boolean;
  context: unknown;
};

export default function LiffPage() {
  const [liff, setLiff] = useState<Liff | null>(null);
  const [env, setEnv] = useState<EnvInfo | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

  const log = (msg: string) =>
    setLogs((prev) => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev].slice(0, 30));

  useEffect(() => {
    if (!liffId) {
      setError("NEXT_PUBLIC_LIFF_ID が未設定です。.env.local を確認してください。");
      return;
    }

    (async () => {
      try {
        const mod = await import("@line/liff");
        const liffInstance = mod.default;
        await liffInstance.init({ liffId });
        setLiff(liffInstance);
        log(`liff.init OK (id=${liffId})`);

        setEnv({
          liffVersion: liffInstance.getVersion(),
          lineVersion: liffInstance.getLineVersion(),
          os: liffInstance.getOS() ?? "unknown",
          language: liffInstance.getLanguage(),
          isInClient: liffInstance.isInClient(),
          isLoggedIn: liffInstance.isLoggedIn(),
          context: liffInstance.getContext(),
        });

        if (liffInstance.isLoggedIn()) {
          const p = await liffInstance.getProfile();
          setProfile(p);
          setIdToken(liffInstance.getIDToken());
          log("profile loaded");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`liff.init failed: ${msg}`);
        log(`init error: ${msg}`);
      }
    })();
  }, [liffId]);

  const handleLogin = () => {
    if (!liff) return;
    liff.login();
  };

  const handleLogout = () => {
    if (!liff) return;
    liff.logout();
    setProfile(null);
    setIdToken(null);
    log("logged out");
    location.reload();
  };

  const handleShareTargetPicker = async () => {
    if (!liff) return;
    try {
      if (!liff.isApiAvailable("shareTargetPicker")) {
        log("shareTargetPicker は利用不可（ブラウザ実行 or 設定無効）");
        return;
      }
      const res = await liff.shareTargetPicker([
        { type: "text", text: "Hello from LIFF dev playground!" },
      ]);
      log(`shareTargetPicker: ${res ? "sent" : "cancelled"}`);
    } catch (e) {
      log(`shareTargetPicker error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleSendMessages = async () => {
    if (!liff) return;
    try {
      if (!liff.isInClient()) {
        log("sendMessages はLINE内でのみ利用可");
        return;
      }
      await liff.sendMessages([{ type: "text", text: "from LIFF playground" }]);
      log("sendMessages OK");
    } catch (e) {
      log(`sendMessages error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleScanCode = async () => {
    if (!liff) return;
    try {
      if (!liff.isApiAvailable("scanCodeV2")) {
        log("scanCodeV2 は利用不可");
        return;
      }
      const res = await liff.scanCodeV2();
      log(`scanCodeV2: ${JSON.stringify(res)}`);
    } catch (e) {
      log(`scanCodeV2 error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleCloseWindow = () => {
    if (!liff) return;
    if (!liff.isInClient()) {
      log("closeWindow はLINE内でのみ動作");
      return;
    }
    liff.closeWindow();
  };

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold">LIFF Dev Playground</h1>
          <p className="text-gray-400 mt-2 text-sm">
            LIFF SDK の動作確認用ページ。ブラウザでも LINE アプリ内でも開けます。
          </p>
        </header>

        {error && (
          <div className="p-4 bg-red-900/40 border border-red-700 rounded-lg text-red-200">
            {error}
          </div>
        )}

        <section className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
          <h2 className="text-lg font-semibold mb-3">Environment</h2>
          {env ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-gray-400">liff version</dt>
              <dd>{env.liffVersion}</dd>
              <dt className="text-gray-400">line version</dt>
              <dd>{env.lineVersion ?? "(外部ブラウザ)"}</dd>
              <dt className="text-gray-400">OS</dt>
              <dd>{env.os}</dd>
              <dt className="text-gray-400">language</dt>
              <dd>{env.language}</dd>
              <dt className="text-gray-400">isInClient</dt>
              <dd>{String(env.isInClient)}</dd>
              <dt className="text-gray-400">isLoggedIn</dt>
              <dd>{String(env.isLoggedIn)}</dd>
              <dt className="text-gray-400 col-span-2">context</dt>
              <dd className="col-span-2">
                <pre className="text-xs bg-gray-950 p-2 rounded overflow-x-auto">
                  {JSON.stringify(env.context, null, 2)}
                </pre>
              </dd>
            </dl>
          ) : (
            <p className="text-gray-500 text-sm">初期化中…</p>
          )}
        </section>

        <section className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
          <h2 className="text-lg font-semibold mb-3">Profile</h2>
          {profile ? (
            <div className="flex items-center gap-4">
              {profile.pictureUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.pictureUrl}
                  alt={profile.displayName}
                  className="w-16 h-16 rounded-full"
                />
              )}
              <div>
                <p className="font-semibold">{profile.displayName}</p>
                <p className="text-xs text-gray-400 break-all">{profile.userId}</p>
                {profile.statusMessage && (
                  <p className="text-sm text-gray-300 mt-1">{profile.statusMessage}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">未ログイン</p>
          )}
          {idToken && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-gray-400">ID Token</summary>
              <pre className="text-xs bg-gray-950 p-2 rounded mt-2 overflow-x-auto break-all whitespace-pre-wrap">
                {idToken}
              </pre>
            </details>
          )}
        </section>

        <section className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
          <h2 className="text-lg font-semibold mb-3">Actions</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleLogin}
              disabled={!liff || env?.isLoggedIn}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed rounded text-sm font-medium"
            >
              Login
            </button>
            <button
              onClick={handleLogout}
              disabled={!liff || !env?.isLoggedIn}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded text-sm font-medium"
            >
              Logout
            </button>
            <button
              onClick={handleShareTargetPicker}
              disabled={!liff}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded text-sm font-medium"
            >
              shareTargetPicker
            </button>
            <button
              onClick={handleSendMessages}
              disabled={!liff}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded text-sm font-medium"
            >
              sendMessages
            </button>
            <button
              onClick={handleScanCode}
              disabled={!liff}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded text-sm font-medium"
            >
              scanCodeV2
            </button>
            <button
              onClick={handleCloseWindow}
              disabled={!liff}
              className="px-3 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 rounded text-sm font-medium"
            >
              closeWindow
            </button>
          </div>
        </section>

        <section className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
          <h2 className="text-lg font-semibold mb-3">Logs</h2>
          <pre className="text-xs bg-gray-950 p-3 rounded h-48 overflow-y-auto whitespace-pre-wrap">
            {logs.length ? logs.join("\n") : "(no logs yet)"}
          </pre>
        </section>
      </div>
    </main>
  );
}
