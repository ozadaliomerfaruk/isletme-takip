export interface PushTokenOwnershipRow {
  user_id: string;
  token: string;
}

interface PushTokenRpcError {
  message: string;
}

interface PushTokenRpcResult<T extends PushTokenOwnershipRow> {
  data: T[] | null;
  error: PushTokenRpcError | null;
}

/**
 * A device token associated with multiple users is privacy-ambiguous. Until a
 * new/legacy claim repairs ownership, fail closed and send to none of them.
 * This is a second-line response validator; the database RPC performs the
 * authoritative full-table ownership aggregation in one statement snapshot.
 */
export function buildUnambiguousPushTokenMap<
  T extends PushTokenOwnershipRow,
>(rows: readonly T[]): {
  byUserId: Map<string, T>;
  ambiguousTokens: Set<string>;
} {
  const ownersByToken = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!row.token || !row.user_id) continue;
    const owners = ownersByToken.get(row.token) ?? new Set<string>();
    owners.add(row.user_id);
    ownersByToken.set(row.token, owners);
  }

  const ambiguousTokens = new Set<string>();
  for (const [token, owners] of ownersByToken) {
    if (owners.size > 1) ambiguousTokens.add(token);
  }

  const byUserId = new Map<string, T>();
  for (const row of rows) {
    if (
      row.token
      && row.user_id
      && !ambiguousTokens.has(row.token)
    ) {
      byUserId.set(row.user_id, row);
    }
  }

  return { byUserId, ambiguousTokens };
}

/**
 * Fetches worker recipients through the service-role-only database boundary.
 *
 * Calls are deliberately chunked below PostgREST's response-row cap. A failed
 * chunk contributes no recipients (fail closed), while independent chunks may
 * continue so one malformed target cannot suppress every notification.
 */
export async function fetchUnambiguousPushTokenMap<
  T extends PushTokenOwnershipRow,
>(
  userIds: readonly string[],
  fetchChunk: (
    userIds: string[],
  ) => Promise<PushTokenRpcResult<T>>,
  chunkSize = 100,
): Promise<{
  byUserId: Map<string, T>;
  failedChunkMessages: string[];
  ambiguousResponseTokens: Set<string>;
}> {
  const uniqueUserIds = [
    ...new Set(userIds.filter((userId) => Boolean(userId))),
  ];
  const rows: T[] = [];
  const failedChunkMessages: string[] = [];

  for (let index = 0; index < uniqueUserIds.length; index += chunkSize) {
    const chunk = uniqueUserIds.slice(index, index + chunkSize);
    const { data, error } = await fetchChunk(chunk);
    if (error) {
      failedChunkMessages.push(error.message);
      continue;
    }
    if (Array.isArray(data)) rows.push(...data);
  }

  const {
    byUserId,
    ambiguousTokens: ambiguousResponseTokens,
  } = buildUnambiguousPushTokenMap(rows);

  return {
    byUserId,
    failedChunkMessages,
    ambiguousResponseTokens,
  };
}
