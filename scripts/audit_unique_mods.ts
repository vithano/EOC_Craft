import uniqueDefs from "../src/data/eocUniques.generated.json";
import { resolveUniqueMods, type EocUniqueDefinition } from "../src/data/eocUniques";
import { equipmentModifiersFromUniqueTexts } from "../src/data/uniqueGearMods";
import { UNIQUE_MODS_AUDIT_ALLOWLIST } from "../src/data/uniqueModsAuditAllowlist";

type UnmatchedKey = string;

function isWeaponSlot(slot: string): boolean {
  return slot.trim().toLowerCase() === "weapon";
}

function normalizeKey(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

function isAllowlisted(line: string): { allowlisted: boolean; reason?: string } {
  for (const e of UNIQUE_MODS_AUDIT_ALLOWLIST) {
    if (e.re.test(line)) return { allowlisted: true, reason: e.reason };
  }
  return { allowlisted: false };
}

function main() {
  const defs = uniqueDefs as unknown as EocUniqueDefinition[];

  const unmatched = new Map<UnmatchedKey, { count: number; examples: string[] }>();
  const allowlistedUnmatched = new Map<UnmatchedKey, { count: number; reason: string; examples: string[] }>();
  let totalLines = 0;
  let matchedLines = 0;

  for (const def of defs) {
    const { innateText, lineTexts } = resolveUniqueMods(def, null, 0);
    const lines = [innateText, ...lineTexts].map((s) => s.trim()).filter(Boolean);
    const ctx = { isWeapon: isWeaponSlot(def.slot) };

    for (const line of lines) {
      totalLines++;
      let matched = false;
      equipmentModifiersFromUniqueTexts([line], ctx, {
        onLine: (_l, m) => {
          matched = m;
        },
      });

      if (matched) {
        matchedLines++;
      } else {
        const key = normalizeKey(line);
        const al = isAllowlisted(key);
        if (al.allowlisted) {
          const cur =
            allowlistedUnmatched.get(key) ??
            { count: 0, reason: al.reason ?? "allowlisted", examples: [] as string[] };
          cur.count++;
          if (cur.examples.length < 5) cur.examples.push(`${def.name} (${def.id})`);
          allowlistedUnmatched.set(key, cur);
        } else {
          const cur = unmatched.get(key) ?? { count: 0, examples: [] as string[] };
          cur.count++;
          if (cur.examples.length < 5) cur.examples.push(`${def.name} (${def.id})`);
          unmatched.set(key, cur);
        }
      }
    }
  }

  const rows = [...unmatched.entries()]
    .map(([line, info]) => ({ line, ...info }))
    .sort((a, b) => b.count - a.count || a.line.localeCompare(b.line));

  // eslint-disable-next-line no-console
  console.log(
    [
      `Unique modifier audit (resolved lines @ enh=0, default rolls)`,
      `Total lines: ${totalLines}`,
      `Matched lines: ${matchedLines}`,
      `Unmatched unique lines (action needed): ${rows.length}`,
      `Allowlisted unmatched unique lines: ${allowlistedUnmatched.size}`,
      ``,
    ].join("\n")
  );

  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(`- (${r.count}×) ${r.line}`);
    // eslint-disable-next-line no-console
    console.log(`  e.g. ${r.examples.join(", ")}`);
  }

  if (allowlistedUnmatched.size > 0) {
    // eslint-disable-next-line no-console
    console.log("\nAllowlisted (intentionally not modeled):\n");
    const alRows = [...allowlistedUnmatched.entries()]
      .map(([line, info]) => ({ line, ...info }))
      .sort((a, b) => b.count - a.count || a.line.localeCompare(b.line));
    for (const r of alRows) {
      // eslint-disable-next-line no-console
      console.log(`- (${r.count}×) ${r.line}`);
      // eslint-disable-next-line no-console
      console.log(`  reason: ${r.reason}`);
      // eslint-disable-next-line no-console
      console.log(`  e.g. ${r.examples.join(", ")}`);
    }
  }

  process.exitCode = rows.length === 0 ? 0 : 1;
}

main();

