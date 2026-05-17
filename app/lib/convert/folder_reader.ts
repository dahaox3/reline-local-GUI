import type { ConvertToPureFunction, ConvertToStackFunction } from "~/lib/convert/index.ts"
import type { FolderReaderNodeOptions, PureFolderReaderNodeOptions, UpscaleNodeOptions } from "~/types/options"
import { NodeType, PureNodeType, ReaderNodeMode } from "~/types/enums.ts"
import { DEFAULT_COLLAPSED } from "~/constants.ts"

export const convertFolderReaderToPure: ConvertToPureFunction = (nodes, index) => {
  const result = []
  const node = nodes[index]
  const options = { ...(node.options as FolderReaderNodeOptions) }
  const hasColorAwareUpscale = nodes.some((item) => {
    return item.type === NodeType.UPSCALE && !!(item.options as UpscaleNodeOptions).auto_detect_color
  })

  if (hasColorAwareUpscale && options.mode === ReaderNodeMode.GRAY) {
    console.warn("auto_detect_color requires folder_reader dynamic mode; exporting dynamic instead of gray")
    options.mode = ReaderNodeMode.DYNAMIC
  }

  result.push({
    type: PureNodeType.FOLDER_READER,
    options,
  })

  return [result, index + 1]
}

export const convertFolderReaderToStack: ConvertToStackFunction = (nodes, index) => {
  const node = nodes[index]
  const options = node.options as PureFolderReaderNodeOptions
  return [
    [
      {
        id: index,
        type: NodeType.FOLDER_READER,
        options: {
          ...options,
        },
        collapsed: DEFAULT_COLLAPSED,
      },
    ],
    index + 1,
  ]
}
