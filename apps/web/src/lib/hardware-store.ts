"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "./api-client";

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

export interface CartItem {
  product: HardwareProduct;
  quantity: number;
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

export const KENYA_COUNTIES = [
  "Nairobi",
  "Kiambu",
  "Machakos",
  "Kajiado",
  "Mombasa",
  "Nakuru",
  "Uasin Gishu (Eldoret)",
  "Kisumu",
  "Kilifi",
  "Nyeri",
  "Meru",
  "Kisii",
  "Kericho",
  "Kakamega",
  "Bungoma",
  "Laikipia",
  "Embu",
  "Murang'a",
  "Trans Nzoia (Kitale)",
  "Other Kenya County",
];

// Fallback items in case backend is loading or offline
export const FALLBACK_PRODUCTS: HardwareProduct[] = [
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
    id: "prod_mini_dc_ups",
    name: "Mini DC UPS 8800mAh Backup for Wi-Fi Routers",
    slug: "mini-dc-ups-8800mah-router-backup",
    brand: "WaveCore Certified",
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
    id: "prod_sfp_plus_10g_module",
    name: "10G SFP+ 1310nm 10km Single Mode Optical Transceiver",
    slug: "10g-sfp-plus-10km-transceiver",
    brand: "WaveCore Certified",
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
];

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("mashupkgrid_cart");
      if (saved) {
        setItems(JSON.parse(saved));
      }
    } catch {
      // ignore
    } finally {
      setIsInitialized(true);
    }
  }, []);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem("mashupkgrid_cart", JSON.stringify(items));
    }
  }, [items, isInitialized]);

  const addItem = (product: HardwareProduct, quantity = 1) => {
    setItems((prev) => {
      const index = prev.findIndex((i) => i.product.id === product.id);
      if (index > -1) {
        const next = [...prev];
        next[index] = { ...next[index]!, quantity: next[index]!.quantity + quantity };
        return next;
      }
      return [...prev, { product, quantity }];
    });
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity } : i))
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const subtotal = items.reduce((acc, i) => acc + i.product.price * i.quantity, 0);
  const itemCount = items.reduce((acc, i) => acc + i.quantity, 0);

  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    subtotal,
    itemCount,
    isInitialized,
  };
}

export async function getProducts(category?: string, search?: string): Promise<HardwareProduct[]> {
  try {
    const params = new URLSearchParams();
    if (category && category !== "all") params.set("category", category);
    if (search) params.set("search", search);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return await apiFetch<HardwareProduct[]>(`/api/v1/products${qs}`);
  } catch {
    return FALLBACK_PRODUCTS;
  }
}

// SUPER ADMIN ONLY: Update price of a hardware product
export async function updateProductPrice(productId: string, newPrice: number): Promise<HardwareProduct> {
  return await apiFetch<HardwareProduct>(`/api/v1/products/${productId}`, {
    method: "PUT",
    body: JSON.stringify({ price: newPrice }),
  });
}

// SUPER ADMIN ONLY: Update full product fields
export async function updateProduct(productId: string, data: Partial<HardwareProduct>): Promise<HardwareProduct> {
  return await apiFetch<HardwareProduct>(`/api/v1/products/${productId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// SUPER ADMIN ONLY: Create new product
export async function createProduct(data: Omit<HardwareProduct, "id" | "slug" | "createdAt" | "updatedAt" | "rating" | "reviewCount">): Promise<HardwareProduct> {
  return await apiFetch<HardwareProduct>("/api/v1/products", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// SUPER ADMIN ONLY: Delete product
export async function deleteProduct(productId: string): Promise<{ deleted: boolean; id: string }> {
  return await apiFetch<{ deleted: boolean; id: string }>(`/api/v1/products/${productId}`, {
    method: "DELETE",
  });
}

// PUBLIC: Submit customer hardware order
export async function submitHardwareOrder(order: {
  customerName: string;
  phone: string;
  email?: string;
  county: string;
  deliveryAddress: string;
  items: { productId: string; quantity: number }[];
  mpesaReceiptNumber?: string;
}): Promise<HardwareOrder> {
  return await apiFetch<HardwareOrder>("/api/v1/products/orders", {
    method: "POST",
    body: JSON.stringify(order),
  });
}

// SUPER ADMIN ONLY: List all orders
export async function getHardwareOrders(): Promise<HardwareOrder[]> {
  return await apiFetch<HardwareOrder[]>("/api/v1/products/orders");
}

// SUPER ADMIN ONLY: Update order fulfillment status
export async function updateOrderStatus(orderId: string, status: HardwareOrder["status"]): Promise<HardwareOrder> {
  return await apiFetch<HardwareOrder>(`/api/v1/products/orders/${orderId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}
