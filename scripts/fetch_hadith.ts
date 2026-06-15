import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const SRC_DIR = path.dirname(__filename);

interface CollectionMeta {
  id: string;
  name: string;
  name_ar: string;
  total: number;
}

interface FlatHadith {
  number: number;
  bookNumber: number;
  chapter: string;
  narrator: string;
  arabic: string;
  english: string;
}

const COLLECTIONS: Array<{
  dbId: number;
  slug: string;
  name: string;
  name_ar: string;
}> = [
  { dbId: 1, slug: "bukhari", name: "Sahih al-Bukhari", name_ar: "صحيح البخاري" },
  { dbId: 2, slug: "muslim", name: "Sahih Muslim", name_ar: "صحيح مسلم" },
  { dbId: 3, slug: "nasai", name: "Sunan an-Nasa'i", name_ar: "سنن النسائي" },
  { dbId: 10, slug: "abudawud", name: "Sunan Abi Dawud", name_ar: "سنن أبي داود" },
  { dbId: 30, slug: "tirmidhi", name: "Jami` at-Tirmidhi", name_ar: "جامع الترمذي" },
  { dbId: 38, slug: "ibnmajah", name: "Sunan Ibn Majah", name_ar: "سنن ابن ماجه" },
  { dbId: 40, slug: "malik", name: "Muwatta Malik", name_ar: "موطأ مالك" },
  { dbId: 50, slug: "ahmad", name: "Musnad Ahmad", name_ar: "مسند أحمد" },
];

async function extractHadith(): Promise<void> {
  const dbPath = path.join(
    SRC_DIR,
    "..",
    "node_modules",
    "hadith",
    "data",
    "hadith.db",
  );

  if (!fs.existsSync(dbPath)) {
    console.error(
      "Error: hadith database not found. Run: npm install --save-dev hadith",
    );
    process.exit(1);
  }

  // @ts-ignore - sql.js has no type declarations
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs();

  const filebuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(filebuffer);

  const outDir = path.join(SRC_DIR, "..", "src", "hadith");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const collectionMetas: CollectionMeta[] = [];

  for (const col of COLLECTIONS) {
    console.log(`Extracting ${col.slug}...`);

    // Arabic hadith (ordered numerically by order_in_book = CAST(c4 AS INTEGER))
    const arStmt = db.prepare(`
      SELECT CAST(c0 AS INTEGER) as urn, CAST(c1 AS INTEGER) as collection_id,
             CAST(c2 AS INTEGER) as book_id, c3, c4, c6, c7, c8
      FROM hadith_content
      WHERE CAST(c1 AS INTEGER) = ?
      ORDER BY CAST(c4 AS INTEGER)
    `);
    arStmt.bind([col.dbId]);

    const arabicRows: Array<{
      urn: number;
      collection_id: number;
      book_id: number;
      display_number: string;
      order_in_book: string;
      narrator_prefix: string;
      content: string;
      narrator_postfix: string;
    }> = [];

    while (arStmt.step()) {
      const row = arStmt.getAsObject() as {
        urn: number;
        collection_id: number;
        book_id: number;
        c3: string;
        c4: string;
        c6: string;
        c7: string;
        c8: string;
      };
      arabicRows.push({
        urn: row.urn,
        collection_id: row.collection_id,
        book_id: row.book_id,
        display_number: row.c3,
        order_in_book: row.c4,
        narrator_prefix: row.c6 || "",
        content: row.c7 || "",
        narrator_postfix: row.c8 || "",
      });
    }
    arStmt.free();

    // English hadith
    const enStmt = db.prepare(`
      SELECT CAST(c0 AS INTEGER) as arabic_urn, c3, c4, c5
      FROM hadith_en_content
      WHERE CAST(c2 AS INTEGER) = ?
    `);
    enStmt.bind([col.dbId]);

    const enByUrn = new Map<
      number,
      { narrator_prefix: string; content: string; narrator_postfix: string }
    >();
    while (enStmt.step()) {
      const row = enStmt.getAsObject() as {
        arabic_urn: number;
        c3: string;
        c4: string;
        c5: string;
      };
      enByUrn.set(row.arabic_urn, {
        narrator_prefix: row.c3 || "",
        content: row.c4 || "",
        narrator_postfix: row.c5 || "",
      });
    }
    enStmt.free();

    // Merge and build flat hadith list
    const hadiths: FlatHadith[] = [];

    for (const ar of arabicRows) {
      const en = enByUrn.get(ar.urn);

      // Build narrator info from English if available
      const narratorParts: string[] = [];
      if (en?.narrator_prefix) {
        narratorParts.push(en.narrator_prefix);
      }

      // Build full Arabic text
      const arabicParts = [ar.narrator_prefix, ar.content, ar.narrator_postfix]
        .filter(Boolean)
        .join(" ")
        .trim();

      // Build full English text
      const englishParts = [
        en?.narrator_prefix || "",
        en?.content || "",
        en?.narrator_postfix || "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      hadiths.push({
        number: parseInt(ar.display_number, 10) || 0,
        bookNumber: ar.book_id,
        chapter: "",
        narrator: narratorParts.join(" ").trim(),
        arabic: arabicParts,
        english: englishParts,
      });
    }

    // Sort by hadith number, then bookNumber for stability
    hadiths.sort((a, b) => a.number - b.number || a.bookNumber - b.bookNumber);

    // Write collection file
    const filePath = path.join(outDir, `${col.slug}.json`);
    fs.writeFileSync(filePath, JSON.stringify(hadiths), "utf-8");
    const sizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);

    collectionMetas.push({
      id: col.slug,
      name: col.name,
      name_ar: col.name_ar,
      total: hadiths.length,
    });

    console.log(`  -> ${hadiths.length} hadith, ${sizeMB} MB`);
  }

  // Write collections metadata
  const metaPath = path.join(outDir, "collections.json");
  fs.writeFileSync(metaPath, JSON.stringify(collectionMetas, null, 2), "utf-8");
  console.log(`\nCollections metadata written to ${metaPath}`);
  console.log("Done!");

  db.close();
}

extractHadith().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
