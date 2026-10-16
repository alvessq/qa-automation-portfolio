import fs from 'node:fs';
import path from 'node:path';
import { envFlag, RESULTS_DIR } from '../config/env';

const SCREENSHOTS_DIR = path.join(RESULTS_DIR, 'screenshots');
const VIDEOS_DIR = path.join(RESULTS_DIR, 'videos');
const PAGE_SOURCE_DIR = path.join(RESULTS_DIR, 'page-source');

const recordVideo = () => envFlag('RECORD_VIDEO', true);
const videosToKeep = () => Number(process.env.VIDEOS_TO_KEEP ?? 3) || 3;

export async function startVideo(): Promise<void> {
  if (!recordVideo()) return;
  try {
    await driver.startRecordingScreen({ timeLimit: '300', bitRate: '2000000' });
  } catch (error) {
    console.warn(`[evidence] gravação de vídeo indisponível: ${message(error)}`);
  }
}

/**
 * Em caso de falha salva screenshot, XML da tela e vídeo. Em caso de sucesso
 * apenas descarta a gravação, para não encher o disco nem os artifacts da CI.
 */
export async function collectEvidence(testTitle: string, passed: boolean): Promise<string[]> {
  const files: string[] = [];
  const base = `${timestamp()}_${slug(testTitle)}`;

  if (!passed) {
    files.push(...(await safely(() => saveScreenshot(base))));
    files.push(...(await safely(() => savePageSource(base))));
  }

  if (recordVideo()) {
    const video = await safely(async () => {
      const data = await driver.stopRecordingScreen();
      if (passed || !data) return [];
      fs.mkdirSync(VIDEOS_DIR, { recursive: true });
      const file = path.join(VIDEOS_DIR, `${base}.mp4`);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      pruneOldVideos();
      return [file];
    });
    files.push(...video);
  }

  return files.map((file) => path.relative(RESULTS_DIR, file));
}

async function saveScreenshot(base: string): Promise<string[]> {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const file = path.join(SCREENSHOTS_DIR, `${base}.png`);
  await driver.saveScreenshot(file);
  return [file];
}

async function savePageSource(base: string): Promise<string[]> {
  fs.mkdirSync(PAGE_SOURCE_DIR, { recursive: true });
  const file = path.join(PAGE_SOURCE_DIR, `${base}.xml`);
  fs.writeFileSync(file, await driver.getPageSource());
  return [file];
}

/** Guarda os N vídeos mais recentes de cada teste (o nome é `<timestamp>_<teste>.mp4`). */
function pruneOldVideos(): void {
  const byTest = new Map<string, string[]>();
  for (const name of fs.readdirSync(VIDEOS_DIR).filter((n) => n.endsWith('.mp4'))) {
    const test = name.slice(name.indexOf('_') + 1);
    byTest.set(test, [...(byTest.get(test) ?? []), name]);
  }
  for (const names of byTest.values()) {
    for (const old of names.sort().reverse().slice(videosToKeep())) {
      fs.rmSync(path.join(VIDEOS_DIR, old), { force: true });
    }
  }
}

async function safely(fn: () => Promise<string[]>): Promise<string[]> {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[evidence] ${message(error)}`);
    return [];
  }
}

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 80);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
