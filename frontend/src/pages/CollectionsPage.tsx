import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FolderHeart, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useParams } from 'react-router-dom'
import { Dialog, Button, EmptyPanel, ErrorPanel, Input, LoadingPanel, PageHeading } from '../components/Primitives'
import { RepositoryCard } from '../components/RepositoryCard'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import type { Collection } from '../lib/types'

const colors = ['violet', 'blue', 'green', 'amber', 'rose']

export function CollectionsPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const showToast = useToast()
  const collections = useQuery({ queryKey: ['collections'], queryFn: api.collections })
  const repositories = useQuery({
    queryKey: ['collection-repositories', id],
    queryFn: () => api.collectionRepositories(id!),
    enabled: Boolean(id),
  })
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Collection | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState('violet')

  useEffect(() => {
    if (dialog === 'create') { setName(''); setColor('violet') }
    if (dialog === 'edit' && selected) { setName(selected.name); setColor(selected.color) }
  }, [dialog, selected])

  const save = useMutation({
    mutationFn: () => selected && dialog === 'edit'
      ? api.updateCollection(selected.id, name.trim(), color)
      : api.createCollection(name.trim(), color),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['collections'] })
      setDialog(null)
      setSelected(null)
      showToast(dialog === 'edit' ? 'Collection updated' : 'Collection created')
    },
    onError: (error) => showToast(error.message || 'Could not save this collection.', 'error'),
  })
  const remove = useMutation({
    mutationFn: (collectionId: string) => api.deleteCollection(collectionId),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['collections'] }), queryClient.invalidateQueries({ queryKey: ['collection-repositories'] })])
      setDeleteTarget(null)
      if (id) window.location.assign('/app/collections')
      showToast('Collection deleted')
    },
    onError: () => showToast('Could not delete this collection.', 'error'),
  })

  if (id) {
    const collection = collections.data?.find((item) => item.id === id)
    if (collections.isPending) return <div className="page-stack"><LoadingPanel label="Loading collection" /></div>
    if (!collection) return <div className="page-stack"><Link className="back-link" to="/app/collections"><ArrowLeft size={15} />All collections</Link><EmptyPanel title="Collection not found" detail="It may have been deleted or is no longer available." /></div>
    return (
      <div className="page-stack">
        <Link className="back-link" to="/app/collections"><ArrowLeft size={15} />All collections</Link>
        <PageHeading eyebrow="YOUR WORKSPACE" title={collection.name} description={collection.description || 'A local group for the repositories you want to keep together.'} action={<div className="collection-header-actions"><Button variant="quiet" icon={<MoreHorizontal size={16} />} onClick={() => { setSelected(collection); setDialog('edit') }}>Edit</Button><Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setDeleteTarget(collection)}>Delete</Button></div>} />
        {repositories.isPending ? <LoadingPanel label="Loading collection repositories" /> : repositories.isError ? <ErrorPanel detail={repositories.error.message} onRetry={() => void repositories.refetch()} /> : repositories.data.items.length ? (
          <div className="repository-grid">{repositories.data.items.map((repository) => <RepositoryCard key={repository.id} repository={repository} />)}</div>
        ) : <EmptyPanel title="This collection is empty" detail="Add a repository from its detail page to build your own project group." action={<Link className="button button-secondary button-small" to="/app/repositories">Browse repositories</Link>} />}
        <CollectionDialog dialog={dialog} setDialog={setDialog} name={name} setName={setName} color={color} setColor={setColor} save={save} />
        <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => remove.mutate(deleteTarget!.id)} loading={remove.isPending} />
      </div>
    )
  }

  return (
    <div className="page-stack">
      <PageHeading eyebrow="LOCAL ORGANIZATION" title="Collections" description="Group repositories in your DevPulse workspace. These groups do not change anything on GitHub." action={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setDialog('create')}>New collection</Button>} />
      {collections.isPending ? <LoadingPanel label="Loading your collections" /> : collections.isError ? <ErrorPanel detail={collections.error.message} onRetry={() => void collections.refetch()} /> : collections.data.length ? (
        <div className="collection-grid">{collections.data.map((collection, index) => (
          <motion.article key={collection.id} className="collection-card panel" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .04 }}>
            <div className="collection-card-top"><span className={'collection-icon icon-' + collection.color}><FolderHeart size={18} /></span><button className="icon-button" aria-label={'Edit ' + collection.name} onClick={() => { setSelected(collection); setDialog('edit') }}><MoreHorizontal size={17} /></button></div>
            <Link to={'/app/collections/' + collection.id} className="collection-card-title">{collection.name}</Link>
            <p>{collection.description || 'No description provided.'}</p>
            <div className="collection-card-footer"><span>{collection.repository_count} {collection.repository_count === 1 ? 'repository' : 'repositories'}</span><Link to={'/app/collections/' + collection.id}>Open collection <ArrowLeft size={14} className="arrow-forward" /></Link></div>
          </motion.article>
        ))}</div>
      ) : <EmptyPanel title="Make a space for each kind of work" detail="Collections are private groups stored in this DevPulse account. Create one to start organizing your repositories." action={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setDialog('create')}>Create your first collection</Button>} />}
      <CollectionDialog dialog={dialog} setDialog={setDialog} name={name} setName={setName} color={color} setColor={setColor} save={save} />
    </div>
  )
}

function CollectionDialog({ dialog, setDialog, name, setName, color, setColor, save }: {
  dialog: 'create' | 'edit' | null
  setDialog: (value: 'create' | 'edit' | null) => void
  name: string
  setName: (value: string) => void
  color: string
  setColor: (value: string) => void
  save: { mutate: () => void; isPending: boolean }
}) {
  return (
    <AnimatePresence>
      {dialog && <Dialog title={dialog === 'edit' ? 'Edit collection' : 'Create a collection'} description="A simple way to group projects in your DevPulse workspace." onClose={() => setDialog(null)} footer={<><Button variant="quiet" onClick={() => setDialog(null)}>Cancel</Button><Button variant="primary" onClick={() => save.mutate()} disabled={!name.trim()} loading={save.isPending}>{dialog === 'edit' ? 'Save changes' : 'Create collection'}</Button></>}>
        <label className="form-label">Collection name<Input autoFocus maxLength={80} placeholder="e.g. Open source" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <div className="form-label">Color <div className="color-options" role="group" aria-label="Collection color">{colors.map((item) => <button key={item} type="button" className={'color-choice color-' + item + (color === item ? ' is-selected' : '')} onClick={() => setColor(item)} aria-label={item + ' color'} aria-pressed={color === item}><span /></button>)}</div></div>
      </Dialog>}
    </AnimatePresence>
  )
}

function DeleteDialog({ target, onClose, onConfirm, loading }: { target: Collection | null; onClose: () => void; onConfirm: () => void; loading: boolean }) {
  return (
    <AnimatePresence>
      {target && <Dialog title="Delete this collection?" description={'“' + target.name + '” will be removed from your DevPulse workspace. Your GitHub repositories will not change.'} onClose={onClose} footer={<><Button variant="quiet" onClick={onClose}>Keep collection</Button><Button variant="danger" onClick={onConfirm} loading={loading}>Delete collection</Button></>}>
        <p className="dialog-body-copy">Repository favorites and GitHub data are not affected.</p>
      </Dialog>}
    </AnimatePresence>
  )
}
