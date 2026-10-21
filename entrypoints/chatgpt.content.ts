import {
  ChatGPTSourceReader,
  type SourceCursor,
} from "../src/providers/chatgpt/source-reader";

type DataRecord = Record<string, unknown>;

function asRecord(value: unknown): DataRecord | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as DataRecord;
}

function getRecordId(value: unknown): string | null {
  const id = asRecord(value)?.id;

  return typeof id === "string" && id.length > 0 ? id : null;
}

function getMessageCount(value: unknown): number | null {
  const messages = asRecord(value)?.messages;

  return Array.isArray(messages) ? messages.length : null;
}

function countDuplicates(ids: string[]): number {
  return ids.length - new Set(ids).size;
}

export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  runAt: "document_idle",

  async main() {
    const reader = new ChatGPTSourceReader();

    try {
      // 1. Open the existing database and inspect its schema.
      const schema = await reader.open();

      console.log("[1. Source schema]", {
        databaseName: schema.databaseName,
        databaseVersion: schema.databaseVersion,
      });

      console.table(
        Object.entries(schema.stores).map(([name, store]) => ({
          store: name,
          keyPath: store.keyPath,
          indexes: Object.entries(store.indexes)
            .map(([indexName, keyPath]) => `${indexName} -> ${keyPath}`)
            .join(", "),
        })),
      );

      // 2. Scan all metadata in batches of 50.
      let cursor: SourceCursor | null = null;
      let done = false;
      let batchCount = 0;
      let totalRecords = 0;
      let invalidIds = 0;
      let duplicateIds = 0;

      const allIds = new Set<string>();

      let firstBatchPassed: boolean | null = null;
      let secondBatchPassed: boolean | null = null;
      let firstBatchIds = new Set<string>();

      while (!done) {
        const batch = await reader.readMetadataBatch({
          after: cursor,
          limit: 50,
        });

        batchCount++;
        totalRecords += batch.records.length;

        const batchIds: string[] = [];

        // Validate IDs and detect duplicates across the entire scan.
        for (const { value } of batch.records) {
          const id = getRecordId(value);

          if (id === null) {
            invalidIds++;
            continue;
          }

          batchIds.push(id);

          if (allIds.has(id)) {
            duplicateIds++;
          } else {
            allIds.add(id);
          }
        }

        const invalidIdsInBatch = batch.records.length - batchIds.length;

        const duplicatesInBatch = countDuplicates(batchIds);

        // 3. Display a small sample from the first metadata batch.
        if (batchCount === 1) {
          firstBatchIds = new Set(batchIds);

          console.table(
            batch.records.slice(0, 5).map(({ value }) => {
              const metadata = asRecord(value);

              return {
                id: metadata?.id ?? null,
                title:
                  typeof metadata?.title === "string"
                    ? metadata.title.slice(0, 40)
                    : null,
                update_time: metadata?.update_time ?? null,
                message_count: metadata?.message_count ?? null,
              };
            }),
          );

          // Fetch full conversations for the first batch.
          const results = await reader.getConversationsByIds(batchIds);

          const found = results.filter(({ record }) => record !== null).length;

          const missing = batchIds.length - found;

          const mismatches = results.filter(
            ({ requestedId, record }) =>
              record !== null && getRecordId(record) !== requestedId,
          ).length;

          console.table(
            results.slice(0, 5).map(({ requestedId, record }) => ({
              requestedId,
              found: record !== null,
              returnedId: getRecordId(record),
              messages: getMessageCount(record),
            })),
          );

          firstBatchPassed =
            invalidIdsInBatch === 0 &&
            duplicatesInBatch === 0 &&
            results.length === batchIds.length &&
            missing === 0 &&
            mismatches === 0;

          console.log("[First batch verification]", {
            passed: firstBatchPassed,
            metadataRecordsReturned: batch.records.length,
            validMetadataIds: batchIds.length,
            conversationsRequested: batchIds.length,
            conversationsFound: found,
            conversationsMissing: missing,
            conversationIdMismatches: mismatches,
            hasMoreMetadata: !batch.done,
          });
        }

        // 4. Verify pagination and full-conversation lookups on batch 2.
        if (batchCount === 2) {
          const overlappingIds = batchIds.filter((id) => firstBatchIds.has(id));

          const results = await reader.getConversationsByIds(batchIds);

          const found = results.filter(({ record }) => record !== null).length;

          const missing = batchIds.length - found;

          const mismatches = results.filter(
            ({ requestedId, record }) =>
              record !== null && getRecordId(record) !== requestedId,
          ).length;

          secondBatchPassed =
            batch.records.length > 0 &&
            invalidIdsInBatch === 0 &&
            duplicatesInBatch === 0 &&
            overlappingIds.length === 0 &&
            results.length === batchIds.length &&
            missing === 0 &&
            mismatches === 0;

          console.log("[Second batch verification]", {
            passed: secondBatchPassed,
            firstBatchCount: 50,
            secondBatchCount: batch.records.length,
            invalidIdsInSecondBatch: invalidIdsInBatch,
            duplicateIdsWithinSecondBatch: duplicatesInBatch,
            overlappingIds: overlappingIds.length,
            conversationsRequested: batchIds.length,
            conversationsFound: found,
            conversationsMissing: missing,
            conversationIdMismatches: mismatches,
            hasMoreAfterSecondBatch: !batch.done,
          });
        }

        // Stop safely if pagination cannot continue.
        done = batch.done;
        cursor = batch.nextCursor;

        if (!done && !cursor) {
          throw new Error(
            "Metadata scan cannot continue: nextCursor is missing.",
          );
        }

        if (!done && batch.records.length === 0) {
          throw new Error(
            "Metadata scan cannot continue: empty batch but more records exist.",
          );
        }

        // Log progress periodically instead of flooding the console.
        if (batchCount % 10 === 0 || done) {
          console.log("[Metadata scan progress]", {
            batchCount,
            totalRecords,
            uniqueIds: allIds.size,
            hasMore: !done,
          });
        }
      }

      // 5. Validate the complete metadata scan.
      const metadataScanPassed =
        done &&
        totalRecords === allIds.size &&
        invalidIds === 0 &&
        duplicateIds === 0;

      console.log("[Complete metadata scan]", {
        passed: metadataScanPassed,
        completed: done,
        batchCount,
        batchSize: 50,
        totalRecords,
        uniqueIds: allIds.size,
        invalidIds,
        duplicateIds,
      });

      // A second batch is unnecessary if the entire database
      // fits into the first batch.
      if (batchCount === 1 && done) {
        secondBatchPassed = true;

        console.log(
          "[Second batch verification] Not required: metadata fits in one batch.",
        );
      }

      const paginationPassed = secondBatchPassed === true;

      // 6. Final test result.
      const overallPassed =
        metadataScanPassed && firstBatchPassed === true && paginationPassed;

      console.log("[SourceReader test complete]", {
        firstBatchPassed,
        paginationPassed,
        metadataScanPassed,
        overallPassed,
      });
    } catch (error) {
      console.error("[SourceReader test failed]", error);
      throw error;
    } finally {
      reader.close();
    }
  },
});
