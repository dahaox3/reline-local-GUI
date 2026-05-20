import {ColorDetectMode, DType, ModelCacheMode, NodeType, ReaderNodeMode, ResizeFilterType} from "~/types/enums";
import type {StackNode} from "~/types/node";
import {FolderReaderNodeOptions, LevelNodeOptions, ResizeNodeOptions, ScreentoneNodeOptions, UpscaleNodeOptions} from "~/types/options";

export function migrateNodes(nodes: StackNode[]): StackNode[] {
    let availableModels: string[] = [];
    try {
        const stored = localStorage.getItem("reline_models");
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed.models)) {
                availableModels = parsed.models;
            }
        }
    } catch (e) {
        console.warn("Failed to read reline_models from localStorage:", e);
    }
    return nodes.map((node) => {
        if (node.type === NodeType.RESIZE) {
            const options = node.options as ResizeNodeOptions;
            const filterValue = options.filter;

            if (!Object.values(ResizeFilterType).includes(filterValue)) {
                return {
                    ...node,
                    options: {
                        ...options,
                        filter: ResizeFilterType.CUBIC_MITCHELL,
                    },
                };
            }
        }
        if (node.type === NodeType.FOLDER_READER) {
            const options = node.options as FolderReaderNodeOptions;
            const modeValue = options.mode;

            if (!Object.values(ReaderNodeMode).includes(modeValue)) {
                return {
                    ...node,
                    options: {
                        ...options,
                        mode: ReaderNodeMode.DYNAMIC,
                    },
                };
            }
        }
        if (node.type === NodeType.LEVEL) {
            const options = node.options as LevelNodeOptions;
            return {
                ...node,
                options: {
                    ...options,
                    skip_on_color: options.skip_on_color ?? false,
                },
            };
        }
        if (node.type === NodeType.SCREENTONE) {
            const options = node.options as ScreentoneNodeOptions;
            return {
                ...node,
                options: {
                    ...options,
                    skip_on_color: options.skip_on_color ?? true,
                },
            };
        }
        if (node.type === NodeType.UPSCALE) {
            const options = node.options as UpscaleNodeOptions;
            let dtypeValue = options.dtype;
            let modelPath = options.model ?? "";
            let modelName = modelPath.split(/[\\/]/).pop() ?? "";
            let isOwn;
            const normalizeModelName = (value?: string) => {
                const rawValue = value ?? "";
                const name = rawValue.split(/[\\/]/).pop() ?? "";
                return availableModels.includes(name) ? name : rawValue;
            };
            if (modelPath.startsWith("/content/models/")) {
                modelPath = modelName;
            }
            if (availableModels.includes(modelName)) {
                isOwn = false;
                modelPath = modelName;
            } else {
                isOwn = true;
            }

            if (!Object.values(DType).includes(dtypeValue)) {
                dtypeValue = DType.F32;
            }

            return {
                ...node,
                options: {
                    ...options,
                    model: modelPath,
                    is_own_model: isOwn,
                    dtype: dtypeValue,
                    auto_detect_color: options.auto_detect_color ?? false,
                    color_model: normalizeModelName(options.color_model),
                    gray_model: normalizeModelName(options.gray_model),
                    color_detect_mode: Object.values(ColorDetectMode).includes(options.color_detect_mode)
                        ? options.color_detect_mode
                        : ColorDetectMode.AUTO,
                    model_cache_mode: Object.values(ModelCacheMode).includes(options.model_cache_mode)
                        ? options.model_cache_mode
                        : ModelCacheMode.LOW_MEMORY,
                },
            };


        }


        return node;
    });
}
