import type { HadithCollectionMeta, IndexedHadith } from "./types";
import { normalizeArabic } from "./utils";
import { HadithSearch } from "./HadithSearch";

class HadithDataService {
  private static instance: HadithDataService;
  private collectionsMeta: HadithCollectionMeta[] | null = null;
  private loadedData: Map<string, IndexedHadith[]> = new Map();
  private searchServices: Map<string, HadithSearch> = new Map();

  private constructor() {}

  public static getInstance(): HadithDataService {
    if (!HadithDataService.instance) {
      HadithDataService.instance = new HadithDataService();
    }
    return HadithDataService.instance;
  }

  public async getCollections(): Promise<HadithCollectionMeta[]> {
    if (this.collectionsMeta) return this.collectionsMeta;

    try {
      const data = await import("./hadith/collections.json");
      this.collectionsMeta = (data.default || data) as HadithCollectionMeta[];
      return this.collectionsMeta;
    } catch (error) {
      console.error("Failed to load hadith collections:", error);
      return [];
    }
  }

  public async getHadith(collectionId: string): Promise<IndexedHadith[]> {
    if (this.loadedData.has(collectionId)) {
      return this.loadedData.get(collectionId)!;
    }

    try {
      const data = await import(`./hadith/${collectionId}.json`);
      const rawData = (data.default || data) as Array<{
        number: number;
        bookNumber: number;
        chapter: string;
        narrator: string;
        arabic: string;
        english: string;
      }>;

      const indexed = rawData.map((h) => ({
        ...h,
        normalized_arabic: normalizeArabic(h.arabic),
        normalized_english: h.english.toLowerCase(),
      }));

      this.loadedData.set(collectionId, indexed);
      return indexed;
    } catch (error) {
      console.error(`Failed to load hadith collection ${collectionId}:`, error);
      return [];
    }
  }

  public async getSearchService(
    collectionId: string,
  ): Promise<HadithSearch | null> {
    if (this.searchServices.has(collectionId)) {
      return this.searchServices.get(collectionId)!;
    }

    const hadiths = await this.getHadith(collectionId);
    if (hadiths.length === 0) return null;

    const search = new HadithSearch(hadiths);
    this.searchServices.set(collectionId, search);
    return search;
  }
}

export const hadithDataService = HadithDataService.getInstance();
