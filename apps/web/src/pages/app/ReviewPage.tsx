import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, type PlanDoc, type Published, type UpdatePreview, type Upload } from '../../api'

/**
 * The architect's check between "plans uploaded" and "the client walks in": what the system understood from the
 * sheet — storeys, rooms and their names, doors and windows — with everything it guessed marked, and one-click fixes.
 */
const TINT = ['#fde9b8', '#cfe3fb', '#cdeed6', '#fbd5d5', '#e1dcfb', '#fbdcc0', '#c4eef4', '#f3d6f7', '#e3f3c2', '#e2e8f0']
const KIND = { door: 'Door', window: 'Window', 'glass-door': 'Glass door' } as const

export default function ReviewPage() {
  const { id = '' } = useParams()
  const [up, setUp] = useState<Upload | null>(null), [plan, setPlan] = useState<PlanDoc | null>(null)
  const [storey, setStorey] = useState<number | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false)
  // updated plans of a house that clients already see: what changes for them, and the note that goes with it
  const [pv, setPv] = useState<UpdatePreview | null>(null), [note, setNote] = useState(''), [notify, setNotify] = useState(true), [done, setDone] = useState<Published | null>(null), [focus, setFocus] = useState<number | null>(null)
  const isUpdate = !!up?.targetHouseId && up.status === 'review'
  useEffect(() => { if (isUpdate) api.uploadChanges(id).then(setPv).catch(() => setPv(null)); else setPv(null) }, [id, isUpdate, plan])
  const load = () => Promise.all([api.upload(id), api.uploadPlan(id)]).then(([u, p]) => { setUp(u); setPlan(p); setStorey(s => s ?? (p.storeys.find(x => x.storey === 1) ?? p.storeys[0])?.storey ?? 0) }).catch(e => setError(e.message))
  useEffect(() => { load() }, [id])
  useEffect(() => { if (up) document.title = `Review ${up.fileName} · Planwalk` }, [up])
  const st = useMemo(() => plan?.storeys.find(s => s.storey === storey) ?? null, [plan, storey])
  if (error) return <main className="wrap dash"><p className="bad">{error}</p><Link to="/app">Back to projects</Link></main>
  if (!up || !plan || !st) return <main className="wrap app-loading">Loading…</main>

  const edit = async (b: Parameters<typeof api.editPlan>[1]) => { setBusy(true); try { await api.editPlan(id, b); await load() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  const publish = async () => { setBusy(true); try { const u = await api.publishUpload(id, isUpdate ? { note: note.trim() || undefined, notify } : {}); setUp(u); if (u.published && u.published.number > 1) setDone(u.published) } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  const unsureRooms = plan.storeys.reduce((n, s) => n + s.rooms.filter(r => !r.outdoor && r.from === 'guess').length, 0)
  const unsureOpenings = plan.storeys.reduce((n, s) => n + s.openings.filter(o => !o.sure).length, 0)
  const [x1, y1, x2, y2] = st.bounds, pad = 60
  const sc = plan.scale

  return (
    <main className="wrap review">
      <header>
        <Link to={`/app/p/${up.projectId}`} className="back">← Project</Link>
        <div className="eyebrow">Review · {up.fileName}</div>
        <h1>What we understood from the plans</h1>
        <p className="lede">
          {sc.from === 'drawing' ? <>Read from the CAD drawing itself: real dimensions, no scale to guess. </> : sc.from === 'dimensions' ? <>Scale taken from <b>{sc.agree}</b> written dimensions{sc.written && Math.abs(72 / 2.54 / sc.written / sc.ptPerCm - 1) > .03 ? <> (the sheet says 1:{sc.written}, but it is not plotted to that scale)</> : null}. </> : <>No dimensions could be read; the scale is assumed. </>}
          {unsureRooms + unsureOpenings === 0 ? 'Nothing needs your attention.' : <>
            {unsureRooms > 0 && <><b>{unsureRooms}</b> room{unsureRooms === 1 ? ' has' : 's have'} no name on the plans. </>}
            {unsureOpenings > 0 && <><b>{unsureOpenings}</b> opening{unsureOpenings === 1 ? '' : 's'} could be a window or a glass door. </>}
            Check them below.
          </>}
        </p>
        <div className="actions">
          {up.houseId && <Link className="btn" to={`/h/${up.houseId}`} target="_blank">Walk through it in 3D ↗</Link>}
          {!isUpdate && <button className="btn primary" disabled={busy || up.status === 'ready'} onClick={publish}>{up.status === 'ready' ? 'Approved ✓' : 'Approve — ready to share'}</button>}
          <span className="saving" role="status">{busy ? 'Saving and rebuilding the model…' : ''}</span>
        </div>
      </header>

      {done && (
        <section className="update done" role="status">
          <h2>Version {done.number} is live</h2>
          <p>{done.notified > 0 ? `${done.notified} client${done.notified === 1 ? ' was' : 's were'} emailed.` : 'No email was sent.'} When they open the home they see what changed, with a before / after switch. Their choices and notes were kept.</p>
          <div className="actions">
            <a className="btn" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`עדכנתי את התוכנית (גרסה ${done.number}). אפשר להיכנס ולראות מה השתנה:\n${done.link}`)}`}>Tell them on WhatsApp</a>
            <Link className="btn" to={`/h/${done.houseId}`} target="_blank">Open the walkthrough ↗</Link>
            <Link className="btn" to={`/app/p/${up.projectId}`}>Back to the project</Link>
          </div>
        </section>
      )}
      {isUpdate && pv && (
        <section className="update">
          <h2>Version {pv.number} of {pv.target.title}: what your client will see</h2>
          <p className="lede">{pv.changes.changes.length === 0 ? 'Nothing a client would notice changed against the current version.' : <><b>{pv.changes.changes.length}</b> change{pv.changes.changes.length === 1 ? '' : 's'} against version {pv.target.version}{pv.changes.area.before !== pv.changes.area.after ? <> · indoor area {pv.changes.area.before} → {pv.changes.area.after} m²</> : null}. Click one to see it on the plan.</>}</p>
          {pv.changes.changes.length > 0 && <ul className="chlist" dir="rtl">{pv.changes.changes.map((c, i) => (
            <li key={i}><button className={focus === i ? 'on' : ''} onClick={() => { setFocus(i); setStorey(c.storey) }}><b>{c.where}</b> {c.what}</button></li>
          ))}</ul>}
          {pv.designs.length > 0 && <>
            <h3>Saved choices</h3>
            <ul className="carry">{pv.designs.map(d => (
              <li key={d.designId} dir="ltr"><b><bdi>{d.author ?? 'Someone'}</bdi></b>, “<bdi>{d.name}</bdi>” — {d.kept} choice{d.kept === 1 ? '' : 's'} carried over{d.dropped.length ? <>, <span className="bad">{d.dropped.length} no longer fit{d.dropped.length === 1 ? 's' : ''}</span></> : ''}
                {d.dropped.length > 0 && <ul dir="rtl">{d.dropped.map((x, i) => <li key={i}>{x.what}</li>)}</ul>}</li>
            ))}</ul>
          </>}
          <label htmlFor="vnote">Message to the client <small>(optional, in your words)</small></label>
          <textarea id="vnote" rows={3} maxLength={2000} dir="auto" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. הגדלנו את חדר הילדים כמו שביקשתם, והחלון בסלון רחב יותר" />
          <label className="check"><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /> Email {pv.clients === 0 ? 'the clients (none invited yet)' : pv.clients === 1 ? 'the client' : `the ${pv.clients} clients`} that the plans were updated</label>
          <div className="actions">
            <button className="btn primary" disabled={busy} onClick={publish}>{busy ? 'Publishing…' : `Publish version ${pv.number}`}</button>
            <span className="fine">Until you publish, clients keep seeing version {pv.target.version}.</span>
          </div>
        </section>
      )}

      {plan.warnings.length > 0 && <ul className="warn">{plan.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}

      <div className="tabs" role="tablist">
        {[...plan.storeys].sort((a, b) => b.storey - a.storey).map(s => <button key={s.storey} role="tab" aria-selected={s.storey === storey} className="tab" onClick={() => setStorey(s.storey)}>{s.name}</button>)}
      </div>

      <div className="rgrid">
        <figure className="sheet">
          <svg viewBox={`${x1 - pad} ${y1 - pad} ${x2 - x1 + 2 * pad} ${y2 - y1 + 2 * pad}`} role="img" aria-label={`${st.name}: rooms, walls and openings`}>
            {st.rooms.map((r, i) => r.outdoor ? null : r.tiles.map((t, k) => <rect key={`${i}-${k}`} x={t[0]} y={t[1]} width={t[2] - t[0]} height={t[3] - t[1]} fill={r.void ? '#f1f5f9' : TINT[i % TINT.length]} />))}
            {st.stairs.map((s, i) => s.treads.map((t, k) => <rect key={`s${i}-${k}`} x={t[0]} y={t[1]} width={t[2] - t[0]} height={t[3] - t[1]} className="tread" />))}
            {st.walls.map((p, i) => <polygon key={i} points={p.map(q => q.join(',')).join(' ')} className="wall" />)}
            {st.railings.map((r, i) => <rect key={`r${i}`} x={r[0] - 2} y={r[1] - 2} width={r[2] - r[0] + 4} height={r[3] - r[1] + 4} className="rail" />)}
            {st.openings.map((o, i) => (
              <rect key={`o${i}`} x={o.rect[0]} y={o.rect[1]} width={o.rect[2] - o.rect[0]} height={o.rect[3] - o.rect[1]}
                className={`op op-${o.kind}${o.sure ? '' : ' unsure'}`} tabIndex={o.kind === 'door' ? -1 : 0} role={o.kind === 'door' ? undefined : 'button'}
                aria-label={o.kind === 'door' ? undefined : `${KIND[o.kind]} — switch to ${o.kind === 'window' ? 'glass door' : 'window'}`}
                onClick={() => o.kind !== 'door' && !busy && edit({ openings: [{ storey: st.storey, index: i, kind: o.kind === 'window' ? 'glass-door' : 'window' }] })}
                onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && o.kind !== 'door' && !busy) { e.preventDefault(); edit({ openings: [{ storey: st.storey, index: i, kind: o.kind === 'window' ? 'glass-door' : 'window' }] }) } }}>
                <title>{KIND[o.kind]}{o.sure ? '' : ' (guess)'}{o.kind === 'door' ? '' : ' — click to switch'}</title>
              </rect>
            ))}
            {isUpdate && pv?.changes.changes.map((c, i) => c.storey === st.storey ? <rect key={`c${i}`} x={c.rect[0] - 8} y={c.rect[1] - 8} width={c.rect[2] - c.rect[0] + 16} height={c.rect[3] - c.rect[1] + 16} rx={6} className={'chg' + (focus === i ? ' on' : '')} onClick={() => setFocus(i)}><title>{c.where}: {c.what}</title></rect> : null)}
            {st.rooms.map((r, i) => r.at && !r.outdoor ? <text key={`t${i}`} x={r.at[0]} y={r.at[1]} className={`rname${r.from === 'guess' ? ' unsure' : ''}`}>{r.name}{r.from === 'guess' ? ' ?' : ''}</text> : null)}
          </svg>
          <figcaption>
            <span><i className="k k-wall" />Wall</span><span><i className="k k-door" />Door</span><span><i className="k k-window" />Window</span><span><i className="k k-glass" />Glass door</span><span><i className="k k-rail" />Railing</span><span><i className="k k-stair" />Stairs</span>
            <span className="hint">Dashed = our guess. Click a window or glass door to switch it.</span>
          </figcaption>
        </figure>

        <aside>
          <h2>Rooms</h2>
          <ul className="rooms">
            {st.rooms.map((r, i) => r.outdoor ? null : (
              <li key={i} className={r.from === 'guess' ? 'unsure' : ''}>
                <i className="sw" style={{ background: r.void ? '#f1f5f9' : TINT[i % TINT.length] }} />
                <input defaultValue={r.name} key={r.name} aria-label={`Name of room ${i + 1}`} disabled={busy}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== r.name) edit({ rooms: [{ storey: st.storey, index: i, name: v }] }) }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                <span className="num">{r.area.toFixed(1)} m²</span>
                <em>{r.from === 'label' ? 'from the plan' : r.from === 'split' ? 'open space, divided' : 'no name written'}</em>
              </li>
            ))}
          </ul>
          <h2>Openings</h2>
          <p className="counts">{st.openings.filter(o => o.kind === 'door').length} doors · {st.openings.filter(o => o.kind === 'window').length} windows · {st.openings.filter(o => o.kind === 'glass-door').length} glass doors{st.openings.some(o => !o.sure) ? <> · <b>{st.openings.filter(o => !o.sure).length} to check</b></> : null}</p>
          <p className="fine">Outdoor spaces: {st.rooms.filter(r => r.outdoor).map(r => r.name).join(', ') || 'none'}. Stairs: {st.stairs.length ? `${st.stairs[0].treads.length} steps` : 'none on this storey'}.</p>
        </aside>
      </div>
    </main>
  )
}
