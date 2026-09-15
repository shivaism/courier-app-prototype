// Seed Component (application-design/components.md #5): populates sample data on startup
// so the system is immediately demonstrable (SYS-1 / FR-S1).

import type Database from "better-sqlite3";
import bcrypt from "bcrypt";
import type { MasterDataService } from "./masterDataService.js";
import type { DeliveryService } from "./deliveryService.js";
import type { AuthService } from "./authService.js";

const BCRYPT_ROUNDS = 10;

export class SeedService {
  constructor(
    private db: Database.Database,
    private masterData: MasterDataService,
    private delivery: DeliveryService,
    private auth: AuthService
  ) {}

  async seedIfEmpty(): Promise<{ seeded: boolean; counts?: Record<string, number> }> {
    const existingCamps = this.masterData.listCamps();
    if (existingCamps.length > 0) {
      return { seeded: false };
    }

    const camp1 = this.masterData.createCamp({
      name: "Seoul Gangnam Camp",
      assignedArea: "Gangnam-gu",
      latitude: 37.4979,
      longitude: 127.0276,
    });
    const camp2 = this.masterData.createCamp({
      name: "Seoul Mapo Camp",
      assignedArea: "Mapo-gu",
      latitude: 37.5663,
      longitude: 126.9019,
    });

    const driverPasswordHash = await bcrypt.hash("driver123", BCRYPT_ROUNDS);
    const driver1 = this.masterData.createDriver({
      employeeId: "EMP001",
      name: "Kim Minjun",
      passwordHash: driverPasswordHash,
      assignedArea: "Gangnam-gu",
      contact: "010-1234-5678",
    });
    const driver2 = this.masterData.createDriver({
      employeeId: "EMP002",
      name: "Lee Seoyeon",
      passwordHash: driverPasswordHash,
      assignedArea: "Mapo-gu",
      contact: "010-2345-6789",
    });

    const adminPasswordHash = await bcrypt.hash("admin123", BCRYPT_ROUNDS);
    this.auth.createAdminUser("morgan", adminPasswordHash);

    // Create sample deliveries spanning a range of statuses so all UI states are demonstrable.
    const d1 = this.delivery.createDelivery({
      productName: "Wireless Earbuds",
      address: "123 Teheran-ro, Gangnam-gu, Seoul",
      campId: camp1.id,
      requestNote: "Leave at the door and ring the bell",
    });

    const d2 = this.delivery.createDelivery({
      productName: "Running Shoes",
      address: "45 World Cup-ro, Mapo-gu, Seoul",
      campId: camp2.id,
    });
    this.delivery.updateStatus(d2.id, "pickup", "system");
    this.delivery.updateStatus(d2.id, "line_haul_loaded", "system");

    const d3 = this.delivery.createDelivery({
      productName: "Coffee Maker",
      address: "78 Seocho-daero, Gangnam-gu, Seoul",
      campId: camp1.id,
    });
    this.delivery.assignDriver(d3.id, driver1.id, "system");
    this.delivery.updateStatus(d3.id, "pickup", "system");
    this.delivery.updateStatus(d3.id, "line_haul_loaded", "system");
    this.delivery.updateStatus(d3.id, "arrived_at_camp", "system");
    this.delivery.updateStatus(d3.id, "out_for_delivery", "system");

    const d4 = this.delivery.createDelivery({
      productName: "Desk Lamp",
      address: "12 Yanghwa-ro, Mapo-gu, Seoul",
      campId: camp2.id,
    });
    this.delivery.assignDriver(d4.id, driver2.id, "system");
    this.delivery.updateStatus(d4.id, "pickup", "system");
    this.delivery.updateStatus(d4.id, "line_haul_loaded", "system");
    this.delivery.updateStatus(d4.id, "arrived_at_camp", "system");
    this.delivery.updateStatus(d4.id, "out_for_delivery", "system");
    this.delivery.completeDelivery(
      d4.id,
      { receiptMethod: "at_door", proofOfDeliveryPhotoUrl: "https://example.com/photos/pod-d4.jpg" },
      "driver:EMP002"
    );

    const d5 = this.delivery.createDelivery({
      productName: "Bluetooth Speaker",
      address: "9 Nonhyeon-ro, Gangnam-gu, Seoul",
      campId: camp1.id,
    });
    this.delivery.assignDriver(d5.id, driver1.id, "system");
    this.delivery.updateStatus(d5.id, "pickup", "system");
    this.delivery.updateStatus(d5.id, "line_haul_loaded", "system");
    this.delivery.updateStatus(d5.id, "arrived_at_camp", "system");
    this.delivery.updateStatus(d5.id, "out_for_delivery", "system");
    this.delivery.reportFailure(d5.id, "recipient_absent", "No answer after 2 attempts", "driver:EMP001");

    return {
      seeded: true,
      counts: { camps: 2, drivers: 2, admins: 1, deliveries: 5 },
    };
  }
}
