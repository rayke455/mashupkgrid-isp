"use client";

import React, { useState, useEffect } from "react";
import type {
  AppTab,
  CustomerProfile,
  InternetPackage,
  TvPackage,
  TransactionItem,
  SupportTicket,
  ConnectedDevice,
} from "./types";
import {
  HomeIcon,
  LayersIcon,
  CreditCardIcon,
  HeadphonesIcon,
  UserIcon,
  BellIcon,
  MessageSquareIcon,
  WifiIcon,
} from "./icons";
import { AuthView } from "./views/AuthView";
import { HomeView } from "./views/HomeView";
import { ServicesView } from "./views/ServicesView";
import { PaymentsView } from "./views/PaymentsView";
import { SupportView } from "./views/SupportView";
import { ProfileView } from "./views/ProfileView";
import { PaymentModal } from "./modals/PaymentModal";
import { TicketModal } from "./modals/TicketModal";
import { SpeedTestModal } from "./modals/SpeedTestModal";
import { ChatModal } from "./modals/ChatModal";

interface CustomerAppShellProps {
  tenantSlug?: string;
  initialBrandName?: string;
}

const DEFAULT_CUSTOMER: CustomerProfile = {
  id: "cust-demo-macharia",
  fullName: "Macharia",
  phone: "+254 724 165 988",
  email: "macharia@gmail.com",
  customerNumber: "CUST-10452",
  accountNumber: "ACC-88921",
  photoUrl: "/cartoons/yellow-boy.jpg",
  address: "Kilimani Heights, Block B, Apt 402, Nairobi",
  outstandingBalance: 45.0,
  currency: "KES",
  dueDate: "15 Sept",
  referralCode: "MACHARIA25",
  referralStats: {
    totalReferrals: 12,
    successfulReferrals: 8,
    pendingReferrals: 4,
    totalEarnedKes: 800,
  },
  internetService: {
    id: "srv-net-01",
    packageName: "Fiber 50Mbps",
    speedMbps: 50,
    status: "ACTIVE",
    expiresAt: "12 Sept",
    daysRemaining: 12,
    priceKes: 2000,
    dataUsedGb: 84.5,
    dataCapGb: null,
  },
  tvService: {
    id: "srv-tv-01",
    packageName: "Premium",
    channelsCount: 100,
    status: "ACTIVE",
    expiresAt: "12 Sept",
    daysRemaining: 12,
    priceKes: 1000,
  },
};

const DEFAULT_INTERNET_PACKAGES: InternetPackage[] = [
  {
    id: "pkg-10mbps",
    name: "10 Mbps",
    tier: "Starter",
    speedMbps: 10,
    priceKes: 1000,
    priceUsd: 29,
    features: ["Basic Browsing", "SD Streaming"],
    badge: null,
  },
  {
    id: "pkg-20mbps",
    name: "20 Mbps",
    tier: "Essential",
    speedMbps: 20,
    priceKes: 1500,
    priceUsd: 49,
    features: ["HD Streaming", "Multiple Devices"],
    badge: null,
  },
  {
    id: "pkg-50mbps",
    name: "50 Mbps",
    tier: "Advanced",
    speedMbps: 50,
    priceKes: 2000,
    priceUsd: 79,
    features: ["4K Streaming", "Online Gaming", "Smart Home Ready"],
    badge: "CURRENT PLAN",
    isPopular: true,
  },
  {
    id: "pkg-100mbps",
    name: "100 Mbps",
    tier: "Ultra",
    speedMbps: 100,
    priceKes: 3000,
    priceUsd: 119,
    features: ["8K Streaming", "Pro Gaming & WFH", "Priority Support"],
    badge: null,
  },
];

const DEFAULT_TV_PACKAGES: TvPackage[] = [
  {
    id: "tv-basic",
    name: "TV BASIC",
    tier: "Basic",
    priceKes: 500,
    priceUsd: 15,
    channelsCount: 50,
    channelsList: ["Citizen TV", "KTN Home", "NTV", "K24", "SuperSport Blitz", "Al Jazeera", "BBC News", "Cartoon Network", "NatGeo Wild", "E!"],
    features: ["50+ HD Channels", "Local & News", "Mobile & Smart TV App"],
  },
  {
    id: "tv-premium",
    name: "TV PREMIUM",
    tier: "Premium",
    priceKes: 1000,
    priceUsd: 30,
    channelsCount: 100,
    channelsList: ["SuperSport Premier League", "SuperSport LaLiga", "WWE Channel", "M-Net Movies 1 & 2", "Discovery Channel", "Nickelodeon", "Disney Channel", "CNN", "Sky News", "MTV Base"],
    features: ["100+ Channels", "Premier League & Sports", "4K Ultra HD", "3 Devices Concurrently"],
    badge: "CURRENT PLAN",
  },
  {
    id: "tv-premium-plus",
    name: "TV PREMIUM PLUS",
    tier: "Ultra",
    priceKes: 1500,
    priceUsd: 45,
    channelsCount: 150,
    channelsList: ["All SuperSport Channels", "Champions League", "F1 Channel", "M-Net Movies 1-4", "HBO Max Hits", "History Channel", "National Geographic", "Boomerang", "Food Network", "BeIN Sports"],
    features: ["150+ Channels", "Full Sports & Cinema Pack", "5 Concurrent Devices", "Cloud DVR Recording"],
  },
];

const DEFAULT_TRANSACTIONS: TransactionItem[] = [
  {
    id: "TX-99812",
    date: "28 Aug 2026, 09:14 AM",
    amount: 2000,
    service: "Fiber 50Mbps Renewal",
    method: "M-PESA (STK Push)",
    reference: "QGH1234567",
    status: "SUCCESS",
  },
  {
    id: "TX-99450",
    date: "28 Jul 2026, 11:30 AM",
    amount: 2000,
    service: "Fiber 50Mbps Renewal",
    method: "M-PESA",
    reference: "QFF8819201",
    status: "SUCCESS",
  },
  {
    id: "TX-98711",
    date: "28 Jun 2026, 08:22 AM",
    amount: 1000,
    service: "TV Premium Subscription",
    method: "Pesapal",
    reference: "PESA-4481029",
    status: "SUCCESS",
  },
];

const DEFAULT_TICKETS: SupportTicket[] = [
  {
    id: "FC-99234",
    subject: "Intermittent Connection",
    category: "Connection problem",
    status: "OPEN",
    createdAt: "Oct 24, 2026",
    messages: [
      { sender: "customer", text: "My Wi-Fi drops every evening around 8 PM.", time: "10:15 AM" },
      { sender: "support", text: "We have dispatched a line technician to check the fiber junction box.", time: "10:45 AM" },
    ],
  },
  {
    id: "FC-88120",
    subject: "Router Upgrade Request",
    category: "Equipment",
    status: "RESOLVED",
    createdAt: "Oct 10, 2026",
    messages: [
      { sender: "customer", text: "Requested Dual-Band Wi-Fi 6 router replacement.", time: "2:00 PM" },
      { sender: "support", text: "Gigabit ONT router successfully installed and tested.", time: "4:30 PM" },
    ],
  },
];

const DEFAULT_DEVICES: ConnectedDevice[] = [
  { id: "dev-01", name: "Samsung Galaxy S24", ip: "192.168.88.45", mac: "DC:A6:32:89:11:AB", isBlocked: false, type: "phone" },
  { id: "dev-02", name: "iPhone 15 Pro Max", ip: "192.168.88.78", mac: "F4:D4:88:99:32:CC", isBlocked: false, type: "phone" },
  { id: "dev-03", name: "MacBook Pro M3", ip: "192.168.88.102", mac: "3C:22:FB:44:91:02", isBlocked: false, type: "laptop" },
  { id: "dev-04", name: "LG 4K OLED Smart TV", ip: "192.168.88.15", mac: "00:E0:4C:68:01:FE", isBlocked: false, type: "tv" },
  { id: "dev-05", name: "PlayStation 5 Console", ip: "192.168.88.90", mac: "70:9E:29:EE:41:88", isBlocked: false, type: "gaming" },
];

export function CustomerAppShell({
  tenantSlug = "demo-isp",
  initialBrandName = "FiberConnect",
}: CustomerAppShellProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [currentTab, setCurrentTab] = useState<AppTab>("home");
  const [customer, setCustomer] = useState<CustomerProfile>(DEFAULT_CUSTOMER);
  const [internetPackages] = useState<InternetPackage[]>(DEFAULT_INTERNET_PACKAGES);
  const [tvPackages] = useState<TvPackage[]>(DEFAULT_TV_PACKAGES);
  const [transactions, setTransactions] = useState<TransactionItem[]>(DEFAULT_TRANSACTIONS);
  const [tickets, setTickets] = useState<SupportTicket[]>(DEFAULT_TICKETS);
  const [devices, setDevices] = useState<ConnectedDevice[]>(DEFAULT_DEVICES);

  // Frame simulator state
  const [simulatePhoneFrame, setSimulatePhoneFrame] = useState(false);

  // Modals state
  const [payModal, setPayModal] = useState<{
    isOpen: boolean;
    serviceType: "INTERNET" | "TV" | "OUTSTANDING_BALANCE";
    amount: number;
    packageName?: string;
  }>({
    isOpen: false,
    serviceType: "INTERNET",
    amount: 2000,
  });

  const [ticketModal, setTicketModal] = useState<{ isOpen: boolean; initialCategory?: string }>({
    isOpen: false,
  });

  const [speedTestModalOpen, setSpeedTestModalOpen] = useState(false);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const handleOpenPayModal = (
    serviceType: "INTERNET" | "TV" | "OUTSTANDING_BALANCE",
    amount: number,
    packageName?: string
  ) => {
    setPayModal({
      isOpen: true,
      serviceType,
      amount,
      packageName,
    });
  };

  const handlePaymentSuccess = (receipt: any) => {
    const newTx: TransactionItem = {
      id: "TX-" + Math.floor(10000 + Math.random() * 90000),
      date: "Just now",
      amount: receipt.amount,
      service: receipt.service,
      method: "M-PESA (STK Push)",
      reference: receipt.reference,
      status: "SUCCESS",
    };
    setTransactions((prev) => [newTx, ...prev]);

    // Update customer expiry
    setCustomer((prev) => ({
      ...prev,
      outstandingBalance: 0,
      internetService: {
        ...prev.internetService,
        expiresAt: "30 Sept",
        daysRemaining: 30,
      },
    }));
  };

  const handleCreateTicket = (data: { subject: string; category: string; description: string }) => {
    const newT: SupportTicket = {
      id: `FC-${Math.floor(10000 + Math.random() * 90000)}`,
      subject: data.subject,
      category: data.category,
      status: "OPEN",
      createdAt: "Just now",
      messages: [{ sender: "customer", text: data.description, time: "Just now" }],
    };
    setTickets((prev) => [newT, ...prev]);
  };

  const handleToggleDeviceBlock = (deviceId: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, isBlocked: !d.isBlocked } : d))
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-start py-0 sm:py-6 px-0 sm:px-4">
      {/* Desktop Frame Toggle Bar */}
      <div className="hidden sm:flex items-center justify-between w-full max-w-[430px] mb-3 px-2 text-xs text-slate-500 font-bold">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>FiberConnect Mobile Simulator</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAuthenticated((v) => !v)}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] hover:border-blue-500"
          >
            {isAuthenticated ? "View Auth Screen" : "Simulate Login"}
          </button>
        </div>
      </div>

      {/* Main Mobile App Container */}
      <div
        className={`w-full max-w-[430px] min-h-screen sm:min-h-[850px] sm:max-h-[920px] bg-slate-50 dark:bg-slate-950 sm:rounded-[42px] sm:border-8 sm:border-slate-850 dark:sm:border-slate-800 shadow-2xl flex flex-col relative overflow-hidden`}
      >
        {/* Dynamic Notch / Island on Desktop Frame */}
        <div className="hidden sm:flex justify-center pt-2 pb-1 bg-transparent shrink-0">
          <div className="w-28 h-4 rounded-full bg-slate-900/90 dark:bg-slate-800 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-slate-950 mr-2" />
            <div className="w-1.5 h-1.5 rounded-full bg-blue-900/60" />
          </div>
        </div>

        {/* 1. TOP APP BAR (When Logged In) matching Screenshot */}
        {isAuthenticated ? (
          <header className="px-5 pt-3 pb-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between shrink-0 sticky top-0 z-30">
            {/* Left: User Avatar & Brand Name */}
            <div className="flex items-center gap-2.5">
              <div
                onClick={() => setCurrentTab("profile")}
                className="w-8 h-8 rounded-full overflow-hidden border border-blue-500 bg-slate-200 cursor-pointer"
              >
                <img
                  src={customer.photoUrl || "/cartoons/yellow-boy.jpg"}
                  alt={customer.fullName}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white">
                {initialBrandName}
              </span>
            </div>

            {/* Right: Bell with Badge */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications((v) => !v)}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                <BellIcon className="w-4 h-4" />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-2xl z-50 text-xs space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 font-bold">
                    <span>Notifications</span>
                    <span className="text-[10px] text-blue-600">Mark all read</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 text-slate-800 dark:text-slate-200">
                    <p className="font-bold text-[11px]">🎉 50 Mbps Service Active</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Your monthly fiber renewal is confirmed.</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200">
                    <p className="font-bold text-[11px]">🎁 Referral Bonus</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">You earned KES 100 from your referral.</p>
                  </div>
                </div>
              )}
            </div>
          </header>
        ) : null}

        {/* 2. BODY CONTENT VIEWS */}
        <main className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
          {!isAuthenticated ? (
            <AuthView
              onSuccess={(phone) => {
                if (phone) {
                  setCustomer((prev) => ({ ...prev, phone }));
                }
                setIsAuthenticated(true);
                setCurrentTab("home");
              }}
              brandName={initialBrandName}
            />
          ) : (
            <>
              {currentTab === "home" && (
                <HomeView
                  customer={customer}
                  brandName={initialBrandName}
                  onNavigateTab={(tab) => setCurrentTab(tab)}
                  onOpenPayModal={handleOpenPayModal}
                  onOpenSpeedTest={() => setSpeedTestModalOpen(true)}
                />
              )}

              {currentTab === "services" && (
                <ServicesView
                  customer={customer}
                  internetPackages={internetPackages}
                  tvPackages={tvPackages}
                  brandName={initialBrandName}
                  onOpenPayModal={handleOpenPayModal}
                  onOpenSpeedTest={() => setSpeedTestModalOpen(true)}
                />
              )}

              {currentTab === "payments" && (
                <PaymentsView
                  customer={customer}
                  transactions={transactions}
                  brandName={initialBrandName}
                  onOpenPayModal={handleOpenPayModal}
                />
              )}

              {currentTab === "support" && (
                <SupportView
                  tickets={tickets}
                  brandName={initialBrandName}
                  onOpenNewTicketModal={(cat) => setTicketModal({ isOpen: true, initialCategory: cat })}
                  onOpenLiveChat={() => setChatModalOpen(true)}
                />
              )}

              {currentTab === "profile" && (
                <ProfileView
                  customer={customer}
                  devices={devices}
                  brandName={initialBrandName}
                  onToggleDeviceBlock={handleToggleDeviceBlock}
                  onLogout={() => setIsAuthenticated(false)}
                />
              )}
            </>
          )}
        </main>

        {/* 3. FLOATING LIVE CHAT BUTTON 💬 matching Screenshot */}
        {isAuthenticated && currentTab !== "support" && (
          <button
            type="button"
            onClick={() => setChatModalOpen(true)}
            className="absolute bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
            title="Live Chat with Fiber Support"
          >
            <MessageSquareIcon className="w-6 h-6" />
          </button>
        )}

        {/* 4. BOTTOM NAVIGATION BAR matching Screenshot */}
        {isAuthenticated ? (
          <nav className="h-18 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-around px-2 shrink-0 z-30 sticky bottom-0">
            {/* 1. Home */}
            <button
              type="button"
              onClick={() => setCurrentTab("home")}
              className={`flex flex-col items-center justify-center w-16 py-1 transition-all ${
                currentTab === "home"
                  ? "text-blue-600 dark:text-blue-400 font-bold"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
            >
              <div
                className={`p-1 rounded-full transition-all ${
                  currentTab === "home" ? "bg-blue-600 text-white px-3" : ""
                }`}
              >
                <HomeIcon className="w-5 h-5" />
              </div>
              <span className="text-[10px] mt-0.5 font-semibold">Home</span>
            </button>

            {/* 2. Services */}
            <button
              type="button"
              onClick={() => setCurrentTab("services")}
              className={`flex flex-col items-center justify-center w-16 py-1 transition-all ${
                currentTab === "services"
                  ? "text-blue-600 dark:text-blue-400 font-bold"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
            >
              <div
                className={`p-1 rounded-full transition-all ${
                  currentTab === "services" ? "bg-blue-600 text-white px-3" : ""
                }`}
              >
                <LayersIcon className="w-5 h-5" />
              </div>
              <span className="text-[10px] mt-0.5 font-semibold">Services</span>
            </button>

            {/* 3. Payments */}
            <button
              type="button"
              onClick={() => setCurrentTab("payments")}
              className={`flex flex-col items-center justify-center w-16 py-1 transition-all ${
                currentTab === "payments"
                  ? "text-blue-600 dark:text-blue-400 font-bold"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
            >
              <div
                className={`p-1 rounded-full transition-all ${
                  currentTab === "payments" ? "bg-blue-600 text-white px-3" : ""
                }`}
              >
                <CreditCardIcon className="w-5 h-5" />
              </div>
              <span className="text-[10px] mt-0.5 font-semibold">Payments</span>
            </button>

            {/* 4. Support */}
            <button
              type="button"
              onClick={() => setCurrentTab("support")}
              className={`flex flex-col items-center justify-center w-16 py-1 transition-all ${
                currentTab === "support"
                  ? "text-blue-600 dark:text-blue-400 font-bold"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
            >
              <div
                className={`p-1 rounded-full transition-all ${
                  currentTab === "support" ? "bg-blue-600 text-white px-3" : ""
                }`}
              >
                <HeadphonesIcon className="w-5 h-5" />
              </div>
              <span className="text-[10px] mt-0.5 font-semibold">Support</span>
            </button>

            {/* 5. Profile */}
            <button
              type="button"
              onClick={() => setCurrentTab("profile")}
              className={`flex flex-col items-center justify-center w-16 py-1 transition-all ${
                currentTab === "profile"
                  ? "text-blue-600 dark:text-blue-400 font-bold"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
            >
              <div
                className={`p-1 rounded-full transition-all ${
                  currentTab === "profile" ? "bg-blue-600 text-white px-3" : ""
                }`}
              >
                <UserIcon className="w-5 h-5" />
              </div>
              <span className="text-[10px] mt-0.5 font-semibold">Profile</span>
            </button>
          </nav>
        ) : null}

        {/* ================= MODALS ================= */}
        <PaymentModal
          isOpen={payModal.isOpen}
          serviceType={payModal.serviceType}
          amount={payModal.amount}
          packageName={payModal.packageName}
          brandName={initialBrandName}
          onClose={() => setPayModal((p) => ({ ...p, isOpen: false }))}
          onSuccess={handlePaymentSuccess}
        />

        <TicketModal
          isOpen={ticketModal.isOpen}
          initialCategory={ticketModal.initialCategory}
          onClose={() => setTicketModal({ isOpen: false })}
          onSubmit={handleCreateTicket}
        />

        <SpeedTestModal
          isOpen={speedTestModalOpen}
          targetSpeedMbps={customer.internetService.speedMbps}
          onClose={() => setSpeedTestModalOpen(false)}
        />

        <ChatModal
          isOpen={chatModalOpen}
          brandName={initialBrandName}
          onClose={() => setChatModalOpen(false)}
        />
      </div>
    </div>
  );
}
