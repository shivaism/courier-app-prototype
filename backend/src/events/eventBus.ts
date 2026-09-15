// Lightweight in-process event emitter used to decouple DeliveryService from RealtimeService
// (Application Design Question 5, business-rules.md BR-10).
//
// This is the ONLY event-based communication path in the system — everything else uses
// direct synchronous service calls (see component-dependency.md).

import { EventEmitter } from "node:events";
import type { DomainEvent } from "../domain/types.js";

class DomainEventBus extends EventEmitter {
  publish(event: DomainEvent): void {
    this.emit(event.eventType, event);
    // Also emit a generic "domainEvent" so subscribers can listen once for all types
    this.emit("domainEvent", event);
  }
}

// Singleton — a single shared event bus for the whole backend process.
export const eventBus = new DomainEventBus();
// Raised from the default of 10: in production only one AppContext (and therefore one
// RealtimeService + one LocationSimulatorService) subscribes per process, but the test
// suite creates many short-lived AppContexts in the same process, each adding a listener.
eventBus.setMaxListeners(50);
