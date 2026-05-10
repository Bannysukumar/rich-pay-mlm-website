import { useState } from 'react'
import { Offcanvas } from 'react-bootstrap'
import {
  Bell,
  BoundingBox,
  MoonStars,
  SquaresFour,
  SunDim,
} from '@phosphor-icons/react'
import { KiHeaderAppLinks } from '@/components/dashboard/KiDashboardNav'

type Props = {
  onMenuOpen: () => void
  themeToggle: () => void
  darkMode: boolean
}

export function KiDashboardHeader({ onMenuOpen, themeToggle, darkMode }: Props) {
  const [appsOpen, setAppsOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  const closeApps = () => setAppsOpen(false)
  const closeNotif = () => setNotifOpen(false)

  return (
    <>
      <header className="ki-header-main sticky-top">
        <div className="container-fluid">
          <div className="row align-items-center">
            <div className="col-8 col-sm-6 d-flex align-items-center p-0">
              <button
                type="button"
                className="btn btn-link ki-head-icon text-secondary d-lg-none"
                aria-label="Open menu"
                onClick={onMenuOpen}
              >
                <SquaresFour size={22} weight="bold" />
              </button>
              <span className="ki-head-icon d-none d-lg-inline-flex ms-0">
                <SquaresFour size={22} weight="bold" />
              </span>
            </div>

            <div className="col-4 col-sm-6 d-flex align-items-center justify-content-end p-0">
              <ul className="d-flex align-items-center list-unstyled gap-2 mb-0">
                <li>
                  <button
                    type="button"
                    className="ki-head-icon"
                    aria-label="Quick apps"
                    onClick={() => setAppsOpen(true)}
                  >
                    <BoundingBox size={22} weight="regular" />
                  </button>
                </li>
                <li>
                  <button type="button" className="ki-head-icon" onClick={themeToggle} aria-label="Toggle theme">
                    {darkMode ? <SunDim size={22} /> : <MoonStars size={22} />}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="ki-head-icon position-relative"
                    aria-label="Notifications"
                    onClick={() => setNotifOpen(true)}
                  >
                    <Bell size={22} />
                    <span
                      className="position-absolute top-0 start-100 translate-middle p-1 bg-primary border border-secondary rounded-circle"
                      style={{ width: 8, height: 8 }}
                    />
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </header>

      <Offcanvas show={appsOpen} onHide={closeApps} placement="end" className="bg-dark text-light">
        <Offcanvas.Header closeButton closeVariant="white">
          <Offcanvas.Title>Quick apps</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="pt-0">
          <KiHeaderAppLinks onNavigate={closeApps} />
        </Offcanvas.Body>
      </Offcanvas>

      <Offcanvas show={notifOpen} onHide={closeNotif} placement="end" className="bg-dark text-light">
        <Offcanvas.Header closeButton closeVariant="white">
          <Offcanvas.Title>Notifications</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="p-0">
          <div className="p-3 text-muted small">No notifications yet.</div>
        </Offcanvas.Body>
      </Offcanvas>
    </>
  )
}
