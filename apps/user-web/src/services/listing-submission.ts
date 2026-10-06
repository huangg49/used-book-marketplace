import { z } from 'zod'
import { session } from './api'

const receipt = z.object({ entityId: z.string().uuid(), version: z.number().int() })
const media = z.object({ id: z.string().uuid(), version: z.number().int(), status: z.enum(['Pending', 'Processing', 'Ready', 'Failed']) })
const ticket = z.object({ path: z.string(), headers: z.record(z.string(), z.string()) })
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const key = () => crypto.randomUUID()

export type ListingInput = { title: string; author: string; category: string; condition: 'LikeNew' | 'Good' | 'Fair' | 'Worn'; pages: string; coverNote: string; notes: string; accessories: string; description: string; mode: 'Sale' | 'Exchange' | 'Both'; salePrice: number | null; exchangeValue: number | null; files: File[] }

async function upload(listingId: string, expectedVersion: number, file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10_000_000) throw new Error('Ảnh cần là JPEG, PNG hoặc WebP và không quá 10 MB.')
  const bytes = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('')
  const created = await session.request(`/listings/${listingId}/media`, receipt, { method: 'POST', headers: { 'Idempotency-Key': key() }, body: JSON.stringify({ expectedVersion, mimeType: file.type, byteSize: file.size, sha256 }) })
  const base = `/listings/${listingId}/media/${created.entityId}`
  const grant = await session.request(`${base}/upload-ticket`, ticket)
  await session.request(grant.path, z.unknown(), { method: 'PUT', headers: { ...grant.headers, 'Idempotency-Key': key() }, body: bytes }, 120_000)
  let current = await session.request(`/me${base}`, media)
  await session.request(`${base}/finalize`, receipt, { method: 'POST', headers: { 'Idempotency-Key': key() }, body: JSON.stringify({ expectedVersion: current.version }) })
  for (let attempt = 0; attempt < 30; attempt += 1) { current = await session.request(`/me${base}`, media); if (current.status === 'Ready') return current.id; if (current.status === 'Failed') throw new Error('Ảnh không đạt yêu cầu xử lý.'); await wait(1000) }
  throw new Error('Ảnh đang xử lý, hãy thử gửi lại sau ít phút.')
}

export async function submitListing(input: ListingInput) {
  if (!input.files.length) throw new Error('Cần ít nhất một ảnh sách.')
  const catalog = await session.request('/catalog/requests', receipt, { method: 'POST', headers: { 'Idempotency-Key': key() }, body: JSON.stringify({ metadata: { title: input.title.trim(), authors: [input.author.trim()], publisher: null, publicationYear: null, language: 'vi', edition: null, category: input.category.trim() || 'Khác', isbn: null } }) })
  const draft = await session.request('/listings', receipt, { method: 'POST', headers: { 'Idempotency-Key': key() }, body: JSON.stringify({ content: { bookId: null, mode: null, condition: null, pages: '', coverNote: '', notes: '', accessories: '', description: '', readable: null, hasMissingPages: null, missingEssentialContent: null, salePrice: null, exchangeValue: null, mediaIds: [] } }) })
  const mediaIds: string[] = []
  for (const file of input.files.slice(0, 8)) mediaIds.push(await upload(draft.entityId, draft.version, file))
  const saved = await session.request(`/listings/${draft.entityId}/draft`, receipt, { method: 'PUT', headers: { 'Idempotency-Key': key() }, body: JSON.stringify({ expectedVersion: draft.version, content: { bookId: catalog.entityId, mode: input.mode, condition: input.condition, pages: input.pages, coverNote: input.coverNote, notes: input.notes, accessories: input.accessories, description: input.description, readable: true, hasMissingPages: false, missingEssentialContent: false, salePrice: input.salePrice, exchangeValue: input.exchangeValue, mediaIds } }) })
  await session.request(`/listings/${draft.entityId}/submit`, receipt, { method: 'POST', headers: { 'Idempotency-Key': key() }, body: JSON.stringify({ expectedVersion: saved.version, ownershipDeclared: true }) })
  return draft.entityId
}
