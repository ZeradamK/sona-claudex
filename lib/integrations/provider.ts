import type { Alarm, Note } from "@prisma/client";

/**
 * Provider-agnostic sync surface. iCloud (CalDAV/CardDAV) is the first
 * implementation; Google/Outlook can implement the same contract later. The
 * point is that Sona's domain objects (Alarm, Note, Contact) map to a neutral
 * shape, so a household syncs to whatever ecosystem it lives in — and the
 * Apple path is first-class, not bolted on.
 */

export type SyncDirection = "pull" | "push" | "bidirectional";

export interface RemoteEvent {
  uid: string;
  etag?: string;
  summary: string;
  start: Date;
  /** RFC 5545 recurrence — maps 1:1 to Alarm.recurrence (already RRULE). */
  rrule?: string;
}

export interface RemoteTodo {
  uid: string;
  etag?: string;
  summary: string;
  completed: boolean;
}

export interface RemoteRef {
  uid: string;
  etag?: string;
}

/**
 * A calendar/reminders backend (Apple Calendar + Reminders via CalDAV today).
 */
export interface CalendarSyncProvider {
  readonly id: string;
  connect(): Promise<void>;
  listEvents(): Promise<RemoteEvent[]>;
  pushAlarm(alarm: Alarm): Promise<RemoteRef>;
  deleteEvent(uid: string): Promise<void>;
  listTodos(): Promise<RemoteTodo[]>;
  pushNote(note: Note): Promise<RemoteRef>;
}
