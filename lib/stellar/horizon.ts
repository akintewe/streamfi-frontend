import * as StellarSdk from "@stellar/stellar-sdk";
import { getStellarNetwork, getHorizonUrl } from "./config";

interface PaymentRecord {
  amount: string;
  timestamp: string;
}

interface FetchPaymentsReceivedParams {
  publicKey: string;
  limit?: number;
  cursor?: string;
}

interface FetchPaymentsReceivedResult {
  tips: PaymentRecord[];
  nextCursor: string | null;
}

/**
 * Fetches a page of incoming native XLM payments for a Stellar account.
 * Supports cursor-based pagination for traversing full payment history.
 */
export async function fetchPaymentsReceived({
  publicKey,
  limit = 200,
  cursor,
}: FetchPaymentsReceivedParams): Promise<FetchPaymentsReceivedResult> {
  const network = getStellarNetwork();
  const server = new StellarSdk.Horizon.Server(getHorizonUrl(network));

  let query = server
    .payments()
    .forAccount(publicKey)
    .order("desc")
    .limit(limit);

  if (cursor) {
    query = query.cursor(cursor);
  }

  const payments = await query.call();

  const tips: PaymentRecord[] = payments.records
    .filter((record: any) =>
      (record.type === "payment" || record.type === "path_payment_strict_receive") &&
      record.to === publicKey &&
      record.asset_type === "native"
    )
    .map((record: any) => ({
      amount: record.amount,
      timestamp: record.created_at,
    }));

  const lastRecord = payments.records[payments.records.length - 1];
  const nextCursor =
    payments.records.length === limit && lastRecord
      ? (lastRecord as any).paging_token
      : null;

  return { tips, nextCursor };
}

/**
 * Fetches the total payment statistics for a Stellar account.
 * This looks for incoming payments (native XLM) and sums them up.
 */
export async function getAccountTipStats(publicKey: string) {
    try {
        const network = getStellarNetwork();
        const server = new StellarSdk.Horizon.Server(getHorizonUrl(network));

        // We fetch the most recent 200 payments to calculate the total tips.
        // In a production app, you'd use paging tokens to traverse the entire history
        // or a dedicated indexing service like StellarExpert or your own event listener.
        const payments = await server
            .payments()
            .forAccount(publicKey)
            .order("desc")
            .limit(200)
            .call();

        let totalTipsReceived = 0;
        let totalTipsCount = 0;
        let lastTipAt: Date | null = null;

        // Filter for incoming payments of type 'payment' or 'path_payment_strict_receive'
        // that are in native XLM.
        const tipRecords = payments.records.filter((record: any) => {
            return (
                (record.type === "payment" || record.type === "path_payment_strict_receive") &&
                record.to === publicKey &&
                record.asset_type === "native"
            );
        });

        tipRecords.forEach((record: any) => {
            totalTipsReceived += parseFloat(record.amount);
            totalTipsCount += 1;

            const createdAt = new Date(record.created_at);
            if (!lastTipAt || createdAt > lastTipAt) {
                lastTipAt = createdAt;
            }
        });

        return {
            totalTipsReceived: totalTipsReceived.toFixed(7),
            totalTipsCount,
            lastTipAt: lastTipAt ? (lastTipAt as Date).toISOString() : null
        };
    } catch (error) {
        console.error("Error fetching Stellar account stats:", error);
        throw error;
    }
}
