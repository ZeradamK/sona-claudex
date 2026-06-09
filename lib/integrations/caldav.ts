import { DAVClient } from "tsdav";
import type { Alarm, Note } from "@prisma/client";

import type {
  CalendarSyncProvider,
  RemoteEvent,
  RemoteRef,
  RemoteTodo
} from "@/lib/integrations/provider";

const ICLOUD_CALDAV = "https://caldav.icloud.com";

/**
 * iCloud Calendar + Reminders sync over CalDAV.
 *
 * SCAFFOLD — the connection/discovery wiring is real (tsdav `login()`), but the
 * VEVENT/VTODO (de)serialization and the sync orchestration (ETag conflict
 * handling + SyncEntity bookkeeping) are stubbed and MUST be tested against a
 * live iCloud account before this is enabled in production. Auth uses a
 * per-user iCloud app-specific password (iCloud offers no OAuth for CalDAV).
 *
 * Conflict policy (per project_apple_acquisition_pivot): events = server_wins
 * (iCloud is source of truth, avoid double-booking); reminders = local_wins
 * (Sona owns user intent). Both overridable per ExternalProvider.
 */
export class ICloudCalDavProvider implements CalendarSyncProvider {
  readonly id = "icloud-caldav";
  private client: DAVClient;

  constructor(appleId: string, appSpecificPassword: string) {
    this.client = new DAVClient({
      serverUrl: ICLOUD_CALDAV,
      credentials: { username: appleId, password: appSpecificPassword },
      authMethod: "Basic",
      defaultAccountType: "caldav"
    });
  }

  async connect(): Promise<void> {
    await this.client.login();
  }

  async listEvents(): Promise<RemoteEvent[]> {
    // TODO: fetchCalendars() → calendarQuery for VEVENTs → parse iCal to RemoteEvent.
    throw new Error("caldav_listEvents_not_implemented");
  }

  async pushAlarm(_alarm: Alarm): Promise<RemoteRef> {
    // TODO: serialize Alarm (recurrence RRULE 1:1) to VEVENT → createCalendarObject.
    throw new Error("caldav_pushAlarm_not_implemented");
  }

  async deleteEvent(_uid: string): Promise<void> {
    throw new Error("caldav_deleteEvent_not_implemented");
  }

  async listTodos(): Promise<RemoteTodo[]> {
    // Apple Reminders are VTODO over the same CalDAV endpoint.
    throw new Error("caldav_listTodos_not_implemented");
  }

  async pushNote(_note: Note): Promise<RemoteRef> {
    throw new Error("caldav_pushNote_not_implemented");
  }
}
