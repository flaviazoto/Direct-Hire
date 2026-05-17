'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { adminApi } from '@/lib/api-client'
import { C, inputStyle } from '@/lib/admin-theme'
import { Pencil, Check, X, ChevronLeft, ChevronRight, Plus } from 'lucide-react'

type Skill = {
  id: string
  name: string
  category: string
  aliases: string[]
  is_active: boolean
  created_at: string
}

type Toast = { msg: string; ok: boolean }

const PAGE_SIZE = 50

export default function AdminSkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<Toast | null>(null)

  // filters
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [page, setPage] = useState(1)

  // add form
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addCategory, setAddCategory] = useState('')
  const [addAliases, setAddAliases] = useState('')
  const [addSaving, setAddSaving] = useState(false)

  // edit state: { [id]: partial skill fields }
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editAliases, setEditAliases] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // deactivation confirm
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await adminApi.listSkills()
    if (res.success && res.data) {
      setSkills(res.data as Skill[])
    } else {
      showToast('Failed to load skills', false)
    }
    setLoading(false)
  }, [showToast])

  useEffect(() => { load() }, [load])

  const categories = useMemo(() => {
    const s = new Set(skills.map(sk => sk.category))
    return Array.from(s).sort()
  }, [skills])

  const filtered = useMemo(() => {
    return skills.filter(sk => {
      if (categoryFilter && sk.category !== categoryFilter) return false
      if (statusFilter === 'active' && !sk.is_active) return false
      if (statusFilter === 'inactive' && sk.is_active) return false
      if (search) {
        const q = search.toLowerCase()
        if (!sk.name.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [skills, search, categoryFilter, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => { setPage(1) }, [search, categoryFilter, statusFilter])

  // stats
  const totalActive = skills.filter(s => s.is_active).length
  const totalInactive = skills.length - totalActive
  const catCounts = useMemo(() => {
    const m: Record<string, number> = {}
    skills.filter(s => s.is_active).forEach(s => { m[s.category] = (m[s.category] ?? 0) + 1 })
    return m
  }, [skills])

  async function handleAdd() {
    const name = addName.trim()
    const category = addCategory.trim()
    if (!name || !category) return
    const aliases = addAliases.split(',').map(a => a.trim()).filter(Boolean)
    setAddSaving(true)
    const res = await adminApi.createSkill({ name, category, aliases })
    if (res.success) {
      showToast('Skill created', true)
      setAddName(''); setAddCategory(''); setAddAliases('')
      setShowAdd(false)
      load()
    } else {
      showToast((res as any).error ?? 'Failed to create skill', false)
    }
    setAddSaving(false)
  }

  function startEdit(sk: Skill) {
    setEditId(sk.id)
    setEditName(sk.name)
    setEditCategory(sk.category)
    setEditAliases(sk.aliases.join(', '))
    setConfirmId(null)
  }

  function cancelEdit() {
    setEditId(null)
    setEditSaving(false)
  }

  async function saveEdit(sk: Skill) {
    const name = editName.trim()
    const category = editCategory.trim()
    if (!name || !category) return
    const aliases = editAliases.split(',').map(a => a.trim()).filter(Boolean)
    setEditSaving(true)
    const res = await adminApi.updateSkill(sk.id, { name, category, aliases })
    if (res.success) {
      showToast('Skill updated', true)
      setEditId(null)
      load()
    } else {
      showToast((res as any).error ?? 'Failed to update skill', false)
    }
    setEditSaving(false)
  }

  async function toggleActive(sk: Skill) {
    if (sk.is_active) {
      setConfirmId(sk.id)
      return
    }
    const res = await adminApi.updateSkill(sk.id, { is_active: true })
    if (res.success) { showToast('Skill activated', true); load() }
    else showToast('Failed to activate skill', false)
  }

  async function confirmDeactivate(id: string) {
    const res = await adminApi.updateSkill(id, { is_active: false })
    if (res.success) { showToast('Skill deactivated', true); load() }
    else showToast('Failed to deactivate skill', false)
    setConfirmId(null)
  }

  const card: React.CSSProperties = {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 24,
  }

  const thStyle: React.CSSProperties = {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: C.muted,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: 'nowrap',
  }

  const tdStyle: React.CSSProperties = {
    padding: '12px 14px',
    fontSize: 13,
    color: C.text,
    borderBottom: `1px solid ${C.border}`,
    verticalAlign: 'middle',
  }

  const btnPrimary: React.CSSProperties = {
    background: C.blue,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  const btnGhost: React.CSSProperties = {
    background: 'transparent',
    color: C.muted,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    width: 'auto',
    padding: '7px 10px',
    fontSize: 13,
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 60px' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: toast.ok ? C.green : C.accent,
          color: '#fff', borderRadius: 10, padding: '10px 18px',
          fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Skills</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>Manage the global skills taxonomy</p>
        </div>
        <button style={btnPrimary} onClick={() => { setShowAdd(v => !v); setEditId(null) }}>
          <Plus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Add skill
        </button>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total skills', value: skills.length },
          { label: 'Active', value: totalActive },
          { label: 'Inactive', value: totalInactive },
          ...Object.entries(catCounts).slice(0, 5).map(([cat, n]) => ({ label: cat, value: n })),
        ].map(({ label, value }) => (
          <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{value}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ ...card, padding: 20, marginBottom: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: '0 0 14px' }}>New skill</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Name *</label>
              <input
                style={inputStyle}
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="e.g. Welding"
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Category *</label>
              <input
                style={inputStyle}
                list="cat-datalist"
                value={addCategory}
                onChange={e => setAddCategory(e.target.value)}
                placeholder="e.g. Construction"
              />
              <datalist id="cat-datalist">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Aliases (comma-separated)</label>
              <input
                style={inputStyle}
                value={addAliases}
                onChange={e => setAddAliases(e.target.value)}
                placeholder="e.g. welder, arc welding"
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnPrimary} onClick={handleAdd} disabled={addSaving}>
                {addSaving ? 'Saving…' : 'Save'}
              </button>
              <button style={btnGhost} onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          style={{ ...inputStyle, width: 220 }}
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={selectStyle} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select style={selectStyle} value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <span style={{ fontSize: 12, color: C.muted, alignSelf: 'center' }}>
          {filtered.length} skill{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div style={card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 14 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 14 }}>No skills found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Aliases</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(sk => {
                const isEditing = editId === sk.id
                const isConfirming = confirmId === sk.id

                return (
                  <tr key={sk.id} style={{ background: isEditing ? C.cardHover : 'transparent' }}>
                    <td style={tdStyle}>
                      {isEditing ? (
                        <input
                          style={{ ...inputStyle, padding: '6px 10px', width: '100%' }}
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          autoFocus
                        />
                      ) : (
                        <span style={{ fontWeight: 500 }}>{sk.name}</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {isEditing ? (
                        <>
                          <input
                            style={{ ...inputStyle, padding: '6px 10px', width: '100%' }}
                            list="edit-cat-datalist"
                            value={editCategory}
                            onChange={e => setEditCategory(e.target.value)}
                          />
                          <datalist id="edit-cat-datalist">
                            {categories.map(c => <option key={c} value={c} />)}
                          </datalist>
                        </>
                      ) : (
                        <span style={{
                          display: 'inline-block',
                          background: 'rgba(255,255,255,0.07)',
                          borderRadius: 6,
                          padding: '2px 8px',
                          fontSize: 12,
                        }}>
                          {sk.category}
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: C.muted }}>
                      {isEditing ? (
                        <input
                          style={{ ...inputStyle, padding: '6px 10px', width: '100%' }}
                          value={editAliases}
                          onChange={e => setEditAliases(e.target.value)}
                          placeholder="comma-separated"
                        />
                      ) : (
                        sk.aliases.length > 0
                          ? sk.aliases.join(', ')
                          : <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-block',
                        borderRadius: 6,
                        padding: '2px 8px',
                        fontSize: 12,
                        fontWeight: 600,
                        background: sk.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(113,113,122,0.15)',
                        color: sk.is_active ? C.green : C.muted,
                      }}>
                        {sk.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            onClick={() => saveEdit(sk)}
                            disabled={editSaving}
                            style={{ ...btnPrimary, padding: '5px 10px', fontSize: 12 }}
                          >
                            <Check size={13} style={{ verticalAlign: 'middle' }} />
                            {editSaving ? ' Saving…' : ' Save'}
                          </button>
                          <button onClick={cancelEdit} style={{ ...btnGhost, padding: '5px 10px' }}>
                            <X size={13} style={{ verticalAlign: 'middle' }} /> Cancel
                          </button>
                        </div>
                      ) : isConfirming ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: C.muted }}>Hides from all forms globally.</span>
                          <button
                            onClick={() => confirmDeactivate(sk.id)}
                            style={{ ...btnGhost, padding: '5px 10px', color: C.accent, borderColor: C.accent }}
                          >
                            Confirm
                          </button>
                          <button onClick={() => setConfirmId(null)} style={{ ...btnGhost, padding: '5px 10px' }}>
                            No
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            onClick={() => startEdit(sk)}
                            style={{ ...btnGhost, padding: '5px 10px' }}
                            title="Edit"
                          >
                            <Pencil size={13} style={{ verticalAlign: 'middle' }} />
                          </button>
                          <button
                            onClick={() => toggleActive(sk)}
                            style={{
                              ...btnGhost,
                              padding: '5px 10px',
                              fontSize: 12,
                              color: sk.is_active ? C.muted : C.green,
                              borderColor: sk.is_active ? C.border : 'rgba(34,197,94,0.3)',
                            }}
                          >
                            {sk.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: -8 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ ...btnGhost, padding: '6px 10px', opacity: page === 1 ? 0.4 : 1 }}
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 13, color: C.muted }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ ...btnGhost, padding: '6px 10px', opacity: page === totalPages ? 0.4 : 1 }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
