export type MatchPayloadMember = {
  userId: string;
  name: string;
  department: string | null;
  email: string;
  /**
   * Extra contact info. Present when the member opted in (contact_visible)
   * or is the host — hosting includes being reachable.
   */
  contact: string | null;
  isHost: boolean;
};

/**
 * Fully denormalized at enqueue time: sending a notification must never
 * require joins, and a later profile edit must not rewrite history.
 */
export type NotificationPayload = {
  kind: "match_result" | "match_updated" | "unmatched";
  date: string;
  activity: { nameEn: string; nameZh: string; eventTime: string };
  office: { nameEn: string; nameZh: string };
  group?: {
    members: MatchPayloadMember[];
    hostUserId: string | null;
    venue: { nameEn: string; nameZh: string } | null;
  };
};
