// The policy-wording knowledge base, embedded exactly as the Policy KB Ingestion workflow does it,
// and searched with the same filter, ordering and limit as the pipeline's pgvector query.
import { readFileSync } from 'node:fs'
import { evalParam, runCodeNode } from './n8n.mjs'

const parseBody = b => (typeof b === 'string' ? JSON.parse(b) : b)

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/**
 * docsPath: optional JSON array of { document_type, source, line, text, tenant_id } to evaluate
 * against a client's real wording. By default the documents come from the ingestion workflow.
 */
export async function buildKnowledgeBase({ ingestion, gemini, docsPath }) {
  const docs = docsPath
    ? JSON.parse(readFileSync(docsPath, 'utf8'))
    : runCodeNode(ingestion.node('Policy Documents'))
  const embedNode = ingestion.node('Embed Chunk (Gemini)')

  const rows = []
  for (const doc of docs) {
    const ctx = { json: doc }
    const res = await gemini.post(evalParam(embedNode.parameters.url, ctx), parseBody(evalParam(embedNode.parameters.jsonBody, ctx)))
    rows.push({
      tenant_id: doc.tenant_id || null, // the upsert stores NULLIF($1, '')
      document_type: doc.document_type,
      source: doc.source,
      line_of_business: doc.line,
      chunk_text: doc.text,
      embedding: res.json.embedding.values,
      active: true,
    })
  }

  return {
    size: rows.length,
    sources: rows.map(r => r.source),
    /**
     * WHERE active AND (tenant_id = $1 OR tenant_id IS NULL) ORDER BY embedding <=> $2 LIMIT n.
     * Similarity is 1 - cosine distance, matching the SQL. pgvector's HNSW index is approximate;
     * at this size an exact scan returns the same rows.
     */
    search(tenantId, vector, limit) {
      return rows
        .filter(r => r.active && (r.tenant_id === null || r.tenant_id === tenantId))
        .map(r => ({ chunk_text: r.chunk_text, document_type: r.document_type, source: r.source, similarity: cosine(r.embedding, vector) }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
    },
  }
}
