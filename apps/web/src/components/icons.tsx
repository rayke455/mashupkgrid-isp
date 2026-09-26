import type { SVGProps } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  Bell,
  Building2,
  Check,
  ChevronRight,
  CircleCheck,
  CircleMinus,
  CircleX,
  Clock,
  CloudDownload,
  Copy,
  Cpu,
  Download,
  Eye,
  EyeOff,
  FileCode,
  FileText,
  FlaskConical,
  Gauge,
  Gift,
  Globe,
  HardDriveDownload,
  House,
  KeyRound,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  LoaderCircle,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  MessagesSquare,
  MonitorSmartphone,
  Network,
  Package,
  Palette,
  Power,
  Printer,
  Receipt,
  RefreshCw,
  Router,
  Search,
  Send,
  ServerCog,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  SquareTerminal,
  Ticket,
  Timer,
  User,
  UserRound,
  Users,
  Webhook,
  Workflow,
  Wrench,
  X,
  Zap,
} from "lucide-react";

/**
 * The dashboard's icons. Everything here is drawn from Lucide (one consistent, modern outline
 * set) through the same Icon* names the pages already use; only brand marks (M-Pesa, WhatsApp)
 * are custom. Stroke width is set once here so every icon has the same weight.
 */

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

export const ICON_STROKE = 1.75;

function fromLucide(Glyph: LucideIcon, displayName: string) {
  function Icon({ size = 20, className = "", ...props }: IconProps) {
    return <Glyph size={size} strokeWidth={ICON_STROKE} className={className} aria-hidden={props["aria-label"] ? undefined : true} {...(props as object)} />;
  }
  Icon.displayName = displayName;
  return Icon;
}

export const IconRouter = fromLucide(Router, "IconRouter");
export const IconDashboard = fromLucide(LayoutDashboard, "IconDashboard");
export const IconUsers = fromLucide(Users, "IconUsers");
export const IconPackage = fromLucide(Package, "IconPackage");
export const IconInvoice = fromLucide(FileText, "IconInvoice");
export const IconNetworkPool = fromLucide(Network, "IconNetworkPool");
export const IconTicket = fromLucide(Ticket, "IconTicket");
export const IconShield = fromLucide(ShieldCheck, "IconShield");
export const IconTenants = fromLucide(Building2, "IconTenants");
export const IconMaintenance = fromLucide(Wrench, "IconMaintenance");
export const IconSession = fromLucide(MonitorSmartphone, "IconSession");
export const IconSpeed = fromLucide(Gauge, "IconSpeed");
export const IconCheck = fromLucide(Check, "IconCheck");
export const IconArrowRight = fromLucide(ArrowRight, "IconArrowRight");
export const IconTerminal = fromLucide(SquareTerminal, "IconTerminal");
export const IconPulse = fromLucide(Activity, "IconPulse");
export const IconLogOut = fromLucide(LogOut, "IconLogOut");
export const IconCopy = fromLucide(Copy, "IconCopy");
export const IconMessage = fromLucide(MessageSquare, "IconMessage");
export const IconKey = fromLucide(KeyRound, "IconKey");
export const IconWebhook = fromLucide(Webhook, "IconWebhook");
export const IconPalette = fromLucide(Palette, "IconPalette");
export const IconLock = fromLucide(Lock, "IconLock");
export const IconEye = fromLucide(Eye, "IconEye");
export const IconEyeOff = fromLucide(EyeOff, "IconEyeOff");
export const IconUser = fromLucide(User, "IconUser");
export const IconChevronRight = fromLucide(ChevronRight, "IconChevronRight");
export const IconSparkles = fromLucide(Sparkles, "IconSparkles");
export const IconSend = fromLucide(Send, "IconSend");
export const IconLifeBuoy = fromLucide(LifeBuoy, "IconLifeBuoy");
export const IconChat = fromLucide(MessagesSquare, "IconChat");
export const IconGlobe = fromLucide(Globe, "IconGlobe");
export const IconLayers = fromLucide(Layers, "IconLayers");
export const IconMenu = fromLucide(Menu, "IconMenu");
export const IconClose = fromLucide(X, "IconClose");
export const IconBell = fromLucide(Bell, "IconBell");
export const IconSearch = fromLucide(Search, "IconSearch");
export const IconAutomation = fromLucide(Workflow, "IconAutomation");
export const IconDownload = fromLucide(Download, "IconDownload");
export const IconPrinter = fromLucide(Printer, "IconPrinter");
export const IconCloudDownload = fromLucide(CloudDownload, "IconCloudDownload");
export const IconRefresh = fromLucide(RefreshCw, "IconRefresh");
export const IconPower = fromLucide(Power, "IconPower");
export const IconFileCode = fromLucide(FileCode, "IconFileCode");
export const IconServerCog = fromLucide(ServerCog, "IconServerCog");
export const IconCpu = fromLucide(Cpu, "IconCpu");
export const IconZap = fromLucide(Zap, "IconZap");
export const IconTimer = fromLucide(Timer, "IconTimer");
export const IconFlask = fromLucide(FlaskConical, "IconFlask");
export const IconCircleCheck = fromLucide(CircleCheck, "IconCircleCheck");
export const IconCircleX = fromLucide(CircleX, "IconCircleX");
export const IconCircleMinus = fromLucide(CircleMinus, "IconCircleMinus");
export const IconSpinner = fromLucide(LoaderCircle, "IconSpinner");
export const IconClock = fromLucide(Clock, "IconClock");
export const IconHome = fromLucide(House, "IconHome");
export const IconReceipt = fromLucide(Receipt, "IconReceipt");
export const IconGift = fromLucide(Gift, "IconGift");
export const IconUserRound = fromLucide(UserRound, "IconUserRound");
export const IconShieldOff = fromLucide(ShieldOff, "IconShieldOff");
export const IconHardDriveDownload = fromLucide(HardDriveDownload, "IconHardDriveDownload");
export const IconGauge = fromLucide(Gauge, "IconGauge");

export function IconMpesa({ size = 20, className = "", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <rect width="20" height="14" x="2" y="5" rx="2.5" />
      <line x1="2" x2="22" y1="10" y2="10" />
      <path d="M6 15h2" />
      <path d="M10 15h4" />
    </svg>
  );
}

export function IconWhatsApp({ size = 20, className = "", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M18.403 5.602A9.043 9.043 0 0 0 12.046 3c-4.996 0-9.062 4.066-9.064 9.064 0 1.597.417 3.155 1.21 4.53L3 21l4.579-1.201a9.055 9.055 0 0 0 4.463 1.173h.004c4.994 0 9.06-4.066 9.064-9.064 0-2.42-.943-4.697-2.707-6.306zm-6.357 13.77h-.003a7.53 7.53 0 0 1-3.834-1.047l-.275-.163-2.85.748.76-2.778-.179-.285a7.518 7.518 0 0 1-1.155-3.972c.003-4.156 3.385-7.538 7.544-7.538 2.013 0 3.906.785 5.33 2.209a7.488 7.488 0 0 1 2.203 5.334c-.003 4.157-3.386 7.54-7.54 7.54zm4.135-5.646c-.227-.113-1.341-.662-1.549-.738-.207-.076-.358-.113-.51.113-.151.226-.585.738-.717.889-.132.151-.264.17-.491.057-.227-.113-.957-.353-1.823-1.125-.674-.602-1.13-1.345-1.262-1.572-.132-.227-.014-.349.099-.462.102-.102.227-.264.34-.396.113-.132.151-.227.227-.377.075-.151.038-.283-.019-.396-.057-.113-.51-1.228-.698-1.682-.184-.441-.371-.382-.51-.389-.132-.007-.283-.008-.434-.008-.151 0-.396.056-.604.283-.207.226-.792.774-.792 1.887 0 1.113.811 2.188.924 2.34.113.151 1.597 2.438 3.869 3.418.54.234.962.373 1.291.477.543.173 1.037.148 1.428.09.435-.065 1.341-.548 1.53-1.077.188-.528.188-.981.132-1.076-.057-.094-.208-.151-.435-.264z"
      />
    </svg>
  );
}

export function IconWhatsAppBrand({ size = 28, className = "", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      {...props}
    >
      <circle cx="16" cy="16" r="16" fill="#25D366" />
      <path
        fill="#FFFFFF"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M23.5 12.3c-.6-1.5-1.6-2.7-2.9-3.5-1.3-.8-2.9-1.2-4.5-1.2-4.9 0-8.9 4-8.9 8.9 0 1.6.4 3.1 1.2 4.5L7 25l4.1-1.1c1.3.7 2.8 1.1 4.3 1.1 4.9 0 8.9-4 8.9-8.9.1-1.4-.3-2.8-.8-3.8zm-8.1 11.2c-1.3 0-2.6-.4-3.7-1l-.3-.2-2.5.7.7-2.4-.2-.3c-.7-1.1-1.1-2.4-1.1-3.7 0-3.9 3.2-7.1 7.1-7.1 1.9 0 3.7.7 5 2.1 1.3 1.3 2.1 3.1 2.1 5-.1 4-3.3 7.1-7.2 7.1zm3.9-5.3c-.2-.1-1.3-.6-1.5-.7-.2-.1-.3-.1-.5.1s-.6.7-.7.9c-.1.1-.3.2-.5.1-.2-.1-.9-.3-1.8-1.1-.7-.6-1.1-1.3-1.2-1.5-.1-.2 0-.3.1-.4.1-.1.2-.3.3-.4.1-.1.1-.2.2-.3.1-.1 0-.3 0-.4s-.5-1.2-.7-1.6c-.2-.4-.4-.4-.5-.4h-.4c-.1 0-.4.1-.6.3s-.8.8-.8 1.9c0 1.1.8 2.2.9 2.3.1.1 1.6 2.4 3.8 3.4.5.2 1 .4 1.3.5.5.2 1 .1 1.4.1.4-.1 1.3-.5 1.5-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.4-.3z"
      />
    </svg>
  );
}

