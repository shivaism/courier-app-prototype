import { randomBytes } from "node:crypto";
import type { SseChannel } from "./realtimeService.js";

interface TicketRecord {
  channel: SseChannel;
  expiresAt: number;
}

const TICKET_TTL_MS = 60_000;

/**
 * Mints short-lived, one-use tickets for privileged EventSource connections. Native
 * EventSource cannot send an Authorization header, so the authenticated client first calls
 * POST /api/events/ticket with its JWT, then opens /api/events?ticket=... . The ticket is
 * bound to the authenticated actor's channel and cannot be reused or retargeted.
 */
export class SseTicketService {
  private tickets = new Map<string, TicketRecord>();

  mint(channel: SseChannel): { ticket: string; expiresInSeconds: number } {
    this.removeExpired();
    const ticket = randomBytes(24).toString("base64url");
    this.tickets.set(ticket, { channel, expiresAt: Date.now() + TICKET_TTL_MS });
    return { ticket, expiresInSeconds: TICKET_TTL_MS / 1000 };
  }

  consume(ticket: string): SseChannel | null {
    const record = this.tickets.get(ticket);
    this.tickets.delete(ticket); // one use, valid or expired
    if (!record || record.expiresAt <= Date.now()) return null;
    return record.channel;
  }

  private removeExpired(): void {
    const now = Date.now();
    for (const [ticket, record] of this.tickets.entries()) {
      if (record.expiresAt <= now) this.tickets.delete(ticket);
    }
  }
}
