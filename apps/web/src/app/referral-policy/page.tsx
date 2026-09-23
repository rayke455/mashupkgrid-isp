import { LegalShell } from "@/components/marketing/legal-shell";

export default function ReferralPolicyPage() {
  return (
    <LegalShell
      active="/referral-policy"
      category="Partner & Growth Program"
      effective="August 28, 2026"
      title="Referral & Affiliate Policy"
      intro={
        <>
          Guidelines governing operator referrals, subscriber referral rewards, recurring commission tracking, and automated M-Pesa payouts.
        </>
      }
      notes={["Commission: 15% Recurring","Payouts: Instant M-Pesa B2C","Minimum Payout: KES 1,000"]}
      sections={[
        {
          title: "Operator Referral Program",
          body: (
            <>
              Existing ISP operators who refer another Internet Service Provider or WISP to Mashupkgrid receive a 15% recurring commission on all SaaS platform subscription fees paid by the referred operator for their first 12 months of active operations.
            </>
          ),
        },
        {
          title: "Subscriber \"Refer-a-Neighbor\" Program",
          body: (
            <>
              The Mashupkgrid customer portal includes built-in subscriber referral tools. ISPs can configure automatic billing credits (e.g. KES 500 or 1 free week of high-speed fiber) credited to an existing subscriber&apos;s account once their referred neighbor completes installation and pays their initial activation invoice.
            </>
          ),
        },
        {
          title: "Commission Payout Methods & Thresholds",
          body: (
            <>
              Referral earnings accrue in real-time in the operator&apos;s Partner Wallet. Earnings can be withdrawn directly to any verified Safaricom M-Pesa phone number via instant B2C disbursement (minimum withdrawal KES 1,000) or applied directly as discount credits on the operator&apos;s monthly platform bill.
            </>
          ),
        },
        {
          title: "Prohibited Conduct & Anti-Abuse",
          body: (
            <>
              Self-referrals (registering duplicate tenant accounts using one&apos;s own referral code to harvest discounts), fraudulent credit recycling, unsolicited SMS spamming, or misrepresenting official affiliation with Safaricom or MikroTik is strictly prohibited and results in immediate forfeiture of referral balances.
            </>
          ),
        },
        {
          title: "Program Modification",
          body: (
            <>
              Mashupkgrid reserves the right to modify commission percentages or incentive structures upon 30 days notice. All commissions already earned prior to any program updates are honored in full.
            </>
          ),
        },
      ]}
    />
  );
}
