import type { ConvertToPureFunction, ConvertToStackFunction } from "~/lib/convert/index.ts"
import type { PureUpscaleNodeOptions, UpscaleNodeOptions } from "~/types/options"
import { ColorDetectMode, ModelCacheMode, NodeType, PureNodeType } from "~/types/enums"
import { DEFAULT_COLLAPSED, DEFAULT_MODEL } from "~/constants"

const getModelFolderPath = () => {
  const saved = localStorage.getItem("reline_models")
  return saved ? JSON.parse(saved).folderPath : ""
}

const isPathLike = (model: string) => /[\\/]/.test(model) || /^[A-Za-z]:/.test(model)

const resolveFolderModel = (model: string | undefined, folderPath: string) => {
  if (!model || model === DEFAULT_MODEL) {
    return ""
  }
  if (!folderPath || isPathLike(model)) {
    return model
  }
  return `${folderPath}\\${model}`
}

export const convertUpscaleToPure: ConvertToPureFunction = (nodes, index) => {
  const result = []
  const node = nodes[index]
  const { is_own_model, model: rawModel, color_model, gray_model, ...options } = node.options as UpscaleNodeOptions
  const folderPath = getModelFolderPath()
  const resolvedColorModel = resolveFolderModel(color_model, folderPath)
  const resolvedGrayModel = resolveFolderModel(gray_model, folderPath)
  if (is_own_model) {
    result.push({
      type: PureNodeType.UPSCALE,
      options: {
        model: rawModel,
        target_scale: options.target_scale,
        color_model: resolvedColorModel,
        gray_model: resolvedGrayModel,
        ...options,
      },
    })
  } else {
    const modelPath = resolveFolderModel(rawModel, folderPath)
    result.push({
      type: PureNodeType.UPSCALE,
      options: {
        model: modelPath,
        target_scale: options.target_scale,
        color_model: resolvedColorModel,
        gray_model: resolvedGrayModel,
        ...options,
      }
    })
  }
  return [result, index + 1]
}

export const convertUpscaleToStack: ConvertToStackFunction = (nodes, index) => {
  const node = nodes[index]
  const options = node.options as PureUpscaleNodeOptions
  return [
    [
      {
        id: index,
        type: NodeType.UPSCALE,
        options: {
          ...options,
          target_scale: options.target_scale ?? undefined,
          auto_detect_color: options.auto_detect_color ?? false,
          color_model: options.color_model ?? "",
          gray_model: options.gray_model ?? "",
          color_detect_mode: options.color_detect_mode ?? ColorDetectMode.AUTO,
          model_cache_mode: options.model_cache_mode ?? ModelCacheMode.LOW_MEMORY,
          is_own_model: true,
        },
        collapsed: DEFAULT_COLLAPSED,
      },
    ],
    index + 1,
  ]
}
