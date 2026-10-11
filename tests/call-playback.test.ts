/* eslint-disable @typescript-eslint/no-explicit-any -- browser API simulations expose a test harness on window */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "@playwright/test";

let browser: Browser;
let page: Page;
let bundle: string;

beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {useCall} from './src/components/radio/use-call';
        function Harness() { window.call = useCall({suspend:()=>window.suspended++, resume:()=>window.resumed++, emitFx:()=>{}}); return null; }
        createRoot(document.getElementById('root')).render(React.createElement(Harness));`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, platform: "browser", tsconfig: "tsconfig.json",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  bundle = result.outputFiles[0].text;
  browser = await chromium.launch({ channel: "chrome", headless: true });
});

beforeEach(async () => {
  page = await browser.newPage();
  await page.setContent('<div id="root"></div>');
  await page.evaluate(() => {
    // Mock recognition, voice providers, and playback; never call paid APIs or open a mic.
    const w = window as any;
    w.suspended = 0; w.resumed = 0; w.activeAudio = 0; w.maxAudio = 0;
    w.recognizers = []; w.audios = []; w.pendingAudio = []; w.sayCount = 0;
    w.provider = "gemini"; w.tts = []; w.audioMode = "pending";
    w.fetch = async (url: string, init: RequestInit) => {
      if (url.endsWith("/audio")) {
        if (w.audioMode === "browser") return new Response("", { status: 503 });
        // Deliberately ignore abort to verify that a late response still cannot play.
        return new Promise((resolve) => w.pendingAudio.push(() => resolve(new Response("mp3", { headers: { "content-type": "audio/mpeg" } }))));
      }
      const body = JSON.parse(init.body as string);
      if (body.action === "say") w.sayCount++;
      return new Response(JSON.stringify({ reply: body.action === "start" ? "Welcome to Aqua. What's your name?" : "There is pizza at the Union. Come along!", cards: [{ id: "post:1", title: "Pizza", href: "/connect" }], callerName: null, provider: w.provider, endCall: false }));
    };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getAudioTracks: () => [], getTracks: () => [] }) } });
    w.SpeechRecognition = class {
      onresult: any; onend: any; onerror: any;
      constructor() { w.recognizers.push(this); }
      start() {} stop() {}
    };
    w.hear = (text: string, final = false) => {
      const rec = w.recognizers.at(-1);
      rec.onresult?.({ resultIndex: 0, results: [{ isFinal: final, 0: { transcript: text } }] });
    };
    const node = () => ({ connect() {}, disconnect() {}, fftSize: 512, getByteTimeDomainData(buf: Uint8Array) { buf.fill(128); } });
    w.AudioContext = class { state = "running"; destination = {}; resume = async () => {}; close = async () => {}; createMediaElementSource = node; createAnalyser = node; };
    w.Audio = class {
      active = false; onended: any; onerror: any;
      constructor() { w.audios.push(this); }
      async play() { this.active = true; w.activeAudio++; w.maxAudio = Math.max(w.maxAudio, w.activeAudio); }
      pause() { if (this.active) w.activeAudio--; this.active = false; }
    };
    w.SpeechSynthesisUtterance = class { constructor(public text: string) {} };
    Object.defineProperty(w, "speechSynthesis", { configurable: true, value: {
      getVoices: () => [], resume() {}, cancel() {}, speak(u: any) { w.tts.push(u); u.onstart?.(); },
    } });
  });
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => !!(window as any).call);
});
afterEach(async () => { await page.evaluate(() => { void (window as any).call.endCall(); }); await page.close(); });
afterAll(async () => { await browser?.close(); });

const start = async () => {
  await page.evaluate(() => { void (window as any).call.startCall(); });
  await page.waitForFunction(() => (window as any).call.phase === "speaking" && (window as any).pendingAudio.length === 1);
};

describe("live call playback", () => {
  it("hears interruptions during speech and suppresses late audio and duplicate finals", async () => {
    await start();
    expect(await page.evaluate(() => (window as any).suspended)).toBe(1);
    await page.evaluate(() => (window as any).hear("wait I have a question"));
    await page.waitForFunction(() => (window as any).call.phase === "listening");
    await page.evaluate(() => (window as any).pendingAudio[0]());
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).audios.length)).toBe(0);
    await page.evaluate(() => { const w = window as any; const old = w.recognizers.at(-1).onresult; w.hear("where is pizza", true); old({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "where is pizza" } }] }); });
    await page.waitForFunction(() => (window as any).sayCount === 1);
    expect(await page.evaluate(() => (window as any).sayCount)).toBe(1);
  });

  it("pauses the playing MP3 before a new turn plays", async () => {
    await start();
    await page.evaluate(() => (window as any).pendingAudio[0]());
    await page.waitForFunction(() => (window as any).activeAudio === 1);
    await page.evaluate(() => (window as any).hear("actually where is the library", true));
    await page.waitForFunction(() => (window as any).pendingAudio.length === 2);
    expect(await page.evaluate(() => (window as any).activeAudio)).toBe(0);
    await page.evaluate(() => (window as any).pendingAudio[1]());
    await page.waitForFunction(() => (window as any).activeAudio === 1);
    expect(await page.evaluate(() => (window as any).maxAudio)).toBe(1);
  });

  it("cancels browser speech and blocks its delayed next sentence", async () => {
    await page.evaluate(() => { (window as any).audioMode = "browser"; void (window as any).call.startCall(); });
    await page.waitForFunction(() => (window as any).tts.length === 1);
    await page.evaluate(() => { const w = window as any; const lateEnd = w.tts[0].onend; w.hear("stop please"); lateEnd(); });
    await page.waitForFunction(() => (window as any).call.phase === "listening");
    expect(await page.evaluate(() => (window as any).tts.length)).toBe(1);
  });

  it("shows AI unavailability instead of speaking the local canned reply", async () => {
    await start();
    await page.evaluate(() => { const w = window as any; w.provider = "local"; w.hear("any campus events", true); });
    await page.waitForFunction(() => !!(window as any).call.notice);
    expect(await page.evaluate(() => (window as any).call.notice)).toContain("AI is unavailable");
    expect(await page.evaluate(() => (window as any).pendingAudio.length)).toBe(1);
    expect(await page.evaluate(() => (window as any).call.lines.filter((l: any) => l.role === "aqua").length)).toBe(1);
    expect(await page.evaluate(() => (window as any).call.cards.length)).toBe(1);
  });

  it("hangs up immediately and ignores a pending greeting's audio", async () => {
    await start();
    await page.evaluate(() => { void (window as any).call.endCall(); (window as any).pendingAudio[0](); });
    await page.waitForFunction(() => (window as any).call.phase === "off");
    expect(await page.evaluate(() => (window as any).resumed)).toBe(1);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).audios.length)).toBe(0);
  });
});
