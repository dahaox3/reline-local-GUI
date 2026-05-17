import { z } from "zod"
import { WriterNodeFormat } from "~/types/enums.ts"

export interface PureApiSnapshotNodeOptions {
  path: string
  format: WriterNodeFormat
}

export const apiSnapshotOptionsSchema = z.object({
  path: z.string(),
  format: z.nativeEnum(WriterNodeFormat),
})

export type ApiSnapshotNodeOptions = z.infer<typeof apiSnapshotOptionsSchema>
