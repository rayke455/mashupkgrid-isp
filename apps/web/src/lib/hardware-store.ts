"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "./api-client";

/** A product as the store API returns it. Prices are whole shillings. */
export interface HardwareProduct {
  id: string;
  name: string;
  slug: string;
  brand: string;
  category: "routers" | "switches" | "wireless" | "fiber" | "solar" | "cctv";
  price: number;
  originalPrice?: number;
  stock: number;
  inStock: boolean;
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

export type PaymentMethod = "MPESA" | "PAY_ON_DELIVERY";
export type OrderStatus = "PENDING" | "PAID" | "PROCESSING" | "DISPATCHED" | "DELIVERED" | "CANCELLED";

/** An order as the API returns it. `id` is the order number, e.g. "ORD-482913". */
export interface HardwareOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  email?: string;
  county: string;
  deliveryAddress: string;
  items: HardwareOrderItem[];
  subtotal: number;
  shippingFee: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  mpesaReceiptNumber?: string;
  /** Why the last M-Pesa attempt didn't go through. */
  paymentNote?: string;
  /** An M-Pesa prompt is out and not yet answered. */
  awaitingMpesa: boolean;
  paidAt?: string;
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

/** Delivery charge the server applies: Nairobi, or anywhere else in Kenya. Shown before ordering. */
export function shippingFeeFor(county: string): number {
  return county.toLowerCase().includes("nairobi") ? 350 : 600;
}

// --- Global Synchronized Cart Store ---
let memoryCart: CartItem[] = [];
let isCartLoaded = false;
const cartListeners = new Set<() => void>();

function initMemoryCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  if (!isCartLoaded) {
    try {
      const saved = localStorage.getItem("mashupkgrid_cart");
      if (saved) {
        memoryCart = JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    isCartLoaded = true;
  }
  return memoryCart;
}

function notifyCartListeners() {
  cartListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore
    }
  });
}

function updateCart(nextItems: CartItem[]) {
  memoryCart = nextItems;
  isCartLoaded = true;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("mashupkgrid_cart", JSON.stringify(nextItems));
    } catch {
      // ignore
    }
  }
  notifyCartListeners();
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Ensure initialized from storage on client mount
    setItems([...initMemoryCart()]);
    setIsInitialized(true);

    const handleStoreChange = () => {
      setItems([...memoryCart]);
    };

    cartListeners.add(handleStoreChange);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "mashupkgrid_cart" && e.newValue) {
        try {
          memoryCart = JSON.parse(e.newValue);
          setItems([...memoryCart]);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      cartListeners.delete(handleStoreChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const addItem = (product: HardwareProduct, quantity = 1) => {
    initMemoryCart();
    const index = memoryCart.findIndex((i) => i.product.id === product.id);
    let next: CartItem[];
    if (index > -1) {
      next = memoryCart.map((item, idx) =>
        idx === index ? { ...item, quantity: item.quantity + quantity } : item
      );
    } else {
      next = [...memoryCart, { product, quantity }];
    }
    updateCart(next);
  };

  const removeItem = (productId: string) => {
    initMemoryCart();
    const next = memoryCart.filter((i) => i.product.id !== productId);
    updateCart(next);
  };

  const updateQuantity = (productId: string, quantity: number) => {
    initMemoryCart();
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    const next = memoryCart.map((i) =>
      i.product.id === productId ? { ...i, quantity } : i
    );
    updateCart(next);
  };

  const clearCart = () => {
    updateCart([]);
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

// --- Catalogue ---------------------------------------------------------------------------------

/** The live catalogue. Throws when the store can't be reached: showing made-up prices or stock
 *  instead would let someone order something that isn't really there. */
export async function getProducts(category?: string, search?: string): Promise<HardwareProduct[]> {
  const params = new URLSearchParams();
  if (category && category !== "all") params.set("category", category);
  if (search) params.set("search", search);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<HardwareProduct[]>(`/api/v1/products${qs}`, { skipAuth: true });
}

// SUPER ADMIN ONLY
export async function updateProductPrice(productId: string, newPrice: number): Promise<HardwareProduct> {
  return apiFetch<HardwareProduct>(`/api/v1/products/${productId}`, { method: "PUT", body: JSON.stringify({ price: newPrice }) });
}

export async function updateProduct(productId: string, data: Partial<HardwareProduct>): Promise<HardwareProduct> {
  return apiFetch<HardwareProduct>(`/api/v1/products/${productId}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function createProduct(data: Omit<HardwareProduct, "id" | "slug" | "createdAt" | "updatedAt" | "inStock">): Promise<HardwareProduct> {
  return apiFetch<HardwareProduct>("/api/v1/products", { method: "POST", body: JSON.stringify(data) });
}

export async function deleteProduct(productId: string): Promise<{ deleted: boolean; id: string }> {
  return apiFetch<{ deleted: boolean; id: string }>(`/api/v1/products/${productId}`, { method: "DELETE" });
}

// --- Orders ------------------------------------------------------------------------------------

/** Places the order. For M-Pesa the payment prompt is sent in the same call; `paymentError` says
 *  why when it couldn't be, and the order waits for a retry. */
export async function placeOrder(order: {
  customerName: string;
  phone: string;
  email?: string;
  county: string;
  deliveryAddress: string;
  items: { productId: string; quantity: number }[];
  paymentMethod: PaymentMethod;
}): Promise<{ order: HardwareOrder; paymentError: string | null }> {
  const result = await apiFetch<{ order: HardwareOrder; paymentError: string | null }>("/api/v1/products/orders", {
    method: "POST",
    body: JSON.stringify(order),
    skipAuth: true,
  });
  rememberOrder(result.order.orderNumber, order.phone);
  return result;
}

/** The buyer's own order. `verify` asks M-Pesa directly ("I've paid"). */
export async function getOrder(orderNumber: string, phone: string, verify = false): Promise<HardwareOrder> {
  const qs = new URLSearchParams({ phone, ...(verify ? { verify: "true" } : {}) });
  return apiFetch<HardwareOrder>(`/api/v1/products/orders/${encodeURIComponent(orderNumber)}?${qs}`, { skipAuth: true });
}

/** Sends the M-Pesa prompt again. */
export async function retryOrderPayment(orderNumber: string, phone: string): Promise<HardwareOrder> {
  return apiFetch<HardwareOrder>(`/api/v1/products/orders/${encodeURIComponent(orderNumber)}/pay`, {
    method: "POST",
    body: JSON.stringify({ phone }),
    skipAuth: true,
  });
}

/** Finds an order by its number or M-Pesa receipt, with the phone it was placed with. */
export async function trackOrder(query: string, phone: string): Promise<HardwareOrder> {
  const params = new URLSearchParams({ q: query.trim().toUpperCase(), phone: phone.replace(/\s+/g, "") });
  return apiFetch<HardwareOrder>(`/api/v1/products/orders/track?${params}`, { skipAuth: true });
}

/** This browser's recent orders, so the tracking page can offer them. Only numbers are kept:
 *  the order itself always comes fresh from the server. */
const RECENT_ORDERS_KEY = "mkg_store_recent_orders";
export interface RecentOrderRef {
  orderNumber: string;
  phone: string;
}
function rememberOrder(orderNumber: string, phone: string) {
  try {
    const list: RecentOrderRef[] = JSON.parse(localStorage.getItem(RECENT_ORDERS_KEY) ?? "[]");
    const next = [{ orderNumber, phone }, ...list.filter((o) => o.orderNumber !== orderNumber)].slice(0, 10);
    localStorage.setItem(RECENT_ORDERS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: tracking by number still works.
  }
}
export function recentOrders(): RecentOrderRef[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_ORDERS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

// SUPER ADMIN ONLY
export async function getHardwareOrders(): Promise<HardwareOrder[]> {
  return apiFetch<HardwareOrder[]>("/api/v1/products/orders");
}

export async function updateOrderStatus(orderNumber: string, status: OrderStatus): Promise<HardwareOrder> {
  return apiFetch<HardwareOrder>(`/api/v1/products/orders/${encodeURIComponent(orderNumber)}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}
