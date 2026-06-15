import type { IndexedHadith } from "./types";
import { isNumericQuery, normalizeArabic, parseNumericString } from "./utils";

export class HadithSearch {
  private hadiths: IndexedHadith[];
  private uniqueArabicWords: string[] = [];
  private wordToHadiths: Map<string, Set<number>> = new Map();

  constructor(hadiths: IndexedHadith[]) {
    this.hadiths = hadiths;
    this.buildIndex();
  }

  private buildIndex() {
    const wordSet = new Set<string>();

    this.hadiths.forEach((hadith, index) => {
      const tokens = hadith.normalized_arabic
        .split(/\s+/)
        .filter((t) => t.length > 0);

      tokens.forEach((token) => {
        wordSet.add(token);
        if (!this.wordToHadiths.has(token)) {
          this.wordToHadiths.set(token, new Set());
        }
        this.wordToHadiths.get(token)?.add(index);
      });
    });

    this.uniqueArabicWords = Array.from(wordSet);
  }

  public search(query: string, limit = 50): IndexedHadith[] {
    if (!query.trim()) {
      return this.hadiths.slice(0, limit);
    }

    const trimmed = query.trim();

    // Try numeric search (hadith number)
    if (isNumericQuery(trimmed)) {
      const queryNum = parseNumericString(trimmed);
      const results: IndexedHadith[] = [];
      for (const h of this.hadiths) {
        if (results.length >= limit) break;
        if (h.number === queryNum) {
          results.push(h);
        }
      }
      return results;
    }

    // Search in English text (substring)
    const lowerQuery = trimmed.toLowerCase();
    const englishMatches: IndexedHadith[] = [];
    for (const h of this.hadiths) {
      if (englishMatches.length >= limit) break;
      if (
        h.english.toLowerCase().includes(lowerQuery) ||
        h.narrator.toLowerCase().includes(lowerQuery)
      ) {
        englishMatches.push(h);
      }
    }

    // Search in Arabic text (normalized substring via inverted index)
    const normalizedQuery = normalizeArabic(trimmed);
    const queryTerms = normalizedQuery.split(/\s+/).filter((t) => t.length > 0);

    let arabicResultIndices: Set<number> | null = null;

    if (queryTerms.length > 0) {
      for (const term of queryTerms) {
        const termMatches = new Set<number>();
        const matchingWords = this.uniqueArabicWords.filter((w) =>
          w.includes(term),
        );

        for (const word of matchingWords) {
          const indices = this.wordToHadiths.get(word);
          if (indices) {
            for (const index of indices) {
              termMatches.add(index);
            }
          }
        }

        if (arabicResultIndices === null) {
          arabicResultIndices = termMatches;
        } else {
          const intersection = new Set<number>();
          for (const index of termMatches) {
            if (arabicResultIndices.has(index)) {
              intersection.add(index);
            }
          }
          arabicResultIndices = intersection;
        }

        if (arabicResultIndices.size === 0) break;
      }
    }

    // Merge results: Arabic matches first (by relevance), then English
    const seen = new Set<number>();
    const merged: IndexedHadith[] = [];

    if (arabicResultIndices) {
      const sorted = Array.from(arabicResultIndices).sort((a, b) => a - b);
      for (const index of sorted) {
        const h = this.hadiths[index];
        if (h && merged.length < limit) {
          merged.push(h);
          seen.add(index);
        }
      }
    }

    for (const h of englishMatches) {
      if (merged.length >= limit) break;
      const idx = this.hadiths.indexOf(h);
      if (!seen.has(idx)) {
        merged.push(h);
        seen.add(idx);
      }
    }

    return merged;
  }
}
