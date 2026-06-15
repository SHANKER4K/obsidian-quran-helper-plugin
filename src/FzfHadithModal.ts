import type { App } from "obsidian";
import { MarkdownView, Notice, SuggestModal } from "obsidian";
import { hadithDataService } from "./HadithDataService";
import type { HadithCollectionMeta, IndexedHadith } from "./types";
import type { HadithSearch } from "./HadithSearch";
import type QuranHelper from "../main";

type Suggestion =
  | { kind: "collection"; data: HadithCollectionMeta }
  | { kind: "hadith"; data: IndexedHadith };

export class FzfHadithModal extends SuggestModal<Suggestion> {
  private plugin: QuranHelper;
  private collections: HadithCollectionMeta[] = [];
  private collectionId: string | null = null;
  private hadithSearch: HadithSearch | null = null;
  private loading = false;

  constructor(app: App, plugin: QuranHelper, initialCollectionId?: string) {
    super(app);
    this.plugin = plugin;
    this.collectionId = initialCollectionId || null;
    this.setPlaceholder(
      this.collectionId ? "ابحث في الحديث..." : "اختر مجموعة الحديث أو ابحث...",
    );
    this.setInstructions([{ command: "↵", purpose: "select/insert" }]);
  }

  async onOpen() {
    void super.onOpen();
    try {
      if (this.collectionId) {
        this.setPlaceholder("جاري التحميل...");
        const [search, cols] = await Promise.all([
          hadithDataService.getSearchService(this.collectionId),
          hadithDataService.getCollections(),
        ]);
        this.hadithSearch = search;
        this.collections = cols;
        this.setPlaceholder("ابحث في الحديث...");
        this.inputEl.dispatchEvent(new Event("input"));
      } else {
        this.collections = await hadithDataService.getCollections();
        this.inputEl.dispatchEvent(new Event("input"));
      }
    } catch (error) {
      console.error("Failed to load hadith data:", error);
      new Notice("Error: Could not load hadith data.");
    }
  }

  getSuggestions(query: string): Suggestion[] {
    if (this.loading) return [];

    if (!this.collectionId) {
      // Collection picker mode
      const q = query.trim().toLowerCase();
      const filtered = q
        ? this.collections.filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              c.name_ar.includes(query.trim()),
          )
        : this.collections;
      return filtered.map((c) => ({ kind: "collection" as const, data: c }));
    }

    // Hadith search mode
    if (!this.hadithSearch) return [];
    const results = this.hadithSearch.search(query);
    return results.map((h) => ({ kind: "hadith" as const, data: h }));
  }

  renderSuggestion(suggestion: Suggestion, el: HTMLElement) {
    if (suggestion.kind === "collection") {
      const { data: col } = suggestion;
      const textEl = el.createDiv({ text: `${col.name_ar} — ${col.name}` });
      textEl.setAttribute("dir", "rtl");
      el.createEl("small", {
        text: `${col.total} حديث`,
      });
      return;
    }

    const { data: hadith } = suggestion;
    const textEl = el.createDiv({ text: hadith.arabic });
    textEl.setAttribute("dir", "rtl");
    el.createEl("small", {
      text: `#${hadith.number} — ${hadith.narrator || ""}`,
    });
  }

  async onChooseSuggestion(
    suggestion: Suggestion,
    _evt: MouseEvent | KeyboardEvent,
  ) {
    if (suggestion.kind === "collection") {
      // Modal will close automatically — pre-load and reopen with collection
      const colId = suggestion.data.id;
      try {
        await hadithDataService.getSearchService(colId);
      } catch (error) {
        console.error("Failed to load hadith collection:", error);
        new Notice("Error: Could not load hadith data.");
        return;
      }
      new FzfHadithModal(this.app, this.plugin, colId).open();
      return;
    }

    // Insert hadith
    const hadith = suggestion.data;
    if (!hadith.arabic) {
      console.error("Invalid hadith data:", hadith);
      new Notice("Error: Invalid hadith data.");
      return;
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view?.editor;
    if (!editor) {
      new Notice("Error: No active editor found. Please open a note first.");
      return;
    }

    try {
      const col = this.collections.find((c) => c.id === this.collectionId);
      const ref = col ? `${col.name} - #${hadith.number}` : `#${hadith.number}`;

      const { hadithOutputFormat, hadithCalloutType } = this.plugin.settings;
      const type = hadithCalloutType || "hadith";
      let content = "";

      if (hadithOutputFormat === "blockquote") {
        content = `> ${hadith.arabic}\n> ${hadith.english}\n> — ${ref}\n\n`;
      } else if (hadithOutputFormat === "inline") {
        content = `{ ${hadith.arabic} – ${hadith.english} } – ${ref}\n\n`;
      } else {
        content = `> [!${type}] ${ref}\n> ${hadith.arabic}\n> ${hadith.english}\n\n`;
      }

      const cursor = editor.getCursor();
      const lines = content.split("\n");
      const lastLine = lines[lines.length - 1] || "";
      const isSingleLine = lines.length === 1;
      editor.transaction({
        changes: [{ from: cursor, to: cursor, text: content }],
        selection: {
          from: {
            line: cursor.line + lines.length - 1,
            ch: isSingleLine ? cursor.ch + content.length : lastLine.length,
          },
        },
      });
    } catch (error) {
      console.error("Failed to insert hadith:", error);
      new Notice("Error: Failed to insert hadith.");
    }
  }
}
