import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/components/routing/ProtectedRoute'
import { LogoutPage } from '@/features/auth/LogoutPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { RegisterSuccessPage } from '@/features/auth/RegisterSuccessPage'
import { AdminLayout } from '@/features/admin/layout/AdminLayout'
import { AdminHome } from '@/features/admin/pages/AdminHome'
import { AdminIncomeLedgersHubPage } from '@/features/admin/pages/AdminIncomeLedgersHubPage'
import { AdminAuditPage } from '@/features/admin/pages/AdminAuditPage'
import { AdminCmsPage } from '@/features/admin/pages/AdminCmsPage'
import { AdminDepositsPage } from '@/features/admin/pages/AdminDepositsPage'
import { AdminMaintenancePage } from '@/features/admin/pages/AdminMaintenancePage'
import { AdminNotificationsPage } from '@/features/admin/pages/AdminNotificationsPage'
import { AdminPackagesPage } from '@/features/admin/pages/AdminPackagesPage'
import { AdminQrPage } from '@/features/admin/pages/AdminQrPage'
import { AdminRegistrationsTodayPage } from '@/features/admin/pages/AdminRegistrationsTodayPage'
import { AdminRanksPage } from '@/features/admin/pages/AdminRanksPage'
import { AdminReportActivePackagesPage } from '@/features/admin/pages/AdminReportActivePackagesPage'
import { AdminReportPeerTransfersPage } from '@/features/admin/pages/AdminReportPeerTransfersPage'
import { AdminReportBalanceAdjustmentsPage } from '@/features/admin/pages/AdminReportBalanceAdjustmentsPage'
import { AdminReportDailyRoiPage } from '@/features/admin/pages/AdminReportDailyRoiPage'
import { AdminReportRankBonusPage } from '@/features/admin/pages/AdminReportRankBonusPage'
import { AdminReportSponsorBonusPage } from '@/features/admin/pages/AdminReportSponsorBonusPage'
import { AdminReportTeamLevelIncomePage } from '@/features/admin/pages/AdminReportTeamLevelIncomePage'
import { AdminReportsPage } from '@/features/admin/pages/AdminReportsPage'
import { AdminRoiPage } from '@/features/admin/pages/AdminRoiPage'
import { AdminSeoPage } from '@/features/admin/pages/AdminSeoPage'
import { AdminSiteSettings } from '@/features/admin/pages/AdminSiteSettings'
import { AdminSponsorPage } from '@/features/admin/pages/AdminSponsorPage'
import { AdminTeamLevelsPage } from '@/features/admin/pages/AdminTeamLevelsPage'
import { AdminTicketsPage } from '@/features/admin/pages/AdminTicketsPage'
import { AdminTransferSettingsPage } from '@/features/admin/pages/AdminTransferSettingsPage'
import { AdminMemberBalanceAdjustPage } from '@/features/admin/pages/AdminMemberBalanceAdjustPage'
import { AdminMemberContactPage } from '@/features/admin/pages/AdminMemberContactPage'
import { AdminReferralCampaignsPage } from '@/features/admin/pages/AdminReferralCampaignsPage'
import { AdminReferralSharePage } from '@/features/admin/pages/AdminReferralSharePage'
import { AdminMemberInvestmentPlansPage } from '@/features/admin/pages/AdminMemberInvestmentPlansPage'
import { AdminUsersPage } from '@/features/admin/pages/AdminUsersPage'
import { AdminWalletSettingsPage } from '@/features/admin/pages/AdminWalletSettingsPage'
import { AdminWithdrawalsPage } from '@/features/admin/pages/AdminWithdrawalsPage'
import { DashboardLayout } from '@/features/dashboard/layout/DashboardLayout'
import { ChangePasswordPage } from '@/features/dashboard/pages/ChangePasswordPage'
import { DashboardHome } from '@/features/dashboard/pages/DashboardHome'
import { DepositCreatePage } from '@/features/dashboard/pages/deposits/DepositCreatePage'
import { DepositHistoryPage } from '@/features/dashboard/pages/deposits/DepositHistoryPage'
import { DepositViewQrPage } from '@/features/dashboard/pages/deposits/DepositViewQrPage'
import { PackageTopupPage } from '@/features/dashboard/pages/PackageTopupPage'
import { PackageTopupHistoryPage } from '@/features/dashboard/pages/PackageTopupHistoryPage'
import { ActivationWalletPage } from '@/features/dashboard/pages/ActivationWalletPage'
import { CashWalletPage } from '@/features/dashboard/pages/CashWalletPage'
import { DepositWalletPage } from '@/features/dashboard/pages/DepositWalletPage'
import { ConvertPage } from '@/features/dashboard/pages/ConvertPage'
import { TransferPage } from '@/features/dashboard/pages/TransferPage'
import { DailyProfitsPage } from '@/features/dashboard/pages/DailyProfitsPage'
import { SponsorBonusPage } from '@/features/dashboard/pages/SponsorBonusPage'
import { TeamLevelBonusPage } from '@/features/dashboard/pages/TeamLevelBonusPage'
import { RankingBonusPage } from '@/features/dashboard/pages/RankingBonusPage'
import { InwardTransfersPage } from '@/features/dashboard/pages/InwardTransfersPage'
import { OutwardTransfersPage } from '@/features/dashboard/pages/OutwardTransfersPage'
import { CreateTicketPage } from '@/features/dashboard/pages/CreateTicketPage'
import { TicketViewPage } from '@/features/dashboard/pages/TicketViewPage'
import { YourTicketsPage } from '@/features/dashboard/pages/YourTicketsPage'
import { PlaceholderPage } from '@/features/dashboard/pages/PlaceholderPage'
import { AllDownlinesPage } from '@/features/dashboard/pages/AllDownlinesPage'
import { DirectReferralsPage } from '@/features/dashboard/pages/DirectReferralsPage'
import { ProfilePage } from '@/features/dashboard/pages/ProfilePage'
import { ReferralLinkPage } from '@/features/dashboard/pages/ReferralLinkPage'
import { WithdrawPage } from '@/features/dashboard/pages/WithdrawPage'
import { WithdrawReportPage } from '@/features/dashboard/pages/WithdrawReportPage'
import { ContactPage } from '@/features/landing/ContactPage'
import { InvestmentPlansPage } from '@/features/landing/InvestmentPlansPage'
import { LandingPage } from '@/features/landing/LandingPage'
import { MaintenancePage } from '@/features/maintenance/MaintenancePage'
import { useSiteSettings } from '@/hooks/useSiteSettings'

function usePublicShellReady() {
  const { settings, loaded } = useSiteSettings()
  if (!loaded) {
    return { gate: 'loading' as const }
  }
  if (settings.maintenanceMode) {
    return { gate: 'maintenance' as const }
  }
  return { gate: 'ok' as const }
}

function PublicLanding() {
  const { gate } = usePublicShellReady()
  if (gate === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center bg-rich-black text-zinc-500">
        Initializing…
      </div>
    )
  }
  if (gate === 'maintenance') return <MaintenancePage />
  return <LandingPage />
}

function PublicInvestmentPlans() {
  const { gate } = usePublicShellReady()
  if (gate === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center bg-rich-black text-zinc-500">
        Initializing…
      </div>
    )
  }
  if (gate === 'maintenance') return <MaintenancePage />
  return <InvestmentPlansPage />
}

function PublicContact() {
  const { gate } = usePublicShellReady()
  if (gate === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center bg-rich-black text-zinc-500">
        Initializing…
      </div>
    )
  }
  if (gate === 'maintenance') return <MaintenancePage />
  return <ContactPage />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<PublicLanding />} />
      <Route path="/plans" element={<PublicInvestmentPlans />} />
      <Route path="/contact" element={<PublicContact />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/register/success" element={<RegisterSuccessPage />} />
      <Route path="/logout" element={<LogoutPage />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHome />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="team" element={<PlaceholderPage title="Team" />} />
        <Route path="direct-referrals" element={<DirectReferralsPage />} />
        <Route path="all-downlines" element={<AllDownlinesPage />} />
        <Route path="referral-link" element={<ReferralLinkPage />} />
        <Route path="deposits/create-qr" element={<DepositCreatePage />} />
        <Route path="deposits/view-qr" element={<DepositViewQrPage />} />
        <Route path="deposits/history" element={<DepositHistoryPage />} />
        <Route path="package/topup" element={<PackageTopupPage />} />
        <Route path="package/history" element={<PackageTopupHistoryPage />} />
        <Route path="transfers/outward" element={<OutwardTransfersPage />} />
        <Route path="transfers/inward" element={<InwardTransfersPage />} />
        <Route path="wallet/activation" element={<ActivationWalletPage />} />
        <Route path="wallet/cash" element={<CashWalletPage />} />
        <Route path="wallet/deposit" element={<DepositWalletPage />} />
        <Route path="wallet/convert" element={<ConvertPage />} />
        <Route path="wallet/transfer" element={<TransferPage />} />
        <Route path="income/daily-profits" element={<DailyProfitsPage />} />
        <Route path="income/sponsor-bonus" element={<SponsorBonusPage />} />
        <Route path="income/team-level" element={<TeamLevelBonusPage />} />
        <Route path="income/ranking" element={<RankingBonusPage />} />
        <Route path="tickets/create" element={<CreateTicketPage />} />
        <Route path="tickets/list" element={<YourTicketsPage />} />
        <Route path="tickets/view" element={<TicketViewPage />} />
        <Route path="withdraw" element={<WithdrawPage />} />
        <Route path="withdraw/report" element={<WithdrawReportPage />} />
        <Route path="account/password" element={<ChangePasswordPage />} />
      </Route>

      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminHome />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="registrations-today" element={<AdminRegistrationsTodayPage />} />
        <Route path="member-investment-plans" element={<AdminMemberInvestmentPlansPage />} />
        <Route path="member-balance-adjust" element={<AdminMemberBalanceAdjustPage />} />
        <Route path="member-contact" element={<AdminMemberContactPage />} />
        <Route path="referral-campaigns" element={<AdminReferralCampaignsPage />} />
        <Route path="referral-share" element={<AdminReferralSharePage />} />
        <Route path="deposits" element={<AdminDepositsPage />} />
        <Route path="withdrawals" element={<AdminWithdrawalsPage />} />
        <Route path="packages" element={<AdminPackagesPage />} />
        <Route path="roi" element={<AdminRoiPage />} />
        <Route path="sponsor" element={<AdminSponsorPage />} />
        <Route path="team-levels" element={<AdminTeamLevelsPage />} />
        <Route path="ranks" element={<AdminRanksPage />} />
        <Route path="wallets" element={<AdminWalletSettingsPage />} />
        <Route path="qr" element={<AdminQrPage />} />
        <Route path="transfers" element={<AdminTransferSettingsPage />} />
        <Route path="tickets" element={<AdminTicketsPage />} />
        <Route path="notifications" element={<AdminNotificationsPage />} />
        <Route path="cms" element={<AdminCmsPage />} />
        <Route path="seo" element={<AdminSeoPage />} />
        <Route path="site" element={<AdminSiteSettings />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="income-ledgers" element={<AdminIncomeLedgersHubPage />} />
        <Route path="reports/balance-adjustments" element={<AdminReportBalanceAdjustmentsPage />} />
        <Route path="reports/income-daily-roi" element={<AdminReportDailyRoiPage />} />
        <Route path="reports/income-sponsor" element={<AdminReportSponsorBonusPage />} />
        <Route path="reports/income-team-level" element={<AdminReportTeamLevelIncomePage />} />
        <Route path="reports/income-rank" element={<AdminReportRankBonusPage />} />
        <Route path="reports/active-packages" element={<AdminReportActivePackagesPage />} />
        <Route path="reports/peer-transfers" element={<AdminReportPeerTransfersPage />} />
        <Route path="audit" element={<AdminAuditPage />} />
        <Route path="maintenance" element={<AdminMaintenancePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
