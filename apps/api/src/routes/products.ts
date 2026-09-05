import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { successResponse, ForbiddenError, UnauthorizedError } from "@mashupkgrid/shared";
import { authenticate } from "../plugins/authenticate.js";
import { resolveTenant } from "../plugins/tenant.js";
import { checkMaintenance } from "../plugins/maintenance.js";
import { writeAuditLog } from "../lib/audit.js";

export interface HardwareProduct {
  id: string;
  name: string;
  slug: string;
  brand: string;
  category: "routers" | "switches" | "wireless" | "fiber" | "solar" | "cctv";
  price: number; // KES
  originalPrice?: number;
  stock: number;
  inStock: boolean;
  rating: number;
  reviewCount: number;
  badge?: string;
  shortDescription: string;
  description: string;
  imageUrl: string;
  specs: string[];
  warranty: string;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HardwareOrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

export interface HardwareOrder {
  id: string;
  customerName: string;
  phone: string;
  email?: string;
  county: string;
  deliveryAddress: string;
  items: HardwareOrderItem[];
  subtotal: number;
  shippingFee: number;
  totalAmount: number;
  mpesaReceiptNumber?: string;
  status: "PENDING" | "PAID" | "PROCESSING" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_PRODUCTS: HardwareProduct[] = [
  {
    id: "prod_mikrotik_hex",
    name: "MikroTik hEX (RB750Gr3) 5-Port Gigabit Router",
    slug: "mikrotik-hex-rb750gr3",
    brand: "MikroTik",
    category: "routers",
    price: 8500,
    originalPrice: 9500,
    stock: 42,
    inStock: true,
    rating: 4.9,
    reviewCount: 128,
    badge: "Bestseller",
    shortDescription: "5x Gigabit Ethernet, Dual Core 880MHz CPU, 256MB RAM, RouterOS L4. The gold standard for Kenyan hotspots.",
    description: "The MikroTik hEX is a 5-port Gigabit Ethernet router for locations where wireless connectivity is not required. Compact, affordable, and incredibly powerful with hardware encryption and full RouterOS v7 support.",
    imageUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&q=80",
    specs: [
      "5x 10/100/1000 Gigabit Ethernet Ports",
      "Dual Core 880MHz MT7621A CPU",
      "256MB RAM & Hardware IPsec Encryption",
      "Full RouterOS L4 License included",
      "Supports 150+ Concurrent Hotspot Vouchers",
    ],
    warranty: "1 Year Official MikroTik Warranty",
    featured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_mikrotik_hap_ax2",
    name: "MikroTik hAP ax2 (WiFi 6 Gen6 Dual-Band Router)",
    slug: "mikrotik-hap-ax2",
    brand: "MikroTik",
    category: "routers",
    price: 14800,
    originalPrice: 16500,
    stock: 18,
    inStock: true,
    rating: 4.8,
    reviewCount: 64,
    badge: "WiFi 6 High Speed",
    shortDescription: "WiFi 6 (802.11ax), Quad-Core 864MHz ARM CPU, 1GB RAM, 5x Gigabit Ports, PoE Out.",
    description: "Supercharge your café, restaurant, or residential hotspot with state-of-the-art WiFi 6 speeds up to 1800Mbps. Handles heavy simultaneous streaming effortlessly.",
    imageUrl: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80",
    specs: [
      "WiFi 6 802.11ax/ac Dual-Band (574 + 1200 Mbps)",
      "Quad-Core 864MHz IPQ-6010 ARM64 CPU",
      "1GB RAM & RouterOS v7 License 4",
      "5x Gigabit Ports with Passive PoE Output on Port 5",
      "Ideal for 80+ simultaneous wireless clients",
    ],
    warranty: "1 Year Official Warranty",
    featured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_mikrotik_rb5009",
    name: "MikroTik RB5009UG+S+IN Heavy-Duty Carrier Router",
    slug: "mikrotik-rb5009ug-s-in",
    brand: "MikroTik",
    category: "routers",
    price: 28500,
    originalPrice: 32000,
    stock: 12,
    inStock: true,
    rating: 5.0,
    reviewCount: 42,
    badge: "Carrier Grade",
    shortDescription: "7x 1G Ports, 1x 2.5G Port, 1x 10G SFP+ Cage, Quad-Core 1.4GHz, 1GB DDR4 RAM.",
    description: "The ultimate ISP aggregation router. Compact enough to mount four in a 1U rack, yet powerful enough to route 10Gbps line rate traffic with complex PPPoE queues and FreeRADIUS authentication.",
    imageUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&q=80",
    specs: [
      "1x 10G SFP+ Port for Fiber Uplink",
      "1x 2.5G Ultra-Fast Ethernet Port",
      "7x 1G Gigabit Ethernet Ports",
      "Marvell Armada Quad-Core 1.4GHz CPU",
      "1GB DDR4 RAM + RouterOS L5",
    ],
    warranty: "2 Years Carrier Warranty",
    featured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_mikrotik_ccr2004",
    name: "MikroTik Cloud Core CCR2004-16G-2S+ Gateway",
    slug: "mikrotik-ccr2004-16g-2s-plus",
    brand: "MikroTik",
    category: "routers",
    price: 65000,
    originalPrice: 72000,
    stock: 5,
    inStock: true,
    rating: 5.0,
    reviewCount: 19,
    badge: "Enterprise NOC Core",
    shortDescription: "16x Gigabit Ports, 2x 10G SFP+ Cages, 4GB RAM, 4-Core 1.7GHz AL32400 64-bit CPU.",
    description: "Engineered for regional Kenyan ISPs serving thousands of PPPoE and Hotspot customers. Dual redundant power supplies prevent downtime even during mains power outages.",
    imageUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&q=80",
    specs: [
      "16x Gigabit Ethernet Ports",
      "2x 10G SFP+ Fiber Transceiver Ports",
      "Annapurna Alpine 4-Core 1.7GHz 64-bit CPU",
      "4GB DDR4 High-Speed RAM",
      "Dual Redundant Built-In Power Supplies (100-240V)",
    ],
    warranty: "2 Years Carrier Warranty",
    featured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_hsgq_xpon_onu",
    name: "HSGQ XPON ONU 1GE+1FE+WiFi GPON/EPON",
    slug: "hsgq-xpon-onu-wifi",
    brand: "HSGQ",
    category: "routers",
    price: 2800,
    originalPrice: 3200,
    stock: 140,
    inStock: true,
    rating: 4.7,
    reviewCount: 88,
    badge: "Top Value",
    shortDescription: "Dual-mode GPON/EPON optical ONU with built-in 300Mbps WiFi & 2 LAN Ports.",
    description: "The standard subscriber unit deployed by leading Kenyan fiber ISPs. Auto-adapts to EPON and GPON OLTs with OMCI remote management, TR-069, and PPPoE dialer built-in.",
    imageUrl: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80",
    specs: [
      "SC/UPC or SC/APC Fiber Input",
      "1x Gigabit + 1x Fast Ethernet LAN",
      "300Mbps 2.4GHz High Gain 5dBi Antennas",
      "Supports PPPoE, Static IP, DHCP & Bridge modes",
      "Compatible with Huawei, ZTE, VSOL & HSGQ OLTs",
    ],
    warranty: "1 Year Replacement Warranty",
    featured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_ubiquiti_unifi_6_lite",
    name: "Ubiquiti UniFi 6 Lite (U6-Lite) Ceiling Access Point",
    slug: "ubiquiti-unifi-6-lite",
    brand: "Ubiquiti",
    category: "wireless",
    price: 16500,
    originalPrice: 18500,
    stock: 24,
    inStock: true,
    rating: 4.9,
    reviewCount: 76,
    badge: "Popular AP",
    shortDescription: "WiFi 6 2x2 MIMO, 1.5 Gbps aggregate throughput, PoE powered, sleek low-profile mount.",
    description: "Compact ceiling or wall-mounted access point with WiFi 6 technology. Perfect for high-density hotspot environments like hotel lobbies, shopping arcades, and student hostels.",
    imageUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&q=80",
    specs: [
      "WiFi 6 (802.11ax) 2x2 High-Efficiency MIMO",
      "5 GHz band (2x2 MU-MIMO and OFDMA) up to 1.2 Gbps",
      "2.4 GHz band (2x2 MIMO) up to 300 Mbps",
      "Powered with 802.3af standard PoE",
      "Centrally managed via UniFi Network application",
    ],
    warranty: "1 Year Official Warranty",
    featured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_ubiquiti_litebeam_5ac",
    name: "Ubiquiti LiteBeam 5AC Gen2 (LBE-5AC-Gen2) 23dBi",
    slug: "ubiquiti-litebeam-5ac-gen2",
    brand: "Ubiquiti",
    category: "wireless",
    price: 9200,
    originalPrice: 10500,
    stock: 35,
    inStock: true,
    rating: 4.8,
    reviewCount: 95,
    badge: "Long Range PtP",
    shortDescription: "5GHz airMAX ac CPE with 23dBi directional antenna for links up to 20km+.",
    description: "Lightweight and ultra-rugged point-to-point wireless bridge. Delivers 450+ Mbps throughput across long distances to connect remote base stations or estate towers.",
    imageUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&q=80",
    specs: [
      "5GHz airMAX ac technology (450+ Mbps)",
      "23dBi directional reflector antenna",
      "Dedicated management WiFi radio for instant smartphone setup",
      "InnerFeed technology integrates radio into feedhorn",
      "Gigabit Ethernet with 24V Passive PoE adapter included",
    ],
    warranty: "1 Year Official Warranty",
    featured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_mikrotik_crs326",
    name: "MikroTik CRS326-24G-2S+RM 24-Port Cloud Switch",
    slug: "mikrotik-crs326-24g-2s-rm",
    brand: "MikroTik",
    category: "switches",
    price: 26000,
    originalPrice: 29500,
    stock: 15,
    inStock: true,
    rating: 4.9,
    reviewCount: 38,
    badge: "10G Uplink",
    shortDescription: "24x Gigabit RJ45 Ports, 2x 10G SFP+ Ports, Dual Boot (RouterOS / SwOS), 1U Rackmount.",
    description: "Non-blocking wire-speed Layer 3 switch with dual SFP+ cages for 10Gbps fiber links. SwOS mode delivers lightning-fast switching, while RouterOS provides full L3 routing capabilities.",
    imageUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&q=80",
    specs: [
      "24x 10/100/1000 Gigabit RJ45 Ethernet Ports",
      "2x 10G SFP+ Optical Transceiver Cages",
      "Dual-Boot: SwOS (Switch OS) or RouterOS L5",
      "VLAN tagging, MAC filtering, Port Mirroring, Storm Control",
      "1U 19-Inch Rackmount Metal Enclosure",
    ],
    warranty: "1 Year Official Warranty",
    featured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_poe_switch_8port",
    name: "8-Port Gigabit 48V PoE Switch (120W Total Budget)",
    slug: "8-port-gigabit-48v-poe-switch",
    brand: "MashupKGrid Certified",
    category: "switches",
    price: 6500,
    originalPrice: 7800,
    stock: 28,
    inStock: true,
    rating: 4.8,
    reviewCount: 52,
    badge: "Essential",
    shortDescription: "8x Gigabit PoE+ Ports (802.3af/at) + 2x Gigabit Uplinks. Powers APs & CCTV cameras.",
    description: "Reliable plug-and-play PoE switch for powering access points and security cameras with built-in surge protection and 250m long-distance CCTV transmission mode.",
    imageUrl: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80",
    specs: [
      "8x 10/100/1000 Mbps PoE Ports (IEEE 802.3af/at)",
      "2x 10/100/1000 Mbps Gigabit Uplink Ports",
      "120W Total PoE Power Supply",
      "One-Key VLAN Isolation switch",
      "6kV Lightning & Surge Protection",
    ],
    warranty: "1 Year Official Warranty",
    featured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_mini_dc_ups",
    name: "Mini DC UPS 8800mAh Backup for Wi-Fi Routers",
    slug: "mini-dc-ups-8800mah-router-backup",
    brand: "MashupKGrid Certified",
    category: "solar",
    price: 3800,
    originalPrice: 4500,
    stock: 65,
    inStock: true,
    rating: 4.9,
    reviewCount: 140,
    badge: "Must-Have",
    shortDescription: "Keeps your MikroTik, ONU & fiber router running for 4-6 hours during KPLC blackouts.",
    description: "Never lose hotspot sales or client internet during power cuts. Automatically switches to lithium battery in zero milliseconds with multiple DC voltage outputs (9V/12V/15V/24V PoE).",
    imageUrl: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80",
    specs: [
      "8800mAh High-Capacity Li-Ion Battery Pack",
      "Outputs: 9V DC, 12V DC, 15V/24V Passive PoE & 5V USB",
      "0ms transfer time — router never reboots during power cut",
      "Smart overcharge and short-circuit protection",
      "Universal splitter cable included for dual router + ONU connection",
    ],
    warranty: "1 Year Replacement Warranty",
    featured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_fiber_drop_cable_1000m",
    name: "1000M FTTH 2-Core Single Mode Drop Cable Drum",
    slug: "1000m-ftth-2-core-drop-cable",
    brand: "MashupKGrid Certified",
    category: "fiber",
    price: 8500,
    originalPrice: 9800,
    stock: 22,
    inStock: true,
    rating: 4.9,
    reviewCount: 47,
    badge: "Bulk Saver",
    shortDescription: "G657A1 Bend-Insensitive 2-Core Fiber with steel strength messenger wire for aerial spans.",
    description: "Premium FTTH outdoor drop cable on a heavy wooden drum. Engineered to withstand intense tropical sun, wind tension, and tree branch friction without signal loss.",
    imageUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&q=80",
    specs: [
      "1000 Meters per wooden drum",
      "2-Core G657A1 Single Mode 9/125um fiber",
      "Phosphatized steel messenger wire (1.0mm) for pole spans",
      "Two parallel FRP strength members protect optical cores",
      "UV-resistant LSZH (Low Smoke Zero Halogen) jacket",
    ],
    warranty: "5 Years Manufacturer Warranty",
    featured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_sc_upc_connectors_100pk",
    name: "SC/UPC Fiber Fast Connectors (100-Pack Box)",
    slug: "sc-upc-fiber-fast-connectors-100pk",
    brand: "MashupKGrid Certified",
    category: "fiber",
    price: 3500,
    originalPrice: 4200,
    stock: 50,
    inStock: true,
    rating: 4.7,
    reviewCount: 63,
    badge: "Technician Favorite",
    shortDescription: "Field assembly optical connectors. Insertion loss <0.3dB, no fusion splicer needed.",
    description: "Terminate subscriber drops in under 90 seconds in the field. Pre-embedded fiber core and ceramic ferrule ensure low insertion loss and high return loss.",
    imageUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&q=80",
    specs: [
      "Standard SC/UPC Blue connector",
      "Insertion Loss: <= 0.3dB, Return Loss: >= 50dB",
      "Compatible with 2.0x3.0mm drop cable & 0.9mm fiber",
      "Reusable up to 10 times during field troubleshooting",
      "Packaged in 100-piece hard protective workshop box",
    ],
    warranty: "Quality Verified",
    featured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_sfp_plus_10g_module",
    name: "10G SFP+ 1310nm 10km Single Mode Optical Transceiver",
    slug: "10g-sfp-plus-10km-transceiver",
    brand: "MashupKGrid Certified",
    category: "fiber",
    price: 3200,
    originalPrice: 3800,
    stock: 40,
    inStock: true,
    rating: 5.0,
    reviewCount: 31,
    badge: "10G Speed",
    shortDescription: "10Gbps Dual LC 1310nm 10km DDM SFP+ Module, MikroTik & Ubiquiti 100% compatible.",
    description: "Plug-and-play 10 Gigabit optical transceiver for connecting MikroTik CCR routers, CRS switches, and OLT uplinks with live DDM temperature and optical power monitoring.",
    imageUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&q=80",
    specs: [
      "10 Gbps data rate (10GBASE-LR)",
      "1310nm DFB Laser transmitter up to 10km reach",
      "Dual LC Optical Interface",
      "Digital Diagnostic Monitoring (DDM/DOM) support",
      "Fully tested with MikroTik, Ubiquiti, Cisco, and Huawei gear",
    ],
    warranty: "2 Years Replacement Warranty",
    featured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod_lifepo4_battery_100ah",
    name: "12V 100Ah LiFePO4 Lithium Battery for POP Sites",
    slug: "12v-100ah-lifepo4-lithium-battery",
    brand: "MashupKGrid Certified",
    category: "solar",
    price: 42000,
    originalPrice: 48000,
    stock: 8,
    inStock: true,
    rating: 5.0,
    reviewCount: 22,
    badge: "10-Year Life",
    shortDescription: "4000+ Cycles, Smart BMS, 1.28kWh capacity. The ultimate battery for ISP base stations.",
    description: "Replaces 4x heavy lead-acid gel batteries with one compact lithium unit. Built-in smart BMS protects against over-discharge, overheating, and short circuits during heavy solar cycling.",
    imageUrl: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80",
    specs: [
      "12.8V Nominal Voltage / 100Ah Capacity (1280Wh)",
      "Grade-A LiFePO4 Prismatic Cells with 4,000+ deep cycles",
      "Integrated 100A Battery Management System (BMS)",
      "Supports series/parallel connections for 24V or 48V systems",
      "Weight: Only 11kg (1/3rd of equivalent lead acid battery)",
    ],
    warranty: "5 Years Manufacturer Warranty",
    featured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const DATA_DIR = path.join(process.cwd(), "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "hardware-products.json");
const ORDERS_FILE = path.join(DATA_DIR, "hardware-orders.json");

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PRODUCTS_FILE)) {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(DEFAULT_PRODUCTS, null, 2), "utf-8");
  }
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2), "utf-8");
  }
}

function loadProducts(): HardwareProduct[] {
  try {
    ensureDataFiles();
    const raw = fs.readFileSync(PRODUCTS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return DEFAULT_PRODUCTS;
  }
}

function saveProducts(products: HardwareProduct[]) {
  ensureDataFiles();
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), "utf-8");
}

function loadOrders(): HardwareOrder[] {
  try {
    ensureDataFiles();
    const raw = fs.readFileSync(ORDERS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveOrders(orders: HardwareOrder[]) {
  ensureDataFiles();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf-8");
}

// Check that caller is SUPER ADMIN (has no tenantId and has platform manage rights).
// Tenants MUST NOT be able to modify products or change prices.
function assertSuperAdmin(request: FastifyRequest) {
  if (!request.user) {
    throw new UnauthorizedError();
  }
  if (request.user.tenantId) {
    throw new ForbiddenError(
      "Tenant accounts cannot modify store product catalog or prices. Only platform Super Administrators can update pricing."
    );
  }
}

const updateProductSchema = z.object({
  name: z.string().min(2).optional(),
  brand: z.string().optional(),
  category: z.enum(["routers", "switches", "wireless", "fiber", "solar", "cctv"]).optional(),
  price: z.number().positive("Price must be greater than 0").optional(),
  originalPrice: z.number().positive().optional(),
  stock: z.number().int().nonnegative().optional(),
  inStock: z.boolean().optional(),
  badge: z.string().optional(),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  specs: z.array(z.string()).optional(),
  warranty: z.string().optional(),
  featured: z.boolean().optional(),
});

const createProductSchema = z.object({
  name: z.string().min(2),
  brand: z.string().default("MashupKGrid"),
  category: z.enum(["routers", "switches", "wireless", "fiber", "solar", "cctv"]),
  price: z.number().positive("Price must be greater than 0"),
  originalPrice: z.number().positive().optional(),
  stock: z.number().int().nonnegative().default(10),
  badge: z.string().optional(),
  shortDescription: z.string().min(5),
  description: z.string().min(10),
  imageUrl: z.string().url().default("https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&q=80"),
  specs: z.array(z.string()).default([]),
  warranty: z.string().default("1 Year Official Warranty"),
  featured: z.boolean().default(false),
});

const createOrderSchema = z.object({
  customerName: z.string().min(2),
  phone: z.string().min(9),
  email: z.string().email().optional(),
  county: z.string().min(2),
  deliveryAddress: z.string().min(5),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1, "Order must contain at least 1 item"),
  mpesaReceiptNumber: z.string().optional(),
});

export async function productRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = [authenticate, resolveTenant, checkMaintenance];

  // 1. PUBLIC: Get all products with optional category and search filters
  app.get("/", async (request, reply) => {
    const query = request.query as { category?: string; search?: string } | undefined;
    const products = loadProducts();
    const category = query?.category;
    const search = query?.search;

    let filtered = products;
    if (category && category !== "all") {
      filtered = filtered.filter((p) => p.category === category);
    }
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.shortDescription.toLowerCase().includes(q)
      );
    }

    return reply.send(successResponse(filtered, request.id));
  });

  // 2. PUBLIC: Get single product by id or slug
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const products = loadProducts();
    const product = products.find((p) => p.id === id || p.slug === id);
    if (!product) {
      return reply.code(404).send({ success: false, error: "Product not found" });
    }
    return reply.send(successResponse(product, request.id));
  });

  // 3. SUPER ADMIN ONLY: Create new product
  app.post(
    "/",
    { preHandler },
    async (request, reply) => {
      assertSuperAdmin(request);
      const parsed = createProductSchema.parse(request.body);

      const products = loadProducts();
      const slug = parsed.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const newProduct: HardwareProduct = {
        id: `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: parsed.name,
        slug,
        brand: parsed.brand,
        category: parsed.category,
        price: parsed.price,
        originalPrice: parsed.originalPrice,
        stock: parsed.stock,
        inStock: parsed.stock > 0,
        rating: 5.0,
        reviewCount: 0,
        badge: parsed.badge,
        shortDescription: parsed.shortDescription,
        description: parsed.description,
        imageUrl: parsed.imageUrl,
        specs: parsed.specs,
        warranty: parsed.warranty,
        featured: parsed.featured,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      products.unshift(newProduct);
      saveProducts(products);

      if (request.user) {
        await writeAuditLog({
          tenantId: null,
          actorUserId: request.user.id,
          action: "platform.product.created",
          resourceType: "HardwareProduct",
          resourceId: newProduct.id,
          after: newProduct,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });
      }

      return reply.code(201).send(successResponse(newProduct, request.id));
    }
  );

  // 4. SUPER ADMIN ONLY: Update product details & PRICES
  app.put(
    "/:id",
    { preHandler },
    async (request, reply) => {
      assertSuperAdmin(request);
      const { id } = request.params as { id: string };
      const parsed = updateProductSchema.parse(request.body);
      const products = loadProducts();

      const index = products.findIndex((p) => p.id === id);
      if (index === -1) {
        return reply.code(404).send({ success: false, error: "Product not found" });
      }

      const existing = products[index]!;
      const oldPrice = existing.price;

      const updated: HardwareProduct = {
        ...existing,
        ...parsed,
        inStock: parsed.stock !== undefined ? parsed.stock > 0 : existing.inStock,
        updatedAt: new Date().toISOString(),
      };

      products[index] = updated;
      saveProducts(products);

      if (request.user) {
        await writeAuditLog({
          tenantId: null,
          actorUserId: request.user.id,
          action: "platform.product.updated",
          resourceType: "HardwareProduct",
          resourceId: updated.id,
          before: { price: oldPrice },
          after: { price: updated.price },
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });
      }

      return reply.send(successResponse(updated, request.id));
    }
  );

  // 5. SUPER ADMIN ONLY: Delete product
  app.delete(
    "/:id",
    { preHandler },
    async (request, reply) => {
      assertSuperAdmin(request);
      const { id } = request.params as { id: string };
      const products = loadProducts();
      const index = products.findIndex((p) => p.id === id);
      if (index === -1) {
        return reply.code(404).send({ success: false, error: "Product not found" });
      }

      const removed = products.splice(index, 1)[0]!;
      saveProducts(products);

      if (request.user) {
        await writeAuditLog({
          tenantId: null,
          actorUserId: request.user.id,
          action: "platform.product.deleted",
          resourceType: "HardwareProduct",
          resourceId: removed.id,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });
      }

      return reply.send(successResponse({ deleted: true, id: removed.id }, request.id));
    }
  );

  // 6. PUBLIC: Submit customer hardware order
  app.post("/orders", async (request, reply) => {
    const parsed = createOrderSchema.parse(request.body);
    const products = loadProducts();

    let subtotal = 0;
    const orderItems: HardwareOrderItem[] = [];

    for (const item of parsed.items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        return reply.code(400).send({
          success: false,
          error: `Product with ID ${item.productId} does not exist in store`,
        });
      }
      const itemSubtotal = product.price * item.quantity;
      subtotal += itemSubtotal;
      orderItems.push({
        productId: product.id,
        name: product.name,
        quantity: item.quantity,
        price: product.price,
      });
    }

    const shippingFee = parsed.county.toLowerCase().includes("nairobi") ? 350 : 600;
    const totalAmount = subtotal + shippingFee;

    const orderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const newOrder: HardwareOrder = {
      id: orderId,
      customerName: parsed.customerName,
      phone: parsed.phone,
      email: parsed.email,
      county: parsed.county,
      deliveryAddress: parsed.deliveryAddress,
      items: orderItems,
      subtotal,
      shippingFee,
      totalAmount,
      mpesaReceiptNumber: parsed.mpesaReceiptNumber,
      status: parsed.mpesaReceiptNumber ? "PAID" : "PENDING",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const orders = loadOrders();
    orders.unshift(newOrder);
    saveOrders(orders);

    return reply.code(201).send(successResponse(newOrder, request.id));
  });

  // 7. SUPER ADMIN ONLY: Get all hardware orders
  app.get(
    "/orders",
    { preHandler },
    async (request, reply) => {
      assertSuperAdmin(request);
      const orders = loadOrders();
      return reply.send(successResponse(orders, request.id));
    }
  );

  // 8. SUPER ADMIN ONLY: Update order fulfillment status
  app.put(
    "/orders/:id/status",
    { preHandler },
    async (request, reply) => {
      assertSuperAdmin(request);
      const { id } = request.params as { id: string };
      const { status } = request.body as {
        status: "PENDING" | "PAID" | "PROCESSING" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
      };
      const orders = loadOrders();
      const index = orders.findIndex((o) => o.id === id);
      if (index === -1) {
        return reply.code(404).send({ success: false, error: "Order not found" });
      }

      orders[index]!.status = status;
      orders[index]!.updatedAt = new Date().toISOString();
      saveOrders(orders);

      return reply.send(successResponse(orders[index], request.id));
    }
  );
}
