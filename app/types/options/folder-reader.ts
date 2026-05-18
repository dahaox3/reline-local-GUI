import { z } from "zod"
import { ReaderNodeMode } from "~/types/enums.ts"

export interface PureFolderReaderNodeOptions {
  path: string
  mode: ReaderNodeMode
  recursive: boolean
  skip_existing_in: string
}

export const folderReaderOptionsSchema = z.object({
  path: z.string(),
  mode: z.nativeEnum(ReaderNodeMode),
  recursive: z.boolean(),
  skip_existing_in: z.string().default(""),
})

export type FolderReaderNodeOptions = z.infer<typeof folderReaderOptionsSchema>
