// The comments on one offering document (the deck), shared by the list under the viewer
// (InvestDocumentComments) and the markers and threads in it (InvestDeckCommentLayer):
// one load, one set of threads, so a comment written in either shows in both. What a
// viewer gets is decided on the server (server/utils/investComments.ts).
import type { MaybeRefOrGetter } from 'vue'

export type CommentVisibility = 'committee' | 'all'

export interface DocumentReply {
  id: string
  body: string
  public: boolean
  createdAt: string
  withdrawnAt: string | null
  mine: boolean
  author?: { name: string }
}

export interface DocumentCommentTarget {
  prefix?: string
  suffix?: string
  point?: { x: number; y: number; vw: number; vh: number }
  level?: 'block' | 'box' | 'part' | 'page'
}

export interface DocumentThread {
  id: string
  kind: 'question' | 'comment'
  visibility: CommentVisibility
  anchor: string | null
  slide: string | null
  anchorTitle: string | null
  target: DocumentCommentTarget | null
  quote: string | null
  body: string
  version: number
  createdAt: string
  withdrawnAt: string | null
  mine: boolean
  public: boolean
  replies: DocumentReply[]
  author?: { name: string }
}

export interface NewDocumentComment {
  kind: 'question' | 'comment'
  visibility: CommentVisibility
  body: string
  slide?: string | null
  anchor?: string | null
  quote?: string | null
  target?: DocumentCommentTarget | null
  /** Where it was written, for usage analytics only: the list's form or the deck. */
  from: 'form' | 'deck'
}

export function useDocumentComments(slug: MaybeRefOrGetter<string>, docKey: MaybeRefOrGetter<string>) {
  const { t, te } = useI18n()
  const { $posthog } = useNuxtApp()

  const loaded = ref(false)
  const canReply = ref(false)
  const version = ref(0)
  const outline = ref<{ id: string; title: string }[]>([])
  const threads = ref<DocumentThread[]>([])
  const defaultVisibility = ref<CommentVisibility>('committee')
  const publicShowsAuthor = ref(true)

  const base = computed(() => `/api/member/invest/${toValue(slug)}`)
  const listUrl = computed(() => `${base.value}/documents/${toValue(docKey)}/comments`)

  async function load() {
    const res = await $fetch<{
      canReply: boolean
      version: number
      outline: { id: string; title: string }[]
      threads: DocumentThread[]
      defaultVisibility: CommentVisibility
      publicShowsAuthor: boolean
    }>(listUrl.value)
    canReply.value = res.canReply
    version.value = res.version
    outline.value = res.outline
    threads.value = res.threads
    defaultVisibility.value = res.defaultVisibility
    publicShowsAuthor.value = res.publicShowsAuthor
    loaded.value = true
  }

  /** Writes a comment or question on the current version; the new thread's id. */
  async function add(input: NewDocumentComment): Promise<string> {
    const { from, ...body } = input
    const res = await $fetch<{ id: string }>(listUrl.value, { method: 'POST', body })
    $posthog?.capture?.('invest_document_comment_added', {
      slug: toValue(slug),
      key: toValue(docKey),
      kind: input.kind,
      visibility: input.visibility,
      from,
    })
    await load()
    return res.id
  }

  async function reply(threadId: string, body: string, isPublic: boolean) {
    await $fetch(`${base.value}/comments/${threadId}/reply`, { method: 'POST', body: { body, public: isPublic } })
    await load()
  }

  async function setPublic(replyId: string, value: boolean) {
    await $fetch(`${base.value}/comments/${replyId}/public`, { method: 'POST', body: { public: value } })
    await load()
  }

  async function withdraw(id: string) {
    await $fetch(`${base.value}/comments/${id}/withdraw`, { method: 'POST' })
    await load()
  }

  /** The server's error as words (its message is an i18n key). */
  function errorText(e: any): string {
    const key = e?.data?.message
    return key && te(key) ? t(key) : t('invest.comments.errors.unknown')
  }

  const answered = (th: DocumentThread) => th.replies.some((r) => !r.withdrawnAt)

  return {
    loaded,
    canReply,
    version,
    outline,
    threads,
    defaultVisibility,
    publicShowsAuthor,
    load,
    add,
    reply,
    setPublic,
    withdraw,
    errorText,
    answered,
  }
}

export type DocumentComments = ReturnType<typeof useDocumentComments>
