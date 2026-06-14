import type { IndexedAyah } from "./types";
import { isSearchableAyahArray } from "./types";
import { normalizeArabic } from "./utils";
import { QuranSearch } from "./QuranSearch";
import { surahDataService } from "./SurahDataService";

class QuranDataService {
  private static instance: QuranDataService;
  private ayahs: IndexedAyah[] | null = null;
  private searchService: QuranSearch | null = null;
  private pageMap: Map<number, IndexedAyah[]> | null = null;

  private constructor() {}

  public static getInstance(): QuranDataService {
    if (!QuranDataService.instance) {
      QuranDataService.instance = new QuranDataService();
    }
    return QuranDataService.instance;
  }

  public async getSearchService(): Promise<QuranSearch> {
    if (this.searchService) return this.searchService;
    const ayahs = await this.getAyahs();
    this.searchService = new QuranSearch(ayahs);
    return this.searchService;
  }

  public async getAyahs(): Promise<IndexedAyah[]> {
    if (this.ayahs) return this.ayahs;

    try {
      const data = await import("./ayahs.json");
      const rawData = data.default || data;

      if (!isSearchableAyahArray(rawData)) {
        throw new Error(
          "Invalid ayahs data format: expected an array of SearchableAyah",
        );
      }

      const rawAyahs = rawData;

      // Load English translation data
      let translationMap: Map<string, string> | null = null;
      try {
        const transData = await import("./en_ayahs.json");
        const rawTranslation = (transData.default || transData) as Array<{
          surah_id: number;
          ayah_id: number;
          text: string;
        }>;
        translationMap = new Map(
          rawTranslation.map((t) => [`${t.surah_id}:${t.ayah_id}`, t.text]),
        );
      } catch {
        console.warn(
          "Translation file not found. English translations will be unavailable.",
        );
      }

      const surahs = await surahDataService.getSurahs();
      const surahMap = new Map(surahs.map((s) => [s.id, s.transliteration]));

      this.ayahs = rawAyahs.map((ayah) => {
        const enrichedAyah = {
          ...ayah,
          surah_name_en: surahMap.get(ayah.surah_id) || "",
          translation_en:
            translationMap?.get(`${ayah.surah_id}:${ayah.ayah_id}`) ||
            undefined,
        };

        if (!enrichedAyah.normalized_text) {
          return {
            ...enrichedAyah,
            normalized_text: normalizeArabic(enrichedAyah.text),
          };
        }

        return enrichedAyah as IndexedAyah;
      });

      return this.ayahs;
    } catch (error) {
      console.error("Failed to load ayahs:", error);
      throw error; // Re-throw so caller can handle
    }
  }
  public async getPageMap(): Promise<Map<number, IndexedAyah[]>> {
    if (this.pageMap) return this.pageMap;
    const ayahs = await this.getAyahs();
    const map = new Map<number, IndexedAyah[]>();
    for (const ayah of ayahs) {
      const bucket = map.get(ayah.page);
      if (bucket) {
        bucket.push(ayah);
      } else {
        map.set(ayah.page, [ayah]);
      }
    }
    this.pageMap = map;
    return map;
  }
}

export const quranDataService = QuranDataService.getInstance();
