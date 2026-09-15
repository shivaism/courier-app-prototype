// Realtime Component (application-design/components.md #4): single shared SSE broadcaster.
// Implements BR-10: subscribes to the shared event bus and forwards matching events to
// connected clients based on their subscription channel.

import type { Response } from "express";
import { eventBus } from "../events/eventBus.js";
import type { DomainEvent } from "../domain/types.js";

export type SseChannel =
  | { type: "tracking"; trackingNumber: string }
  | { type: "driver"; driverId: number }
  | { type: "all" };

interface Connection {
  id: number;
  res: Response;
  channel: SseChannel;
  heartbeat: ReturnType<typeof setInterval>;
}

let nextConnectionId = 1;

export class RealtimeService {
  private connections: Map<number, Connection> = new Map();
  private subscribed = false;

  /** Attaches this service's forwarding logic to the shared event bus. Call once at startup. */
  subscribeToDomainEvents(): void {
    if (this.subscribed) return;
    eventBus.on("domainEvent", (event: DomainEvent) => this.forwardToMatchingConnections(event));
    this.subscribed = true;
  }

  /** Registers a new SSE connection and keeps it open. */
  handleSseConnection(res: Response, channel: SseChannel): number {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    // Initial comment to open the stream promptly for clients waiting on first byte.
    res.write(": connected\n\n");

    const id = nextConnectionId++;
    this.connections.set(id, { id, res, channel });

    res.on("close", () => this.removeConnection(id));

    return id;
  }

  removeConnection(connectionId: number): void {
    this.connections.delete(connectionId);
  }

  /** Exposed for tests/inspection. */
  get connectionCount(): number {
    return this.connections.size;
  }

  private forwardToMatchingConnections(event: DomainEvent): void {
    for (const connection of this.connections.values()) {
      if (this.matches(connection.channel, event)) {
        this.publish(connection.res, event);
      }
    }
  }

  private matches(channel: SseChannel, event: DomainEvent): boolean {
    if (channel.type === "all") return true;
    if (channel.type === "tracking") return channel.trackingNumber === event.trackingNumber;
    if (channel.type === "driver") return channel.driverId === event.driverId;
    return false;
  }

  private publish(res: Response, event: DomainEvent): void {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}
