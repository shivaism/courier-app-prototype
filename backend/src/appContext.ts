// Wires up the database and all 5 services (thin service-per-component pattern,
// application-design/services.md). Created once at startup and passed into route modules.

import type Database from "better-sqlite3";
import { MasterDataService } from "./services/masterDataService.js";
import { AuthService } from "./services/authService.js";
import { DeliveryService } from "./services/deliveryService.js";
import { RealtimeService } from "./services/realtimeService.js";
import { SeedService } from "./services/seedService.js";
import { LocationSimulatorService } from "./services/locationSimulatorService.js";
import { SseTicketService } from "./services/sseTicketService.js";
import { InquiryService } from "./services/inquiryService.js";

export interface AppContext {
  db: Database.Database;
  masterData: MasterDataService;
  auth: AuthService;
  delivery: DeliveryService;
  realtime: RealtimeService;
  seed: SeedService;
  locationSimulator: LocationSimulatorService;
  sseTickets: SseTicketService;
  inquiries: InquiryService;
}

export function createAppContext(db: Database.Database): AppContext {
  const masterData = new MasterDataService(db);
  const auth = new AuthService(db, masterData);
  const delivery = new DeliveryService(db, masterData);
  const realtime = new RealtimeService();
  const seed = new SeedService(db, masterData, delivery, auth);
  const locationSimulator = new LocationSimulatorService(db);
  const sseTickets = new SseTicketService();
  const inquiries = new InquiryService(db);

  realtime.subscribeToDomainEvents();
  locationSimulator.start();

  return { db, masterData, auth, delivery, realtime, seed, locationSimulator, sseTickets, inquiries };
}
