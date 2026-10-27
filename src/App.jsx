import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

const QUEUE_TABLE = 'queue_entries'

function elapsedTime(createdAt, now) {
  if (!now) return 'Just now'
  const seconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d`
}

function StatusBadge({ status }) {
  return <span className={`status status--${status}`}>{status === 'helping' ? 'Helping now' : 'Waiting'}</span>
}

function requestNotificationPermission() {
  if (!('Notification' in window) || window.Notification.permission !== 'default') return
  window.Notification.requestPermission().catch(() => {})
}

function notifyStudentJoined() {
  if (!('Notification' in window) || window.Notification.permission !== 'granted') return
  new window.Notification('Student joined the queue', {
    body: 'The office-hours queue has a new request.',
  })
}

async function getStudentSession() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || session) return { session, error: sessionError }

  const { data, error } = await supabase.auth.signInAnonymously()
  return { session: data.session, error }
}

function App() {
  const [entries, setEntries] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [name, setName] = useState('')
  const [question, setQuestion] = useState('')
  const [formMessage, setFormMessage] = useState(null)
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [taName, setTaName] = useState('')
  const [authMessage, setAuthMessage] = useState(null)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [activeEntryId, setActiveEntryId] = useState(null)
  const [now, setNow] = useState(null)
  const [onDutyTAs, setOnDutyTAs] = useState([])

  const canManageQueue = Boolean(session?.user && !session.user.is_anonymous)
  const userId = session?.user?.id
  const queueCount = useMemo(() => entries.length, [entries])

  async function loadEntries() {
    setIsLoading(true)
    const { data, error } = await supabase.from(QUEUE_TABLE).select('*').order('created_at', { ascending: true })
    if (error) setFormMessage({ type: 'error', text: `Couldn’t load the queue: ${error.message}` })
    else {
      setEntries(data ?? [])
      setNow(Date.now())
    }
    setIsLoading(false)
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { loadEntries() }, 0)
    const channel = supabase
      .channel('queue-entries-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: QUEUE_TABLE }, (payload) => {
        if (payload.eventType === 'INSERT') notifyStudentJoined()
        loadEntries()
      })
      .subscribe()
    return () => {
      window.clearTimeout(initialLoad)
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession)
      if (currentSession) setTaName(window.sessionStorage.getItem('ta-queue-ta-name') ?? '')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) setTaName('')
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    document.title = `COMP 1010 TA Queue (${queueCount})`
  }, [queueCount])

  useEffect(() => {
    const channel = supabase
      .channel('tas-on-duty', { config: { presence: { key: userId } } })
      .on('presence', { event: 'sync' }, () => {
        const members = Object.values(channel.presenceState()).flat()
        const names = [...new Set(members.map((member) => member.name).filter(Boolean))]
        setOnDutyTAs(names)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && userId && taName.trim()) {
          await channel.track({ name: taName.trim() })
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [userId, taName])

  async function handleJoinQueue(event) {
    event.preventDefault()
    const studentName = name.trim()
    const studentQuestion = question.trim()
    if (!studentName || !studentQuestion) {
      setFormMessage({ type: 'error', text: 'Please enter your name and what you need help with.' })
      return
    }
    requestNotificationPermission()
    setFormMessage(null)
    const { session: studentSession, error: studentSessionError } = await getStudentSession()
    if (studentSessionError || !studentSession?.user) {
      setFormMessage({ type: 'error', text: studentSessionError?.message ?? 'Couldn’t create a student session. Please try again.' })
      return
    }
    const { error } = await supabase.from(QUEUE_TABLE).insert({ student_name: studentName, question: studentQuestion, status: 'waiting' })
    if (error) {
      setFormMessage({ type: 'error', text: `Couldn’t join the queue: ${error.message}` })
      return
    }
    setName('')
    setQuestion('')
    setFormMessage({ type: 'success', text: 'You’re in the queue! A TA will be with you soon.' })
    loadEntries()
  }

  async function handleSignIn(event) {
    event.preventDefault()
    const trimmedTaName = taName.trim()
    if (!trimmedTaName) {
      setAuthMessage({ type: 'error', text: 'Please enter the name students should see.' })
      return
    }
    requestNotificationPermission()
    setAuthMessage(null)
    setIsSigningIn(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setIsSigningIn(false)
    if (error) setAuthMessage({ type: 'error', text: error.message })
    else {
      setPassword('')
      window.sessionStorage.setItem('ta-queue-ta-name', trimmedTaName)
      setTaName(trimmedTaName)
      setAuthMessage({ type: 'success', text: 'Signed in successfully.' })
    }
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()
    window.sessionStorage.removeItem('ta-queue-ta-name')
    setTaName('')
    setAuthMessage(error ? { type: 'error', text: error.message } : { type: 'success', text: 'You’ve been signed out.' })
  }

  async function updateEntry(id, update) {
    setActiveEntryId(id)
    setFormMessage(null)
    const { error } = await supabase.from(QUEUE_TABLE).update(update).eq('id', id)
    setActiveEntryId(null)
    if (error) {
      const text = error.message.includes('ta_name')
        ? 'Your database needs the ta_name column before TAs can start helping. Apply the included Supabase migration, then try again.'
        : `Couldn’t update the queue: ${error.message}`
      setFormMessage({ type: 'error', text })
    }
    else loadEntries()
  }

  async function removeEntry(id) {
    setActiveEntryId(id)
    setFormMessage(null)
    const { error } = await supabase.from(QUEUE_TABLE).delete().eq('id', id)
    setActiveEntryId(null)
    if (error) setFormMessage({ type: 'error', text: `Couldn’t remove this entry: ${error.message}` })
    else loadEntries()
  }

  async function removeOwnEntry(id) {
    if (!userId) return

    setActiveEntryId(id)
    setFormMessage(null)
    const { data, error } = await supabase.from(QUEUE_TABLE).delete().eq('id', id).eq('student_id', userId).select('id')
    setActiveEntryId(null)
    if (error) {
      setFormMessage({ type: 'error', text: `Couldn’t leave the queue: ${error.message}` })
    } else if (!data?.length) {
      setFormMessage({ type: 'error', text: 'This entry could not be removed. It may already have been cleared.' })
    } else {
      setFormMessage({ type: 'success', text: 'You’ve been removed from the queue.' })
      loadEntries()
    }
  }

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="COMP 1010 TA Queue home"><h1>COMP 1010 TA Queue</h1></a>
        <span className="queue-summary" aria-live="polite">{queueCount} {queueCount === 1 ? 'student' : 'students'} in queue</span>
      </header>

      <div id="top" className="intro">
        <p className="lede">Add your question to the queue and a TA will be with you soon. If you are not in-person at the CADE lab, include a Zoom or Meet link in your description.</p>
      </div>

      <section className="panel join-panel" aria-labelledby="join-heading">
        <div className="section-heading"><h2 id="join-heading">Join the queue</h2><p>Tell us who you are and where you’re stuck.</p></div>
        <form className="queue-form" onSubmit={handleJoinQueue}>
          <label><span>Your name</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="e.g. Guido Van Rossum" maxLength="100" required /></label>
          <label><span>What do you need help with?</span><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Describe the problem or question…" rows="3" maxLength="1000" required /></label>
          <button className="button button--primary" type="submit">Join queue <span aria-hidden="true">→</span></button>
        </form>
        {formMessage && <p className={`notice notice--${formMessage.type}`} role="status">{formMessage.text}</p>}
      </section>

      <section className="on-duty-section" aria-labelledby="on-duty-heading">
        <div><p className="eyebrow">Live roster</p><h2 id="on-duty-heading">TAs Currently on Duty</h2></div>
        {onDutyTAs.length > 0 ? <ul className="on-duty-list">{onDutyTAs.map((ta) => <li key={ta}><span aria-hidden="true" />{ta}</li>)}</ul> : <p className="on-duty-empty">No TAs are currently signed in.</p>}
      </section>

      <section className="queue-section" aria-labelledby="queue-heading">
        <div className="queue-title-row"><div><p className="eyebrow">Live view</p><h2 id="queue-heading">Current Queue</h2></div><span className="live-indicator"><i aria-hidden="true" /> Updates live</span></div>
        {isLoading ? <div className="empty-state" role="status">Loading the queue…</div> : entries.length === 0 ? <div className="empty-state">The queue is clear. Be the first to ask for help.</div> : (
          <ol className="queue-list">
            {entries.map((entry, index) => (
              <li className="queue-card" key={entry.id}>
                <span className="queue-number" aria-label={`Queue number ${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
                <div className="entry-copy"><div className="entry-meta"><h3>{entry.student_name}</h3><StatusBadge status={entry.status} /></div><p>{entry.question}</p>{entry.status === 'helping' && entry.ta_name && <p className="helper-name">Helping with <strong>{entry.ta_name}</strong></p>}<time dateTime={entry.created_at}>Waiting {elapsedTime(entry.created_at, now)}</time></div>
                {(canManageQueue || entry.student_id === userId) && <div className="ta-actions" aria-label={`Queue actions for ${entry.student_name}`}>
                  {canManageQueue && <>
                    {entry.status === 'waiting' ? <button type="button" className="button button--small button--dark" disabled={activeEntryId === entry.id || !taName.trim()} onClick={() => updateEntry(entry.id, { status: 'helping', ta_name: taName.trim() })}>Start helping</button> : <button type="button" className="button button--small button--outline" disabled={activeEntryId === entry.id} onClick={() => updateEntry(entry.id, { status: 'waiting', ta_name: null })}>Return to waiting</button>}
                    <button type="button" className="text-button" disabled={activeEntryId === entry.id} onClick={() => removeEntry(entry.id)}>Remove</button>
                  </>}
                  {entry.student_id === userId && <button type="button" className="text-button" disabled={activeEntryId === entry.id} onClick={() => removeOwnEntry(entry.id)}>Remove myself</button>}
                </div>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="ta-panel" aria-labelledby="ta-heading">
        <div><p className="eyebrow">For teaching assistants</p><h2 id="ta-heading">TA Sign In</h2><p className="ta-description">Sign in to take questions, return students to the queue, or clear completed requests.</p></div>
        {canManageQueue ? <div className="signed-in"><p>Signed in as <strong>{session.user.email}</strong><br />Helping as <strong>{taName || 'add your name below'}</strong></p><label className="ta-name-field"><span>Your TA name</span><input value={taName} onChange={(event) => { setTaName(event.target.value); window.sessionStorage.setItem('ta-queue-ta-name', event.target.value) }} placeholder="e.g. Jaydon" maxLength="100" /></label><button type="button" className="button button--danger" onClick={handleSignOut}>Sign out</button></div> : <form className="sign-in-form" onSubmit={handleSignIn}><label><span>Your TA name</span><input value={taName} onChange={(event) => setTaName(event.target.value)} autoComplete="name" placeholder="e.g. Jaydon" maxLength="100" required /></label><label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="button button--dark" type="submit" disabled={isSigningIn}>{isSigningIn ? 'Signing in…' : 'Sign in'}</button></form>}
        {authMessage && <p className={`notice notice--${authMessage.type}`} role="status">{authMessage.text}</p>}
      </section>

      <footer className="page-footer">© 2026 Jaydon Carter</footer>
    </main>
  )
}

export default App
