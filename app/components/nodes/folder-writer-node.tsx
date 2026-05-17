import {useContext} from "react"
import {NodesContext, NodesDispatchContext} from "~/context/contexts.ts"
import {WriterNodeFormat} from "~/types/enums.ts"
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from "../ui/select"
import {Input} from "../ui/input"
import {Label} from "../ui/label"
import type {FolderWriterNodeOptions} from "~/types/options"
import {NodesActionType} from "~/types/actions.ts"
import {Button} from "../ui/button"
import {AlertTriangle, FolderOpen} from "lucide-react"

export function FolderWriterNodeBody({id}: { id: number }) {
    const nodes = useContext(NodesContext)
    const node = nodes.find((n) => n.id === id)
    if (!node) {
        return null
    }
    const options = node.options as FolderWriterNodeOptions
    const nodeIndex = nodes.findIndex((n) => n.id === id)
    const laterNodes = nodes.slice(nodeIndex + 1)
    const hasLaterNodes = laterNodes.length > 0
    const dispatch = useContext(NodesDispatchContext)
    const changeValue = (newOptions: Partial<FolderWriterNodeOptions>) => {
        dispatch({
            type: NodesActionType.CHANGE,
            payload: {
                ...node,
                options: {
                    ...options,
                    ...newOptions,
                },
            },
        })
    }
    return (
        <div className="flex flex-col gap-5">
            {hasLaterNodes && (
                <div className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        Writer is before {laterNodes.length} node{laterNodes.length > 1 ? "s" : ""}. In API mode those nodes run before output is written; in normal pipeline mode they may be skipped.
                    </span>
                </div>
            )}
            <div className="flex flex-col gap-2">
                <Label>Path to folder</Label>
                <div className="flex items-center gap-2">
                    <Input
                        placeholder="Path/to/folder"
                        value={options.path}
                        onChange={(e) => {
                            changeValue({path: e.target.value})
                        }}
                    />
                    <Button
                        variant="outline"
                        size="icon"
                        type="button"
                        title="Select folder"
                        onClick={async () => {
                            try {
                                const folderPath = await window.electronAPI.selectFolderPath()
                                if (folderPath) {
                                    changeValue({path: folderPath})
                                }
                            } catch (err) {
                                console.error("Folder selection cancelled or failed:", err)
                            }
                        }}
                    >
                        <FolderOpen/>
                    </Button>
                </div>
            </div>
            <div className="flex flex-col gap-2">
                <Label>API copy path</Label>
                <div className="flex items-center gap-2">
                    <Input
                        placeholder="Optional folder for API request copies"
                        value={options.api_output_path || ""}
                        onChange={(e) => {
                            changeValue({api_output_path: e.target.value})
                        }}
                    />
                    <Button
                        variant="outline"
                        size="icon"
                        type="button"
                        title="Select API copy folder"
                        onClick={async () => {
                            try {
                                const folderPath = await window.electronAPI.selectFolderPath()
                                if (folderPath) {
                                    changeValue({api_output_path: folderPath})
                                }
                            } catch (err) {
                                console.error("Folder selection cancelled or failed:", err)
                            }
                        }}
                    >
                        <FolderOpen/>
                    </Button>
                </div>
            </div>
            <div>
                <Label>Format</Label>
                <Select
                    onValueChange={(value) => {
                        changeValue({
                            format: value as WriterNodeFormat,
                        })
                    }}
                    value={options.format}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue/>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            {Object.values(WriterNodeFormat).map((type) => {
                                return (
                                    <SelectItem key={type} value={type}>
                                        {type}
                                    </SelectItem>
                                )
                            })}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}
