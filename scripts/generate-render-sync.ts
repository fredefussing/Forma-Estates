// Generates server/render-sync.json — an additive-only schema manifest built
// from the CURRENT development database (the source of truth, kept in sync
// with shared/schema.ts). The live server's /api/health/live-migrate endpoint
// applies it idempotently: CREATE TABLE IF NOT EXISTS for missing tables,
// ADD COLUMN IF NOT EXISTS for missing columns. Nothing is ever dropped.
//
// Run with: npx tsx scripts/generate-render-sync.ts
import { Pool } from "pg";
import fs from "fs";
import path from "path";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { rows: cols } = await pool.query(`
    SELECT c.relname AS table_name,
           a.attname AS column_name,
           format_type(a.atttypid, a.atttypmod) AS col_type,
           a.attnotnull AS not_null,
           a.attidentity::text AS identity,
           pg_get_expr(d.adbin, d.adrelid) AS col_default,
           a.attnum
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
    WHERE c.relkind = 'r'
    ORDER BY c.relname, a.attnum
  `);

  const { rows: cons } = await pool.query(`
    SELECT c.relname AS table_name, con.conname, con.contype,
           pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE con.contype IN ('p', 'u')
    ORDER BY c.relname, con.conname
  `);

  const tables: Record<string, any> = {};
  for (const r of cols) {
    if (!tables[r.table_name]) tables[r.table_name] = { name: r.table_name, columns: [], constraints: [] };
    const isSerial =
      r.col_default?.startsWith("nextval(") &&
      (r.col_type === "integer" || r.col_type === "bigint");
    const isIdentity = r.identity === "a" || r.identity === "d";
    // Column DDL used both inside CREATE TABLE and for ADD COLUMN.
    let ddlType = r.col_type;
    let ddlDefault = r.col_default ? ` DEFAULT ${r.col_default}` : "";
    if (isSerial) {
      ddlType = r.col_type === "bigint" ? "bigserial" : "serial";
      ddlDefault = "";
    } else if (isIdentity) {
      ddlType = `${r.col_type} GENERATED ${r.identity === "a" ? "ALWAYS" : "BY DEFAULT"} AS IDENTITY`;
      ddlDefault = "";
    }
    // NOT NULL only when there is a default (or serial/identity) — adding a
    // NOT NULL column without default to a table with rows would fail.
    const notNull = r.not_null && (isSerial || isIdentity || r.col_default) ? " NOT NULL" : "";
    tables[r.table_name].columns.push({
      name: r.column_name,
      ddl: `"${r.column_name}" ${ddlType}${ddlDefault}${notNull}`,
    });
  }
  for (const r of cons) {
    if (!tables[r.table_name]) continue;
    tables[r.table_name].constraints.push({ name: r.conname, type: r.contype, def: r.def });
  }

  const manifest = Object.values(tables).map((t: any) => {
    const colDefs = t.columns.map((c: any) => c.ddl);
    const conDefs = t.constraints.map((c: any) => `CONSTRAINT "${c.name}" ${c.def}`);
    return {
      name: t.name,
      createSql: `CREATE TABLE IF NOT EXISTS "${t.name}" (${[...colDefs, ...conDefs].join(", ")})`,
      columns: t.columns.map((c: any) => ({
        name: c.name,
        addSql: `ALTER TABLE "${t.name}" ADD COLUMN IF NOT EXISTS ${c.ddl}`,
      })),
      constraints: t.constraints.map((c: any) => ({
        name: c.name,
        addSql: `ALTER TABLE "${t.name}" ADD CONSTRAINT "${c.name}" ${c.def}`,
      })),
    };
  });

  const outPath = path.resolve(process.cwd(), "server", "render-sync.json");
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), tables: manifest }, null, 1));
  console.log(`Wrote ${outPath}: ${manifest.length} tables, ${manifest.reduce((s: number, t: any) => s + t.columns.length, 0)} columns`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
