import * as fs from "fs";
import * as https from "https";
import * as path from "path";

const SRC_DIR = path.dirname(__filename);

interface TranslationAyah {
  numberInSurah: number;
  text: string;
}

interface TranslationSurah {
  number: number;
  ayahs: TranslationAyah[];
}

interface TranslationResponse {
  data: {
    surahs: TranslationSurah[];
  };
}

interface FlatTranslation {
  surah_id: number;
  ayah_id: number;
  text: string;
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 30000 }, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")) as T);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject)
      .on("timeout", () => reject(new Error("Request timed out")));
  });
}

async function fetchTranslation(): Promise<void> {
  const url = "https://api.alquran.cloud/v1/quran/en.sahih";
  const outputPath = path.join(SRC_DIR, "../src/en_ayahs.json");

  console.log(`Fetching translation from: ${url}`);

  const data = await fetchJson<TranslationResponse>(url);
  const flat: FlatTranslation[] = [];

  for (const surah of data.data.surahs) {
    for (const ayah of surah.ayahs) {
      flat.push({
        surah_id: surah.number,
        ayah_id: ayah.numberInSurah,
        text: ayah.text,
      });
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(flat), "utf-8");
  console.log(`\nSuccess! Fetched ${flat.length} translated ayahs.`);
  console.log(`Saved to: ${outputPath}`);
}

fetchTranslation().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
