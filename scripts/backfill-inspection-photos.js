/**
 * One-off backfill: move existing inspection_photos rows that still hold a raw
 * base64 `data:` URL in file_path into Supabase Storage, then repoint file_path
 * at the resulting object path. Shrinks the table so future GET /api/inspection-photos
 * calls stay small even before every row has been touched by a fresh upload.
 *
 * Safe to re-run: only rows still starting with 'data:' are selected each pass,
 * so anything already migrated (or migrated by a previous partial run) is skipped.
 *
 * Usage:
 *   node scripts/backfill-inspection-photos.js            # migrate for real
 *   node scripts/backfill-inspection-photos.js --dry-run  # report only, no writes
 */

const fs = require("fs");
const path = require("path");

// This project targets Node 12/14 for the app itself, which has no global
// fetch/Headers — but @supabase/supabase-js v2 requires both to exist globally.
// Polyfill before requiring it (dev-only dependency, script use only).
if (typeof fetch === "undefined") {
  const nodeFetch = require("node-fetch");
  global.fetch = nodeFetch;
  global.Headers = nodeFetch.Headers;
  global.Request = nodeFetch.Request;
  global.Response = nodeFetch.Response;
}

const { createClient } = require("@supabase/supabase-js");

const DRY_RUN = process.argv.includes("--dry-run");
const BUCKET = "inspection-photos";
const BATCH_SIZE = 100;

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const raw = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1];
  const extension = (contentType.split("/")[1] || "jpg").split("+")[0];
  return { buffer: Buffer.from(match[2], "base64"), contentType, extension };
}

async function main() {
  const env = loadEnvLocal();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  // Node 14 has no native WebSocket, which the realtime client requires just to
  // construct — supply the `ws` package's implementation (same fix as supabase-admin.ts).
  const { WebSocket } = require("ws");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
  });

  console.log(DRY_RUN ? "Running in DRY RUN mode (no writes will be made).\n" : "Running for real. This will modify production data.\n");

  let migrated = 0;
  let failed = 0;
  let totalBytesMoved = 0;

  for (;;) {
    const { data: rows, error } = await supabase
      .from("inspection_photos")
      .select("id, package_item_id, file_path")
      .like("file_path", "data:%")
      .limit(BATCH_SIZE);

    if (error) {
      throw new Error(`Failed to read inspection_photos: ${error.message}`);
    }
    if (!rows || rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const parsed = parseDataUrl(row.file_path);
      if (!parsed) {
        console.error(`[skip] row ${row.id}: file_path is not a recognizable data URL`);
        failed += 1;
        continue;
      }

      const objectPath = `${row.package_item_id}/${row.id}.${parsed.extension}`;

      if (DRY_RUN) {
        console.log(`[dry-run] would upload ${objectPath} (${parsed.buffer.length} bytes) and update row ${row.id}`);
        migrated += 1;
        totalBytesMoved += parsed.buffer.length;
        continue;
      }

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(objectPath, parsed.buffer, { contentType: parsed.contentType, upsert: true });
      if (uploadError) {
        console.error(`[fail] row ${row.id}: upload failed: ${uploadError.message}`);
        failed += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from("inspection_photos")
        .update({ file_path: objectPath })
        .eq("id", row.id);
      if (updateError) {
        console.error(`[fail] row ${row.id}: uploaded but DB update failed: ${updateError.message}`);
        failed += 1;
        continue;
      }

      console.log(`[ok] row ${row.id} -> ${objectPath} (${parsed.buffer.length} bytes)`);
      migrated += 1;
      totalBytesMoved += parsed.buffer.length;
    }

    if (DRY_RUN) {
      // Dry run never shrinks the query results (nothing is updated), so break
      // after one batch to avoid reprinting the same rows forever.
      break;
    }
  }

  console.log(`\nDone. Migrated: ${migrated}, failed: ${failed}, bytes moved: ${totalBytesMoved}.`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
