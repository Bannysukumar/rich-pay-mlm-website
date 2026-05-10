import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuthState } from '@/hooks/useAuth'
import { COLLECTIONS } from '@/lib/constants'
import { db } from '@/lib/firebase'

const DEPARTMENTS = [
  { value: 'ACCOUNTS', label: 'ACCOUNTS' },
  { value: 'TECHNICAL', label: 'TECHNICAL' },
  { value: 'TEAMSUPPORT', label: 'TEAM SUPPORT' },
  { value: 'SUGGESTIONS', label: 'SUGGESTIONS' },
] as const

const PRIORITIES = [
  { value: 'NORMAL', label: 'NORMAL' },
  { value: 'URGENT', label: 'UGRENT' },
  { value: 'MOST URGENT', label: 'MOST URGENT' },
] as const

export function CreateTicketPage() {
  const navigate = useNavigate()
  const { firebaseUid } = useAuthState()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [department, setDepartment] = useState<string>('ACCOUNTS')
  const [priority, setPriority] = useState<string>('NORMAL')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!firebaseUid) {
      toast.error('Not signed in')
      return
    }
    const t = title.trim()
    if (!t) {
      toast.error('Enter a title')
      return
    }
    const m = message.trim()
    if (!m) {
      toast.error('Enter a message')
      return
    }
    setBusy(true)
    try {
      await addDoc(collection(db, COLLECTIONS.tickets), {
        userId: firebaseUid,
        title: t,
        message: m,
        department,
        priority,
        status: 'open',
        createdAt: serverTimestamp(),
      })
      toast.success('Ticket submitted')
      setTitle('')
      setMessage('')
      setDepartment('ACCOUNTS')
      setPriority('NORMAL')
      navigate('/dashboard/tickets/list')
    } catch {
      toast.error('Could not submit ticket')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <div className="container-fluid">
        <div className="row">
          <div className="col-xl-12 col-lg-12">
            <div className="card">
              <div className="card-header">
                <h4 className="card-title">Create Ticket</h4>
              </div>
              <div className="card-body">
                <div className="basic-form">
                  <form name="form1" method="post" onSubmit={(ev) => void submit(ev)}>
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="title">
                        Title
                      </label>
                      <input
                        type="text"
                        className="form-control input-default"
                        placeholder="Title"
                        name="title"
                        id="title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={busy}
                        autoComplete="off"
                      />
                    </div>
                    <div className="mb-3 col-md-12">
                      <label className="form-label" htmlFor="message">
                        Message
                      </label>
                      <textarea
                        className="form-control input-default"
                        name="message"
                        id="message"
                        rows={6}
                        style={{ height: '120px' }}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        disabled={busy}
                      />
                    </div>
                    <label className="form-label" htmlFor="department">
                      Select Department
                    </label>
                    <select
                      name="department"
                      id="department"
                      className="default-select form-control wide mb-3"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      disabled={busy}
                    >
                      {DEPARTMENTS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    <label className="form-label" htmlFor="priority">
                      Select Priority
                    </label>
                    <select
                      name="priority"
                      id="priority"
                      className="default-select form-control wide mb-3"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      disabled={busy}
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>

                    <button type="submit" className="btn btn-primary" disabled={busy}>
                      {busy ? 'Submitting…' : 'Submit'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
