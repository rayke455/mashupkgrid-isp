"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { HardwareOrder, getHardwareOrders, updateOrderStatus } from "@/lib/hardware-store";

export default function AdminOrdersPage() {
  const { user } = useAuth();
  const isSuperAdmin = !!user && !user.tenantId;

  const [orders, setOrders] = useState<HardwareOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await getHardwareOrders();
      setOrders(data);
    } catch {
      setErrorMsg("Failed to load store orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      loadOrders();
    }
  }, [isSuperAdmin]);

  const handleStatusChange = async (orderId: string, status: HardwareOrder["status"]) => {
    try {
      setUpdatingId(orderId);
      const updated = await updateOrderStatus(orderId, status);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update order status";
      setErrorMsg(msg);
    } finally {
      setUpdatingId(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-2xl flex items-center justify-center mx-auto">
          🔒
        </div>
        <h2 className="text-2xl font-bold text-white">Super Administrator Access Required</h2>
        <p className="text-sm text-slate-400 max-w-lg mx-auto">
          Hardware order fulfillment is restricted to platform Super Administrators.
        </p>
        <Link
          href="/shop"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition-colors"
        >
          <span>🛒</span> Go to Hardware Store
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[11px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Fulfillment NOC
            </span>
            <span className="text-xs text-slate-400">• Customer M-Pesa Dispatches</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Hardware Orders & Kenya Deliveries
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor incoming customer purchases, verify M-Pesa transaction receipts, and manage parcel dispatches.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadOrders}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <span>🔄</span> Refresh Orders
          </button>
          <Link
            href="/admin/products"
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors flex items-center gap-1.5"
          >
            <span>⚙️</span> Manage Products & Prices
          </Link>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Orders Table */}
      <div className="rounded-2xl bg-slate-950 border border-slate-800/80 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3.5 px-4">Order ID & Date</th>
                <th className="py-3.5 px-4">Recipient & Phone</th>
                <th className="py-3.5 px-4">Destination</th>
                <th className="py-3.5 px-4">Items</th>
                <th className="py-3.5 px-4 font-bold text-cyan-300">Total (KES)</th>
                <th className="py-3.5 px-4">M-Pesa Receipt</th>
                <th className="py-3.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    Loading orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    No hardware orders placed yet.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono">
                      <p className="font-bold text-cyan-400">{order.id}</p>
                      <p className="text-[10px] text-slate-500">
                        {new Date(order.createdAt).toLocaleDateString("en-KE", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-white">{order.customerName}</p>
                      <p className="text-cyan-400 font-mono text-[11px]">{order.phone}</p>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-200">{order.county}</p>
                      <p className="text-slate-400 text-[11px] truncate max-w-xs">{order.deliveryAddress}</p>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        {order.items.map((it, idx) => (
                          <div key={idx} className="text-[11px] text-slate-300">
                            <span className="text-cyan-400 font-bold">{it.quantity}x</span> {it.name}
                          </div>
                        ))}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-cyan-300">
                      KES {order.totalAmount.toLocaleString()}
                    </td>

                    <td className="py-3.5 px-4 font-mono">
                      {order.mpesaReceiptNumber ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-[11px]">
                          {order.mpesaReceiptNumber}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">Unpaid</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <select
                        value={order.status}
                        disabled={updatingId === order.id}
                        onChange={(e) =>
                          handleStatusChange(order.id, e.target.value as HardwareOrder["status"])
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border bg-slate-900 focus:outline-none ${
                          order.status === "DELIVERED"
                            ? "text-emerald-400 border-emerald-500/40"
                            : order.status === "DISPATCHED"
                            ? "text-cyan-400 border-cyan-500/40"
                            : order.status === "PAID"
                            ? "text-blue-400 border-blue-500/40"
                            : "text-amber-400 border-amber-500/40"
                        }`}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="PAID">Paid</option>
                        <option value="PROCESSING">Processing</option>
                        <option value="DISPATCHED">Dispatched</option>
                        <option value="DELIVERED">Delivered</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
